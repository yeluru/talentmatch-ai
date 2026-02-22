import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';
import { useBulkUploadStore, type UploadResult } from '@/stores/bulkUploadStore';
import { retryWithBackoff, getUserFriendlyErrorMessage } from '@/lib/retryWithBackoff';
import { toast } from 'sonner';
import {
  logBulkUploadStart,
  logBulkUploadProgress,
  logBulkUploadComplete,
  logBulkUploadError,
  logResumeUpload,
  logRetryAttempt,
} from '@/lib/auditLog';
import {
  createUploadSession,
  updateUploadProgress,
  completeUploadSession,
  cancelUploadSession,
} from '@/lib/uploadProgress';
import {
  findIncompleteSession,
  getProcessedFileHashes,
  registerFileForProcessing,
  markFileProcessing,
  markFileCompleted,
  markFileFailed,
  markFileSkipped,
} from '@/lib/resumableUpload';

/**
 * Concurrency limit for file processing.
 *
 * Current: 5 (parallel processing)
 * - Processes 5 files simultaneously for faster throughput
 * - Each file has 60s timeout to prevent indefinite hangs
 * - Automatic retry once for failed files
 * - Processing speed: ~50-60 files/minute (5x faster than sequential)
 *
 * With 1000 files:
 * - Sequential (1): ~3-5 hours
 * - Parallel (5): ~30-60 minutes
 */
const FILE_PROCESSING_CONCURRENCY = 5;

/**
 * Timeout for individual file processing (milliseconds)
 * 60 seconds allows for large PDFs while preventing indefinite hangs
 */
const FILE_PROCESSING_TIMEOUT_MS = 60000;

/**
 * Shared hook for bulk resume upload: parse → storage → import into talent pool.
 * Used by Talent Pool (in-page upload + status bar) and by Talent Sourcing uploads section.
 * cancelUpload() stops processing remaining files; already-imported candidates stay in the pool.
 */
export function useBulkResumeUpload(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  const { uploadResults, setUploadResults, updateResult } = useBulkUploadStore();
  const clearResults = useBulkUploadStore((s) => s.clearResults);
  const cancelledRef = useRef(false);
  const runIdRef = useRef(0);
  const activeUploadsRef = useRef(new Set<number>());

  const cancelUpload = useCallback(async (uploadSessionId?: string) => {
    cancelledRef.current = true;
    if (uploadSessionId) {
      await cancelUploadSession(uploadSessionId);
    }
  }, []);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      if (!organizationId) {
        toast.error('Upload failed', {
          description: 'No organization context. Please log out and log back in.',
        });
        return;
      }

      // CRITICAL: Read all files IMMEDIATELY before any async operations
      // This prevents browser/cloud storage services (Dropbox, iCloud) from revoking file access
      const fileDataArray: { file: File; base64: string; hash: string }[] = [];
      for (const file of files) {
        try {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
          fileDataArray.push({ file, base64, hash });
        } catch (error: any) {
          // Check if it's a file access error (often caused by cloud storage)
          const isFileAccessError = error?.message?.includes('could not be read') ||
                                    error?.message?.includes('permission') ||
                                    error?.name === 'NotReadableError';
          if (isFileAccessError) {
            toast.error('File access denied', {
              description: `Cannot read "${file.name}". If this file is in Dropbox, iCloud, or OneDrive, please copy it to your local Downloads or Desktop folder first.`,
              duration: 10000,
            });
          }
          throw error;
        }
      }

      // Each batch gets a unique ID and runs independently
      runIdRef.current += 1;
      const thisRunId = runIdRef.current;
      activeUploadsRef.current.add(thisRunId);

      // Append to existing results to show all concurrent uploads
      const currentResults = useBulkUploadStore.getState().uploadResults;
      const newResults: UploadResult[] = files.map((f) => ({
        fileName: f.name,
        status: 'pending',
      }));
      const startIndex = currentResults.length;
      setUploadResults([...currentResults, ...newResults]);

      try {

      // Reset cancellation flag when starting new uploads
      cancelledRef.current = false;

      // Track stats for audit logging
      let processedCount = 0;
      let succeededCount = 0;
      let failedCount = 0;
      const errorMessages: string[] = [];

      // Create upload session for tracking
      let uploadSessionId = '';
      try {
        if (organizationId) {
          uploadSessionId = await createUploadSession(organizationId, files.length, 'resume_upload');
        }
      } catch (error) {
        console.warn('Failed to create upload session (non-critical):', error);
      }

      // Audit logging - non-blocking, errors won't fail uploads
      let auditSessionId = '';
      try {
        auditSessionId = await logBulkUploadStart(files.length, 'resume_upload');
      } catch (error) {
        console.warn('Audit log failed (non-critical):', error);
      }

      // Each batch only checks if user clicked cancel (not affected by other batches)
      const isStale = () => cancelledRef.current;
      const markRemainingCancelled = (fromIndex: number) => {
        for (let j = fromIndex; j < files.length; j++) {
          updateResult(startIndex + j, { status: 'cancelled', error: 'Cancelled' });
        }
      };

      /**
       * Wraps a promise with a timeout. Rejects if the operation takes longer than timeoutMs.
       */
      const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, fileName: string): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Processing timeout: "${fileName}" exceeded ${timeoutMs / 1000}s limit`)),
              timeoutMs
            )
          ),
        ]);
      };

      /**
       * Processes a single file with timeout and retry logic.
       * Returns { success: boolean, cancelled?: boolean, isTimeout?: boolean }
       */
      const processFile = async (i: number, retryCount = 0): Promise<{ success: boolean; cancelled?: boolean; isTimeout?: boolean }> => {
        if (isStale()) {
          updateResult(startIndex + i, { status: 'cancelled', error: 'Cancelled' });
          return { success: false, cancelled: true };
        }

        const fileData = fileDataArray[i];
        const file = fileData.file;
        const base64 = fileData.base64;
        const fileHash = fileData.hash;
        const resultIndex = startIndex + i;

        updateResult(resultIndex, { status: 'parsing' });

        // Check for legacy .doc files and reject them upfront
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.doc') && !fileName.endsWith('.docx')) {
          updateResult(resultIndex, {
            status: 'error',
            error: 'Legacy .doc files are not supported. Please convert to .docx or PDF:\n\n1. Open the file in Microsoft Word or Google Docs\n2. Click "File" → "Save As" or "Download"\n3. Choose "Word Document (.docx)" or "PDF"\n4. Upload the converted file\n\nOnline converters: CloudConvert, Zamzar, or OnlineConvert'
          });
          failedCount++;
          errorMessages.push(`${file.name}: Unsupported .doc format`);
          return { success: false };
        }

        try {
          if (isStale()) {
            updateResult(resultIndex, { status: 'cancelled', error: 'Cancelled' });
            return { success: false, cancelled: true };
          }

          // Wrap entire file processing in timeout
          await withTimeout(
            (async () => {
              // Register file for processing tracking
              if (uploadSessionId) {
                try {
                  await registerFileForProcessing(uploadSessionId, file.name, fileHash, file.size);
                  await markFileProcessing(uploadSessionId, fileHash);
                } catch (error) {
                  console.warn('Failed to register file for tracking (non-critical):', error);
                }
              }

              const { data: existingResume } = await supabase
                .from('resumes')
                .select('id, file_name')
                .eq('content_hash', fileHash)
                .maybeSingle();

              if (isStale()) {
                throw new Error('CANCELLED');
              }

              if (existingResume) {
                try {
                  const { data: relinkData, error: relinkErr } = await supabase.functions.invoke('resolve-duplicate-resume', {
                    body: { organizationId, contentHash: fileHash, source: 'resume_upload' },
                  });
                  if (relinkErr) throw new Error(await getEdgeFunctionErrorMessage(relinkErr));
                  const score = (relinkData as { resume?: { ats_score?: number } })?.resume?.ats_score;
                  updateResult(resultIndex, {
                    status: 'done',
                    atsScore: typeof score === 'number' ? score : undefined,
                    note: 'Duplicate detected: existing profile re-linked to Talent Pool',
                    error: undefined,
                  });
                  if (uploadSessionId) {
                    await markFileSkipped(uploadSessionId, fileHash, 'Duplicate - re-linked to talent pool');
                  }
                  succeededCount++;
                  return; // Early return for duplicate
                } catch {
                  updateResult(resultIndex, {
                    status: 'error',
                    error: 'This exact resume already exists in the system',
                  });
                  if (uploadSessionId) {
                    await markFileFailed(uploadSessionId, fileHash, 'This exact resume already exists in the system');
                  }
                  failedCount++;
                  errorMessages.push(`${file.name}: Duplicate`);
                  return; // Early return for duplicate error
                }
              }

              // Parse resume with retry logic for transient errors
              const { data: parseData, error: parseError } = await retryWithBackoff(
                () => supabase.functions.invoke('parse-resume', {
                  body: {
                    fileBase64: base64,
                    fileName: file.name,
                    fileType: file.type || 'application/octet-stream',
                  },
                }),
                {
                  maxRetries: 2,
                  timeoutMs: 180000, // 3 minute timeout for parse (large files can take time)
                  onRetry: async (attempt, maxRetries, error) => {
                    await logRetryAttempt(
                      'parse_resume',
                      attempt,
                      maxRetries,
                      error instanceof Error ? error.message : String(error),
                      'resume',
                      file.name
                    );
                  },
                }
              );

              if (isStale()) {
                throw new Error('CANCELLED');
              }

              if (parseError) throw new Error(await getEdgeFunctionErrorMessage(parseError));

              const parsed = parseData?.parsed as Record<string, unknown> & { _fileHash?: string; ats_score?: number };
              parsed._fileHash = fileHash;

              updateResult(resultIndex, { status: 'importing', parsed, atsScore: parsed.ats_score });

              const fileExt = file.name.split('.').pop();
              const uniqueFileName = `sourced/${organizationId}/${crypto.randomUUID()}.${fileExt}`;

              // Upload file to storage with retry logic
              const { error: uploadError } = await retryWithBackoff(
                () => supabase.storage.from('resumes').upload(uniqueFileName, file, {
                  contentType: file.type || 'application/octet-stream',
                  upsert: false,
                }),
                {
                  maxRetries: 3,
                  timeoutMs: 300000, // 5 minute timeout for storage upload (large files on slow connections)
                  onRetry: async (attempt, maxRetries, error) => {
                    await logRetryAttempt(
                      'storage_upload',
                      attempt,
                      maxRetries,
                      error instanceof Error ? error.message : String(error),
                      'resume',
                      file.name
                    );
                  },
                }
              );

              if (isStale()) {
                throw new Error('CANCELLED');
              }

              if (uploadError) throw new Error(`Failed to upload file: ${uploadError.message}`);

              // Import candidate with retry logic
              const { data: importData, error: importError } = await retryWithBackoff(
                () => supabase.functions.invoke('bulk-import-candidates', {
                  body: {
                    profiles: [
                      {
                        ...parsed,
                        source: 'resume_upload',
                        ats_score: parsed.ats_score,
                        resume_file: {
                          file_name: file.name,
                          file_url: `resumes/${uniqueFileName}`,
                          file_type: file.type || 'application/octet-stream',
                          content_hash: parsed._fileHash,
                        },
                      },
                    ],
                    organizationId,
                    source: 'resume_upload',
                  },
                }),
                {
                  maxRetries: 2,
                  timeoutMs: 90000, // 90 second timeout for import
                  onRetry: async (attempt, maxRetries, error) => {
                    await logRetryAttempt(
                      'import_candidate',
                      attempt,
                      maxRetries,
                      error instanceof Error ? error.message : String(error),
                      'candidate_profile',
                      file.name
                    );
                  },
                }
              );

              if (isStale()) {
                throw new Error('CANCELLED');
              }

              if (importError) throw new Error(await getEdgeFunctionErrorMessage(importError));

              const results = importData as { results?: { relinked?: number; errors?: string[] } };
              const relinked = Number(results?.results?.relinked ?? 0);
              const hasDuplicateError = (results?.results?.errors ?? []).some((err: string) =>
                String(err || '').toUpperCase().includes('DUPLICATE')
              );

              if (relinked > 0) {
                succeededCount++;
                updateResult(resultIndex, {
                  status: 'done',
                  parsed: parsed as UploadResult['parsed'],
                  atsScore: parsed.ats_score,
                  note: 'Duplicate detected: existing profile re-linked to Talent Pool',
                  error: undefined,
                });
                try {
                  await logResumeUpload(parsed.id || 'unknown', file.name, true);
                } catch (e) { /* non-critical */ }
                if (uploadSessionId) {
                  try {
                    await markFileSkipped(uploadSessionId, fileHash, 'Duplicate - re-linked to talent pool');
                  } catch (e) { /* non-critical */ }
                }
              } else if (hasDuplicateError) {
                failedCount++;
                errorMessages.push(`${file.name}: Duplicate`);
                updateResult(resultIndex, {
                  status: 'error',
                  error: 'Duplicate resume: identical content already exists',
                  parsed: parsed as UploadResult['parsed'],
                  atsScore: parsed.ats_score,
                });
                try {
                  await logResumeUpload(parsed.id || 'unknown', file.name, false, 'Duplicate');
                } catch (e) { /* non-critical */ }
                if (uploadSessionId) {
                  try {
                    await markFileFailed(uploadSessionId, fileHash, 'Duplicate resume: identical content already exists');
                  } catch (e) { /* non-critical */ }
                }
              } else {
                succeededCount++;
                updateResult(resultIndex, {
                  status: 'done',
                  parsed: parsed as UploadResult['parsed'],
                  atsScore: parsed.ats_score,
                  error: undefined,
                });
                try {
                  await logResumeUpload(parsed.id || 'unknown', file.name, true);
                } catch (e) { /* non-critical */ }
                if (uploadSessionId) {
                  try {
                    await markFileCompleted(uploadSessionId, fileHash, parsed.id);
                  } catch (e) { /* non-critical */ }
                }
              }

              processedCount++;
            })(),
            FILE_PROCESSING_TIMEOUT_MS,
            file.name
          );

          return { success: true };

        } catch (error: unknown) {
          // Check if this is a timeout error
          const isTimeout = error instanceof Error && error.message.startsWith('Processing timeout:');
          const isCancelled = error instanceof Error && error.message === 'CANCELLED';

          if (isCancelled) {
            updateResult(resultIndex, { status: 'cancelled', error: 'Cancelled' });
            return { success: false, cancelled: true };
          }

          // Retry once for timeout errors (user requested 60s timeout, so retry makes sense)
          if (isTimeout && retryCount === 0) {
            console.log(`[BulkUpload] Retrying timed-out file: ${file.name}`);
            try {
              await logRetryAttempt(
                'file_processing',
                1,
                1,
                error instanceof Error ? error.message : String(error),
                'resume',
                file.name
              );
            } catch (e) { /* non-critical */ }
            // Recursive retry with retryCount = 1
            return await processFile(i, 1);
          }

          failedCount++;

          // Get both technical and user-friendly error messages
          const technicalMsg = await getEdgeFunctionErrorMessage(error);
          const userFriendlyMsg = isTimeout
            ? `Processing timeout: File took longer than ${FILE_PROCESSING_TIMEOUT_MS / 1000}s to process. Try again or contact support.`
            : getUserFriendlyErrorMessage(error);

          // Store both messages
          errorMessages.push(`${file.name}: ${technicalMsg}`);

          // Show user-friendly message to user
          updateResult(resultIndex, {
            status: 'error',
            error: userFriendlyMsg,
          });

          // Log technical error for debugging (non-blocking)
          try {
            await logBulkUploadError(auditSessionId, technicalMsg, {
              file_name: file.name,
              index: i,
              user_friendly_message: userFriendlyMsg,
              is_timeout: isTimeout,
              retry_count: retryCount,
            });
          } catch (e) { /* non-critical */ }

          try {
            await logResumeUpload('unknown', file.name, false, technicalMsg);
          } catch (e) { /* non-critical */ }

          if (uploadSessionId) {
            try {
              await markFileFailed(uploadSessionId, fileHash, technicalMsg);
            } catch (e) { /* non-critical */ }
          }

          // Show toast notification for critical errors (auth, rate limit, server errors, timeout)
          if (/auth|permission|rate limit|timeout|429|503|502|504/i.test(technicalMsg)) {
            toast.error(`Upload Error: ${userFriendlyMsg}`, {
              description: 'Check the upload status panel for details',
              duration: 5000,
            });
          }

          return { success: false, isTimeout };
        }
      };

      /**
       * Concurrency limiter - ensures max N concurrent operations.
       * Returns a function that wraps any async operation with concurrency control.
       */
      const createConcurrencyLimit = (limit: number) => {
        let activeCount = 0;
        const queue: Array<() => void> = [];

        return async <T>(fn: () => Promise<T>): Promise<T> => {
          while (activeCount >= limit) {
            await new Promise<void>((resolve) => queue.push(resolve));
          }

          activeCount++;
          try {
            return await fn();
          } finally {
            activeCount--;
            const next = queue.shift();
            if (next) next();
          }
        };
      };

      const limit = createConcurrencyLimit(FILE_PROCESSING_CONCURRENCY);

      // Process all files concurrently with limit
      const fileProcessingPromises = files.map((_, i) => limit(() => processFile(i)));

      // Wait for all files to complete
      await Promise.allSettled(fileProcessingPromises);

      // Update progress and invalidate queries after all files complete
      try {
        await logBulkUploadProgress(auditSessionId, processedCount, files.length, succeededCount, failedCount);
      } catch (e) { /* non-critical */ }
      if (uploadSessionId) {
        try {
          await updateUploadProgress(uploadSessionId, processedCount, succeededCount, failedCount, errorMessages);
        } catch (e) { /* non-critical */ }
      }
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
        queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      }
      queryClient.invalidateQueries({ queryKey: ['candidates'] });

      // Log final completion and update session (non-blocking)
      try {
        await logBulkUploadComplete(auditSessionId, files.length, succeededCount, failedCount, errorMessages);
      } catch (e) {
        console.warn('Failed to log upload completion:', e);
      }
      if (uploadSessionId) {
        try {
          await completeUploadSession(uploadSessionId, succeededCount, failedCount, errorMessages);
        } catch (e) {
          console.warn('Failed to complete upload session:', e);
        }
      }

      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
        queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      }
      queryClient.invalidateQueries({ queryKey: ['candidates'] });

      // Show completion notification
      if (cancelledRef.current) {
        toast.info('Upload cancelled', {
          description: `${succeededCount} of ${files.length} files uploaded successfully before cancellation`,
        });
      } else if (failedCount === 0) {
        toast.success('Upload complete!', {
          description: `Successfully uploaded ${succeededCount} ${succeededCount === 1 ? 'resume' : 'resumes'}`,
        });
      } else if (succeededCount === 0) {
        toast.error('Upload failed', {
          description: `All ${files.length} files failed to upload. Check the status panel for details.`,
          duration: 7000,
        });
      } else {
        toast.warning('Upload completed with errors', {
          description: `${succeededCount} succeeded, ${failedCount} failed. Check the status panel for details.`,
          duration: 7000,
        });
      }

      } catch (globalError: unknown) {
        // Handle catastrophic errors that occur outside the file processing loop
        const errorMsg = getUserFriendlyErrorMessage(globalError);
        console.error('[BulkUpload] Catastrophic error:', globalError);

        toast.error('Upload system error', {
          description: errorMsg,
          duration: 10000,
        });

        // Mark all pending files as failed
        for (let i = 0; i < files.length; i++) {
          const resultIndex = startIndex + i;
          const currentStatus = uploadResults[resultIndex]?.status;
          if (currentStatus === 'pending' || currentStatus === 'parsing' || currentStatus === 'importing') {
            updateResult(resultIndex, {
              status: 'error',
              error: 'Upload system error: ' + errorMsg
            });
          }
        }
      } finally {
        // Cleanup this batch from active uploads
        activeUploadsRef.current.delete(thisRunId);
      }

      e.target.value = '';
    },
    [organizationId, queryClient, clearResults, setUploadResults, updateResult]
  );

  const completedCount = uploadResults.filter((r) => r.status === 'done').length;
  const errorCount = uploadResults.filter((r) => r.status === 'error').length;
  const processingCount = uploadResults.filter((r) =>
    ['pending', 'parsing', 'importing'].includes(r.status)
  ).length;
  const isUploading = processingCount > 0;

  const cancelledCount = uploadResults.filter((r) => r.status === 'cancelled').length;

  return {
    handleFileUpload,
    uploadResults,
    clearResults: useBulkUploadStore.getState().clearResults,
    cancelUpload,
    isUploading,
    completedCount,
    errorCount,
    cancelledCount,
    processingCount,
  };
}

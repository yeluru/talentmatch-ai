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
 * Current: 1 (sequential processing)
 * - Safest option: avoids rate limits, reduces memory usage
 * - Works reliably with batches of thousands of files
 * - Provides stable progress tracking
 * - Processing speed: ~10-20 files/minute depending on file size and network
 *
 * Future: Can be increased to 3-5 for faster processing
 * - Requires implementation of concurrent processing logic
 * - May hit API rate limits with large batches
 * - Increased memory usage and complexity
 *
 * For 1000+ file uploads, sequential processing is recommended.
 * The system handles large batches gracefully with resumable uploads.
 */
const FILE_PROCESSING_CONCURRENCY = 1;

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

      for (let i = 0; i < files.length; i++) {
        if (isStale()) {
          markRemainingCancelled(i);
          break;
        }

        const file = files[i];
        const resultIndex = startIndex + i;
        let fileHash = ''; // Declare here so it's accessible in catch block

        updateResult(resultIndex, { status: 'parsing' });

        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64Data = result.split(',')[1];
              resolve(base64Data ?? '');
            };
            reader.onerror = () => {
              reject(new Error(reader.error?.message || 'Failed to read file'));
            };
            reader.readAsDataURL(file);
          });

          if (isStale()) {
            updateResult(resultIndex, { status: 'cancelled', error: 'Cancelled' });
            markRemainingCancelled(i + 1);
            break;
          }

          // Compute file hash from original file (more efficient than hashing base64)
          const fileBuffer = await file.arrayBuffer();
          const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          fileHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

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
            updateResult(resultIndex, { status: 'cancelled', error: 'Cancelled' });
            markRemainingCancelled(i + 1);
            break;
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
            } catch {
              updateResult(resultIndex, {
                status: 'error',
                error: 'This exact resume already exists in the system',
              });
              if (uploadSessionId) {
                await markFileFailed(uploadSessionId, fileHash, 'This exact resume already exists in the system');
              }
            }
            continue;
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
            updateResult(resultIndex, { status: 'cancelled', error: 'Cancelled' });
            markRemainingCancelled(i + 1);
            break;
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
            updateResult(resultIndex, { status: 'cancelled', error: 'Cancelled' });
            markRemainingCancelled(i + 1);
            break;
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
            updateResult(resultIndex, { status: 'cancelled', error: 'Cancelled' });
            markRemainingCancelled(i + 1);
            break;
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

          // Update progress and invalidate queries every 10 files (not every file!)
          if (processedCount % 10 === 0) {
            try {
              await logBulkUploadProgress(auditSessionId, processedCount, files.length, succeededCount, failedCount);
            } catch (e) { /* non-critical */ }
            if (uploadSessionId) {
              try {
                await updateUploadProgress(uploadSessionId, processedCount, succeededCount, failedCount, errorMessages);
              } catch (e) { /* non-critical */ }
            }
            // Batch invalidate queries every 10 files instead of every file
            if (organizationId) {
              queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
              queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
            }
            queryClient.invalidateQueries({ queryKey: ['candidates'] });
          }
        } catch (error: unknown) {
          failedCount++;

          // Get both technical and user-friendly error messages
          const technicalMsg = await getEdgeFunctionErrorMessage(error);
          const userFriendlyMsg = getUserFriendlyErrorMessage(error);

          // Store both messages
          errorMessages.push(`${file.name}: ${technicalMsg}`);

          // Show user-friendly message to user
          updateResult(resultIndex, {
            status: 'error',
            error: userFriendlyMsg
          });

          // Log technical error for debugging (non-blocking)
          try {
            await logBulkUploadError(auditSessionId, technicalMsg, {
              file_name: file.name,
              index: i,
              user_friendly_message: userFriendlyMsg
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

          // Show toast notification for critical errors (auth, rate limit, server errors)
          if (/auth|permission|rate limit|429|503|502|504/i.test(technicalMsg)) {
            toast.error(`Upload Error: ${userFriendlyMsg}`, {
              description: 'Check the upload status panel for details',
              duration: 5000,
            });
          }
        }
      }

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

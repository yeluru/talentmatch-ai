import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';
import { useBulkUploadStore, type UploadResult } from '@/stores/bulkUploadStore';

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

  const cancelUpload = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

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

      // Reset cancellation flag when starting new uploads
      cancelledRef.current = false;

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

        updateResult(resultIndex, { status: 'parsing' });

        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64Data = result.split(',')[1];
              resolve(base64Data ?? '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          if (isStale()) {
            updateResult(resultIndex, { status: 'cancelled', error: 'Cancelled' });
            markRemainingCancelled(i + 1);
            break;
          }

          const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base64));
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const fileHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

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
            } catch {
              updateResult(resultIndex, {
                status: 'error',
                error: 'This exact resume already exists in the system',
              });
            }
            continue;
          }

          const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-resume', {
            body: {
              fileBase64: base64,
              fileName: file.name,
              fileType: file.type || 'application/octet-stream',
            },
          });

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

          const { error: uploadError } = await supabase.storage.from('resumes').upload(uniqueFileName, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
          });

          if (isStale()) {
            updateResult(resultIndex, { status: 'cancelled', error: 'Cancelled' });
            markRemainingCancelled(i + 1);
            break;
          }

          if (uploadError) throw new Error(`Failed to upload file: ${uploadError.message}`);

          const { data: importData, error: importError } = await supabase.functions.invoke('bulk-import-candidates', {
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
          });

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
            updateResult(resultIndex, {
              status: 'done',
              parsed: parsed as UploadResult['parsed'],
              atsScore: parsed.ats_score,
              note: 'Duplicate detected: existing profile re-linked to Talent Pool',
              error: undefined,
            });
          } else if (hasDuplicateError) {
            updateResult(resultIndex, {
              status: 'error',
              error: 'Duplicate resume: identical content already exists',
              parsed: parsed as UploadResult['parsed'],
              atsScore: parsed.ats_score,
            });
          } else {
            updateResult(resultIndex, {
              status: 'done',
              parsed: parsed as UploadResult['parsed'],
              atsScore: parsed.ats_score,
              error: undefined,
            });
          }

          if (organizationId) {
            queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
            queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
          }
          queryClient.invalidateQueries({ queryKey: ['candidates'] });
        } catch (error: unknown) {
          const msg = await getEdgeFunctionErrorMessage(error);
          updateResult(resultIndex, { status: 'error', error: msg });
        }
      }

      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
        queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      }
      queryClient.invalidateQueries({ queryKey: ['candidates'] });

      // Cleanup this batch from active uploads
      activeUploadsRef.current.delete(thisRunId);

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

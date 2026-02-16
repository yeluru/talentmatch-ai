import { supabase } from '@/integrations/supabase/client';

export interface UploadFileRecord {
  id: string;
  session_id: string;
  file_name: string;
  file_hash: string;
  file_size?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  candidate_id?: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

/**
 * Check if a file has already been processed in this session
 */
export async function isFileProcessed(
  sessionId: string,
  fileHash: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bulk_upload_files')
    .select('status')
    .eq('session_id', sessionId)
    .eq('file_hash', fileHash)
    .in('status', ['completed', 'skipped'])
    .maybeSingle();

  if (error) {
    console.error('Failed to check if file processed:', error);
    return false;
  }

  return !!data;
}

/**
 * Register a file for processing in the session
 */
export async function registerFileForProcessing(
  sessionId: string,
  fileName: string,
  fileHash: string,
  fileSize?: number
): Promise<string | null> {
  const { data, error } = await supabase
    .from('bulk_upload_files')
    .upsert(
      {
        session_id: sessionId,
        file_name: fileName,
        file_hash: fileHash,
        file_size: fileSize,
        status: 'pending',
      },
      {
        onConflict: 'session_id,file_hash',
        ignoreDuplicates: false,
      }
    )
    .select('id')
    .single();

  if (error) {
    console.error('Failed to register file:', error);
    return null;
  }

  return data?.id || null;
}

/**
 * Mark file as processing
 */
export async function markFileProcessing(
  sessionId: string,
  fileHash: string
): Promise<void> {
  await supabase
    .from('bulk_upload_files')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)
    .eq('file_hash', fileHash);
}

/**
 * Mark file as completed
 */
export async function markFileCompleted(
  sessionId: string,
  fileHash: string,
  candidateId?: string,
  resumeId?: string
): Promise<void> {
  await supabase
    .from('bulk_upload_files')
    .update({
      status: 'completed',
      candidate_id: candidateId,
      resume_id: resumeId,
      completed_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)
    .eq('file_hash', fileHash);
}

/**
 * Mark file as failed
 */
export async function markFileFailed(
  sessionId: string,
  fileHash: string,
  errorMessage: string
): Promise<void> {
  await supabase
    .from('bulk_upload_files')
    .update({
      status: 'failed',
      error_message: errorMessage.slice(0, 1000), // Limit error length
      completed_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)
    .eq('file_hash', fileHash);
}

/**
 * Mark file as skipped (duplicate)
 */
export async function markFileSkipped(
  sessionId: string,
  fileHash: string,
  reason: string
): Promise<void> {
  await supabase
    .from('bulk_upload_files')
    .update({
      status: 'skipped',
      error_message: reason,
      completed_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)
    .eq('file_hash', fileHash);
}

/**
 * Find incomplete upload session with matching files
 */
export async function findIncompleteSession(
  organizationId: string,
  fileHashes: string[]
): Promise<string | null> {
  // Look for in_progress sessions from last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('bulk_upload_sessions')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('status', 'in_progress')
    .gte('started_at', sevenDaysAgo)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  // Check if this session has some of our files
  const { data: files } = await supabase
    .from('bulk_upload_files')
    .select('file_hash')
    .eq('session_id', data.id)
    .in('file_hash', fileHashes.slice(0, 10)); // Check first 10 files

  // If at least 50% of checked files match, consider it the same batch
  if (files && files.length >= Math.min(5, fileHashes.length * 0.5)) {
    return data.id;
  }

  return null;
}

/**
 * Get processed file hashes for a session
 */
export async function getProcessedFileHashes(
  sessionId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('bulk_upload_files')
    .select('file_hash')
    .eq('session_id', sessionId)
    .in('status', ['completed', 'skipped']);

  if (error || !data) {
    return new Set();
  }

  return new Set(data.map(f => f.file_hash));
}

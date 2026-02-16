import { supabase } from '@/integrations/supabase/client';

export interface UploadSession {
  id: string;
  user_id: string;
  organization_id: string;
  total_files: number;
  processed_files: number;
  succeeded_files: number;
  failed_files: number;
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  source: string;
  started_at: string;
  completed_at?: string;
  errors: string[];
  metadata?: Record<string, any>;
}

/**
 * Create a new upload session
 */
export async function createUploadSession(
  organizationId: string,
  totalFiles: number,
  source: string = 'resume_upload'
): Promise<string> {
  const sessionId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('bulk_upload_sessions')
    .insert({
      id: sessionId,
      user_id: user.id,
      organization_id: organizationId,
      total_files: totalFiles,
      processed_files: 0,
      succeeded_files: 0,
      failed_files: 0,
      status: 'in_progress',
      source,
      started_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Failed to create upload session:', error);
    throw error;
  }

  return sessionId;
}

/**
 * Update upload session progress
 */
export async function updateUploadProgress(
  sessionId: string,
  processed: number,
  succeeded: number,
  failed: number,
  errors: string[] = []
): Promise<void> {
  const { error } = await supabase
    .from('bulk_upload_sessions')
    .update({
      processed_files: processed,
      succeeded_files: succeeded,
      failed_files: failed,
      errors: errors.slice(0, 100), // Limit to 100 errors max
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Failed to update upload progress:', error);
  }
}

/**
 * Mark upload session as completed
 */
export async function completeUploadSession(
  sessionId: string,
  succeeded: number,
  failed: number,
  errors: string[] = []
): Promise<void> {
  const { error } = await supabase
    .from('bulk_upload_sessions')
    .update({
      status: 'completed',
      succeeded_files: succeeded,
      failed_files: failed,
      errors: errors.slice(0, 100),
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Failed to complete upload session:', error);
  }
}

/**
 * Mark upload session as failed
 */
export async function failUploadSession(
  sessionId: string,
  error: string
): Promise<void> {
  const { error: updateError } = await supabase
    .from('bulk_upload_sessions')
    .update({
      status: 'failed',
      errors: [error],
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (updateError) {
    console.error('Failed to mark session as failed:', updateError);
  }
}

/**
 * Mark upload session as cancelled
 */
export async function cancelUploadSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('bulk_upload_sessions')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Failed to cancel upload session:', error);
  }
}

/**
 * Get recent upload sessions for current user
 */
export async function getRecentUploadSessions(limit: number = 10): Promise<UploadSession[]> {
  const { data, error } = await supabase
    .from('bulk_upload_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch upload sessions:', error);
    return [];
  }

  return data as UploadSession[];
}

/**
 * Get upload session by ID
 */
export async function getUploadSession(sessionId: string): Promise<UploadSession | null> {
  const { data, error } = await supabase
    .from('bulk_upload_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch upload session:', error);
    return null;
  }

  return data as UploadSession | null;
}

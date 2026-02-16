import { supabase } from '@/integrations/supabase/client';

export interface AuditLogEntry {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: Record<string, any>;
  acting_role?: string;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('Cannot create audit log: No authenticated user');
      return;
    }

    // Get user's roles to determine acting_role
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role, organization_id, is_primary')
      .eq('user_id', user.id);

    // Use primary role if available, otherwise first role
    const primaryRole = userRoles?.find(r => r.is_primary);
    const actingRole = entry.acting_role || primaryRole?.role || userRoles?.[0]?.role || 'unknown';
    const organizationId = primaryRole?.organization_id || userRoles?.[0]?.organization_id;

    if (!organizationId) {
      console.warn('Cannot create audit log: No organization found for user');
      return;
    }

    await supabase
      .from('audit_logs')
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        action: entry.action,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        details: entry.details || {},
        acting_role: actingRole,
      });
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit logging should never break the main flow
  }
}

/**
 * Log bulk upload start
 */
export async function logBulkUploadStart(fileCount: number, source: string = 'resume_upload'): Promise<string> {
  const sessionId = `bulk_upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await createAuditLog({
    action: 'bulk_import_start',
    entity_type: 'bulk_upload_session',
    entity_id: sessionId,
    details: {
      total_files: fileCount,
      source,
      status: 'started',
      started_at: new Date().toISOString(),
    },
  });

  return sessionId;
}

/**
 * Log bulk upload progress
 */
export async function logBulkUploadProgress(
  sessionId: string,
  processed: number,
  total: number,
  succeeded: number,
  failed: number
): Promise<void> {
  await createAuditLog({
    action: 'bulk_import_progress',
    entity_type: 'bulk_upload_session',
    entity_id: sessionId,
    details: {
      processed,
      total,
      succeeded,
      failed,
      progress_percentage: Math.round((processed / total) * 100),
      updated_at: new Date().toISOString(),
    },
  });
}

/**
 * Log bulk upload completion
 */
export async function logBulkUploadComplete(
  sessionId: string,
  total: number,
  succeeded: number,
  failed: number,
  errors: string[]
): Promise<void> {
  await createAuditLog({
    action: 'bulk_import_complete',
    entity_type: 'bulk_upload_session',
    entity_id: sessionId,
    details: {
      total_files: total,
      succeeded,
      failed,
      errors: errors.slice(0, 10), // Limit error details to first 10
      status: 'completed',
      completed_at: new Date().toISOString(),
    },
  });
}

/**
 * Log bulk upload error
 */
export async function logBulkUploadError(
  sessionId: string,
  error: string,
  context?: Record<string, any>
): Promise<void> {
  await createAuditLog({
    action: 'bulk_import_error',
    entity_type: 'bulk_upload_session',
    entity_id: sessionId,
    details: {
      error,
      context,
      occurred_at: new Date().toISOString(),
    },
  });
}

/**
 * Log individual resume upload
 */
export async function logResumeUpload(
  candidateId: string,
  fileName: string,
  success: boolean,
  error?: string
): Promise<void> {
  await createAuditLog({
    action: 'upload_resume',
    entity_type: 'resumes',
    entity_id: candidateId,
    details: {
      file_name: fileName,
      success,
      error,
      uploaded_at: new Date().toISOString(),
    },
  });
}

/**
 * Log retry attempt
 */
export async function logRetryAttempt(
  operation: string,
  attempt: number,
  maxRetries: number,
  error: string,
  entityType?: string,
  entityId?: string
): Promise<void> {
  await createAuditLog({
    action: 'retry_attempt',
    entity_type: entityType || 'operation',
    entity_id: entityId,
    details: {
      operation,
      attempt,
      max_retries: maxRetries,
      error,
      timestamp: new Date().toISOString(),
    },
  });
}

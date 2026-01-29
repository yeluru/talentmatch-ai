import { supabase } from '@/integrations/supabase/client';
import { resumesObjectPath } from '@/lib/storagePaths';

export type ResumeLinkOptions = {
  /** Default: 600 (10 minutes) */
  expiresInSeconds?: number;
  /** When true, forces download in browser */
  download?: boolean;
};

export async function getSignedResumeUrl(
  fileUrlOrPath: string | null | undefined,
  opts: ResumeLinkOptions = {}
): Promise<string> {
  const { expiresInSeconds = 600, download = false } = opts;
  const objectPath = resumesObjectPath(fileUrlOrPath);
  if (!objectPath) {
    throw new Error('Resume not available');
  }

  const { data, error } = await supabase.storage
    .from('resumes')
    .createSignedUrl(objectPath, expiresInSeconds, download ? { download: true } : undefined);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Failed to generate resume link');
  return data.signedUrl;
}

export async function openResumeInNewTab(
  fileUrlOrPath: string | null | undefined,
  opts: ResumeLinkOptions = {}
): Promise<void> {
  const url = await getSignedResumeUrl(fileUrlOrPath, opts);
  window.open(url, '_blank');
}


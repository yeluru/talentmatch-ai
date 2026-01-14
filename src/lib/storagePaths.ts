export function resumesObjectPath(fileUrlOrPath: string | null | undefined): string | null {
  if (!fileUrlOrPath) return null;

  const raw = String(fileUrlOrPath);

  // Common patterns:
  // - "resumes/<path>"
  // - "http(s)://.../storage/v1/object/public/resumes/<path>"
  // - "http(s)://.../storage/v1/object/sign/resumes/<path>?token=..."
  const marker = '/resumes/';
  const idx = raw.indexOf(marker);
  if (idx >= 0) {
    return raw.slice(idx + marker.length).split('?')[0] || null;
  }

  if (raw.startsWith('resumes/')) {
    return raw.slice('resumes/'.length).split('?')[0] || null;
  }

  // If we only stored the object path itself (bucket-relative)
  return raw.split('?')[0] || null;
}


-- Prevent duplicate resumes by exact file hash (only enforces when content_hash is present)
CREATE UNIQUE INDEX IF NOT EXISTS uq_resumes_content_hash
ON public.resumes(content_hash)
WHERE content_hash IS NOT NULL;
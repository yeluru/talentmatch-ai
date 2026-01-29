-- Backfill missing public.profiles rows for existing auth.users.
-- This prevents UI fallbacks like "Candidate" when profiles are missing.

INSERT INTO public.profiles (user_id, email, full_name)
SELECT
  u.id AS user_id,
  u.email AS email,
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(u.raw_user_meta_data->>'name', ''),
    NULLIF(split_part(u.email, '@', 1), ''),
    'User'
  ) AS full_name
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
  AND u.email IS NOT NULL;


-- Add first_name and last_name to profiles for admin (and other) profile editing.
-- full_name remains for display/backward compatibility; can be synced from first + last when provided.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

COMMENT ON COLUMN public.profiles.first_name IS 'Admin/candidate first name; optional.';
COMMENT ON COLUMN public.profiles.last_name IS 'Admin/candidate last name; optional.';

-- RPC so users can update their own profile (first_name, last_name, phone, full_name) without RLS blocking.
-- Wrapped in DO so migration does not fail when the function is owned by another role (e.g. created in Dashboard).
DO $$
BEGIN
  DROP FUNCTION IF EXISTS public.update_own_profile(text, text, text, text);
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;

DO $$
BEGIN
  EXECUTE $exec$
    CREATE OR REPLACE FUNCTION public.update_own_profile(
      _first_name text DEFAULT NULL,
      _last_name text DEFAULT NULL,
      _phone text DEFAULT NULL,
      _full_name text DEFAULT NULL
    )
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      _uid uuid := auth.uid();
      _computed_full_name text;
    BEGIN
      IF _uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      END IF;

      _computed_full_name := COALESCE(
        NULLIF(trim(_full_name), ''),
        CASE WHEN trim(_first_name) IS NOT NULL OR trim(_last_name) IS NOT NULL
          THEN trim(COALESCE(_first_name, '') || ' ' || COALESCE(_last_name, ''))
          ELSE (SELECT full_name FROM public.profiles WHERE user_id = _uid LIMIT 1)
        END
      );

      UPDATE public.profiles
      SET
        first_name = NULLIF(trim(_first_name), ''),
        last_name = NULLIF(trim(_last_name), ''),
        phone = NULLIF(trim(_phone), ''),
        full_name = COALESCE(_computed_full_name, full_name),
        updated_at = now()
      WHERE user_id = _uid;
    END;
    $fn$
  $exec$;
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END $$;

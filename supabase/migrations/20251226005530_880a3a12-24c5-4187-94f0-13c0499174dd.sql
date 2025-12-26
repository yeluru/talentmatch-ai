-- Fix function search path for generate_invite_code
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS varchar
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  chars varchar := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  code varchar := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN code;
END;
$$;
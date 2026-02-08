-- No-op: this migration previously added RLS policies that broke login (circular dependency).
-- Account managers in the pipeline dropdown are now provided by get-org-account-managers edge function only.
SELECT 1;

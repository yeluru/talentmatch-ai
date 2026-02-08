# Local development notes (Supabase)

## Email (Document check / engagement emails)

Edge functions that send email (e.g. **Document check** in the pipeline, engagement emails) use SMTP. By default they try **127.0.0.1:1025** (Mailpit).

- **Option A – Run Mailpit** so emails are actually sent and viewable at http://localhost:8025:
  ```bash
  docker run -d -p 1025:1025 -p 8025:8025 --name mailpit axllent/mailpit
  ```
- **Option B – Skip sending in dev:** set env for the function so the flow still completes but no email is sent:
  ```bash
  supabase secrets set SKIP_SMTP_DEV=true
  ```
  For **local** functions, pass env when serving, e.g. in `.env.local` or:
  ```bash
  SKIP_SMTP_DEV=true supabase functions serve
  ```
  With `SKIP_SMTP_DEV=true`, when SMTP connection fails (e.g. Mailpit not running), the function returns success and the candidate still moves to Document check.

## Important: `supabase db reset` is destructive

Running `supabase db reset` **recreates the local Postgres database** and will wipe local data, including **local Auth users**.

Symptoms after a reset:
- You can’t sign in with old credentials (`Invalid email or password`)
- Previously imported candidates / resumes disappear (local-only data loss)

## Applying a one-off data fix locally (safe)

If you only need to run a backfill/patch (like the `candidate_org_links` backfill), **do not reset**.

Use local Supabase Studio:
- Open `http://localhost:54323`
- Go to **SQL Editor**
- Paste and run the SQL from the migration file you want to apply.

This keeps your local Auth users + data intact.

## Applying schema migrations locally (tradeoffs)

Depending on Supabase CLI version, the CLI may not support a non-destructive “apply migrations to local” command.
If your CLI only supports `supabase db reset` for local migration application, then:
- **Use Studio SQL Editor** for small changes/backfills (preferred)
- Only use `supabase db reset` when you are okay losing local data/users

## Recovery after a local reset (fast)

1) Recreate the Auth user in local Studio:
- `http://localhost:54323` → **Authentication → Users → Add user**
- Create user + mark confirmed
- Copy the `user_id` (UUID)

2) Create an org + assign recruiter role:

```sql
insert into public.organizations (name)
values ('Local Test Org')
returning id;
```

Then:

```sql
insert into public.user_roles (user_id, role, organization_id)
values ('<AUTH_USER_ID>', 'recruiter', '<ORG_ID>');
```

3) (Optional) Ensure a profile row exists:

```sql
insert into public.profiles (user_id, email, full_name)
values ('<AUTH_USER_ID>', '<EMAIL>', '<FULL_NAME>')
on conflict (user_id) do update
set email = excluded.email, full_name = excluded.full_name;
```


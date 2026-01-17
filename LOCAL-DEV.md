# Local development notes (Supabase)

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


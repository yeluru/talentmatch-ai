# How Role-Switching Capability Is Assigned

## How it works

- **Roles** come from the `user_roles` table: one row per (user_id, role, organization_id). A user can have multiple rows (e.g. `account_manager` and `recruiter` for the same org).
- **Role switcher** in the header (avatar dropdown) appears when **the user has more than one role** (`roles.length > 1`). The switcher lists all of that user’s roles; choosing one runs `switchRole(role)` and navigates to the right area (e.g. Recruiter → `/recruiter`, Account Manager → `/manager`).
- **Who can switch** is therefore: any user who has at least two rows in `user_roles` (e.g. both `account_manager` and `recruiter` for the same organization).

So **assigning role-switching capability** = giving that user a **second role** in addition to the one they already have.

---

## How to assign it today (no code changes)

### Option 1: Second invite (recommended today)

1. User already has one role (e.g. **Account Manager**).
2. **Org Admin** (or Account Manager with invite permission) sends an invite for the **other** role to the **same email**:
   - If they’re AM → send a **Recruiter invite** to that email.
   - If they’re Recruiter → send an **Account Manager invite** to that email.
3. User clicks the invite link and signs in with the **same account** (same email).
4. The accept flow runs (`accept_recruiter_invite` or `accept_manager_invite`), which does:
   - `INSERT INTO user_roles (user_id, role, organization_id) VALUES (auth.uid(), 'recruiter', org_id) ON CONFLICT (user_id, role) DO NOTHING;`
   - So a **second row** is added (same user_id, different role). No new account is created.
5. That user now has two roles → the **Switch Role** dropdown appears in the header.

**Caveat:** The invite must be for the **same org** (and same email) so the second role is tied to the same organization. Recruiter and Manager invites are org-scoped, so this is the intended flow.

---

## Optional: “Add role” without a second invite

Today there is **no UI** to “add recruiter role to this account manager” (or the reverse) without sending a second invite. You can add that in two steps:

### 1. Database: RPC to add a role for another user

Only **org_admin** (or **super_admin**) should be able to add a role for a user in their org. Example:

- **Name:** e.g. `add_role_to_user` (or `grant_org_role`).
- **Args:** `_target_user_id uuid`, `_role app_role` (e.g. `'recruiter'` or `'account_manager'`).
- **Logic:**
  - Caller must be org_admin (or super_admin) and `_target_user_id` must already have at least one role in the **same** organization (so you’re only adding a second role within the same org).
  - `INSERT INTO user_roles (user_id, role, organization_id) SELECT _target_user_id, _role, organization_id FROM user_roles WHERE user_id = _target_user_id LIMIT 1 ON CONFLICT (user_id, role) DO NOTHING;`
- **RLS:** RPC is `SECURITY DEFINER`; inside the function you enforce “caller is org_admin/super_admin and target is in same org.”

That way, an org admin can grant “recruiter” to an existing account manager (or “account_manager” to an existing recruiter) without a second invite.

### 2. UI: Org Admin dashboard

- In **Org Admin** → **Account Managers** (or **Recruiters**), for each user row, show an action: **“Add recruiter role”** or **“Add account manager role”**.
- Only show “Add recruiter role” if the user does **not** already have the recruiter role (and same for account_manager).
- On click, call the new RPC with that user’s `user_id` and the chosen role.
- After success, refresh the list (and the user will see the role switcher on next load).

Result: **Role-switching capability is assigned** either by sending a second invite (same email, same org) or by an org admin using “Add role” in the dashboard.

---

## Summary

| Question | Answer |
|----------|--------|
| When does the role switcher appear? | When the user has more than one row in `user_roles` (e.g. both account_manager and recruiter). |
| How do we assign that today? | Send a second invite for the other role to the **same email**; they accept with the same account → second role is inserted → switcher appears. |
| Can we do it without a second invite? | Not in the current app. Add an RPC (e.g. `add_role_to_user`) and an “Add role” action in Org Admin to grant a second role without inviting again. |

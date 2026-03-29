# PRD: Super Admin Impersonation, Role Management & Permission Debugger

**Status:** Draft
**Date:** 2026-03-27
**Product:** hired.video
**Priority:** P0 — Core platform trust & debugging capability

---

## 1. Problem Statement

The hired.video Super Admin today can view the dashboard and switch between personas using a localStorage-only persona switcher, but cannot experience the product with full backend fidelity as a specific user. When a customer reports a bug, the admin cannot reproduce it in-context without knowing that user's credentials. The persona switcher only changes frontend rendering — the API still responds as SuperAdmin — making it impossible to reproduce permission-related bugs accurately.

There is also no way to inspect which permissions gate a given UI element, API call, or page at runtime, making access-control debugging extremely slow. Additionally, there is no backend enforcement of the SuperAdmin role on system-admin API routes, meaning any authenticated user could technically call those endpoints — a critical security gap that must be closed as part of this work.

| Pain Point | Current State | Impact |
|---|---|---|
| Bug reproduction | Must ask user to describe their screen | Slow, inaccurate |
| Role/persona validation | `localStorage` hack (`superadmin_active_persona`) — frontend only, no backend fidelity | Misleading — API still responds as SuperAdmin |
| User lookup | No cross-tenant user search | Cannot find or inspect arbitrary users |
| Permission audit | Permissions only visible in source code | Cannot tell at runtime which permission gates a given UI element |
| Role assignment | No admin UI — database console only | Slow, error-prone |
| Module-to-permission mapping | Not implemented | Cannot manage access at the feature-bundle level |
| SuperAdmin identification | Hardcoded `email === 'seanhogg@gmail.com'` in 3+ places | Brittle, cannot add additional admins |
| Admin route auth | No `isSuperAdmin` middleware on `/api/admin/*` routes | Security gap — any valid JWT can call admin endpoints |
| Audit logging | Not implemented | No record of admin actions |
| Session expiry | Persona persists indefinitely in localStorage | No natural session boundary |

---

## 2. Goals

1. Allow the Super Admin to **impersonate any user** across any tenant with full frontend AND backend fidelity — the API must respond as if the impersonated user made the request.
2. Provide an **always-visible emulation bar** in the header showing who is being emulated with one-click exit. It must be impossible to dismiss without explicitly ending the session.
3. Provide a **persona role preview mode** (no specific user) so the Super Admin can see how the current page renders for a given role without switching to a real user's data.
4. Provide a **permission debugger overlay** that annotates every UI element with the permission(s) that gate it, their current grant/deny status, and the grant source.
5. Build a **Super Admin portal** for cross-tenant user search, role management, module assignment, and audit review.
6. Tie **modules to permissions and roles** so assigning a module automatically grants the correct role and granular permissions.
7. **Enforce backend authorization** on all admin routes with a proper `isSuperAdmin` middleware.
8. Produce a **full audit trail** of every impersonation session, admin action, and permission change — retained for a minimum of 12 months.
9. Replace the hardcoded email SuperAdmin check with a proper `is_super_admin` database column.

---

## 3. Non-Goals (v1)

- Self-service role builder for individual tenants (post-v1).
- Public API for external permission management.
- Real-time permission streaming / WebSocket permission refresh.
- Row-level security beyond the existing tenant/company scoping.
- SCIM / directory sync for enterprise role provisioning.
- Automated permission recommendations based on usage patterns.

---

## 4. User Personas & Stakeholders

| Persona | Who | Need |
|---|---|---|
| SuperAdmin | hired.video platform operator | Debug customer issues, manage all users, validate UI across roles |
| Support Engineer | Internal ops | Reproduce reported bugs without needing user credentials |
| Security Auditor | Internal/external | Confirm admin actions are logged; confirm principle of least privilege |
| JobSeeker / Recruiter / Employer | End users | Confidence their account is only accessed by authorized parties |

---

## 5. Current State & Gaps

### 5.1 What Exists Today

| Capability | Status | Location |
|---|---|---|
| JWT authentication (HS256, 7-day TTL) | Working | `api/src/middleware/auth.ts` |
| Six personas (JobSeeker, Recruiter, Employer, Affiliate, Admin, SuperAdmin) | Working | `shared/user-roles.ts` |
| Frontend permission helpers (`RolePermissions` class, `usePermissions` hook) | Working | `frontend/lib/role-utils.ts`, `frontend/hooks/use-permissions.ts` |
| Account switching (own accounts) | Working | `POST /api/account/switch` |
| SuperAdmin persona switcher (localStorage, frontend only) | Working but limited | `frontend/components/PersonaSwitcher.tsx` |
| Role-specific dashboards | Working | `frontend/components/dashboard/` |
| Admin dashboard (metrics, refunds, etc.) | Working | `frontend/pages/admin/AdminDashboard.tsx` |
| Multi-tenant company structure | Working | `api/src/db/schema/companies.ts` |
| WebAuthn / passkey / magic link / OAuth auth | Working | `api/src/routes/auth.ts` |

### 5.2 Gaps (What Must Be Built)

| Gap | Severity |
|---|---|
| No impersonation / emulation system with backend fidelity | Critical |
| No backend auth enforcement on `/api/admin/*` routes | Critical (security) |
| No SuperAdmin `is_super_admin` DB flag (email string check) | Critical (security) |
| No permission debugger overlay | High |
| No role/persona assignment UI in admin portal | High |
| No module → permission → role mapping | High |
| No emulation bar in app header (only in dashboard) | High |
| No audit log writes for admin actions | High |
| No cross-tenant user search | High |
| No session revocation capability | Medium |
| No bulk role/module operations | Medium |
| No target-user transparency (users can't see if SA accessed their account) | Medium |
| No in-session role switching with backend token refresh | Medium |
| No impersonation session timeout (localStorage persona never expires) | Medium |

---

## 6. Feature Specifications

---

### 6.1 Super Admin Emulation Bar (Header)

A persistent banner shown inside the main application header whenever the Super Admin is in an impersonation session OR has activated the persona role preview mode. It must be impossible to miss and cannot be dismissed without explicitly ending the session.

**Trigger conditions:**
- Super Admin has started a user impersonation session, OR
- Super Admin has activated persona role debug mode (previewing a role without impersonating a specific user)

**Bar layout:**

```
[ ⚠ EMULATING ]  User: Jane Doe (jane@acme.com)  |  Tenant: Acme Corp  |  Role: [Recruiter ▼]  |  Permissions: 12 active  |  Session: 4 min ago  [ View Permissions ]  [ Copy Context ]  [ Switch Role ▾ ]  [ Exit Emulation ]
```

**Bar elements:**

| Element | Description |
|---|---|
| Warning badge | "⚠ EMULATING" — always visible, non-removable |
| User chip | Full name + email of impersonated user. Click opens their user profile in a side panel |
| Tenant | Company name of impersonated user |
| Role | Active effective role. Dropdown to switch persona mid-session (see §6.2.5) |
| Permissions count | Number of active permissions. Click opens Permission Debugger Panel (§6.3) |
| Session timer | Elapsed time since session started. Turns amber at T−50 min |
| Copy Context | Copies a JSON blob (userId, tenantId, role, permissions, sessionId, timestamp) to clipboard for bug reports |
| Switch Role | Dropdown to change active persona mid-session without ending it |
| Exit Emulation | Ends session, restores SA context, writes audit log |

**Visual treatment:**
- **Impersonation mode** (specific user): amber/orange background — visually unmissable.
- **Persona preview mode** (no specific user): blue background — distinct from impersonation.
- Sticky — does not scroll away. CSS-enforced; not a toast or dismissable notification.
- When NOT in any session: collapses to a single-line `SuperAdmin Mode | [Impersonate User] | [Preview Role ▾]` affordance.

**Persona Role Preview Dropdown** (header, separate from impersonation):
- Available to SuperAdmin at all times, even outside an impersonation session.
- Lists all system roles: SuperAdmin, Admin, JobSeeker, Recruiter, Employer, Affiliate.
- Selecting a role re-renders the current page as if the admin held that role **without** switching to a specific user's data.
- Frontend-only — does NOT change the API scope or underlying data.
- Blue "PREVIEWING [ROLE] ROLE" bar appears. Label: `Preview as role: [Recruiter ▾]`.
- Browser tab title gains suffix `— [Role Preview: Recruiter]` for screenshot clarity in bug reports.

---

### 6.2 User Impersonation System

#### 6.2.1 Initiating Impersonation

**Entry points:** User row action menu in the Users Management page; User Detail page; "Impersonate as [role]" quick-action on Tenant rows (§6.8).

**Flow:**
1. Super Admin clicks "Impersonate User" on a user record.
2. Confirmation modal shows: target user name, email, avatar, tenant, current role(s), and a **mandatory Reason field** (free-text, non-empty, stored permanently in the audit log). Optional checkbox: "Enable Permission Debugger on start."
3. Admin fills in the reason and confirms. System:
   - Calls `POST /api/admin/impersonate` with `{ targetUserId, reason, enableDebugger }`.
   - Server validates caller `is_super_admin`.
   - Server **rejects with 403** if target user is also a SuperAdmin (prevents privilege escalation).
   - Server **rejects with 409** if admin already has an active impersonation session.
   - Server generates a short-lived **impersonation JWT** (1-hour TTL) — see §6.2.6 for token payload.
   - Server writes an `impersonation_sessions` record and `admin_audit_log` entry including the reason.
   - Client stores impersonation token **in memory only** (React context — NOT `localStorage`) to prevent accidental session re-entry after page reload.
   - Emulation bar appears in header. If `enableDebugger` was checked, permission overlay activates immediately.
4. All subsequent API calls send the impersonation token via `X-Emulation-Token` header alongside the admin's own unchanged `Authorization: Bearer` header.
5. The admin's original token is never replaced — it is always available for exit.

#### 6.2.2 During Impersonation

- All data shown is the *target user's* data: their company, their dashboard, their applications, their resumes.
- All SuperAdmin-only pages (`/admin/*`) are hidden from the navigation while impersonating (still accessible via direct URL, but nav reflects emulated persona).
- The permission debugger can be toggled at any time during impersonation.

**Write-protection:** All mutating API calls are blocked server-side by default via the `emu_readonly: true` flag in the impersonation token. The following categories additionally show an explicit in-UI confirmation warning *"You are about to perform this action as [User Name]"* before sending:

| Category | Examples |
|---|---|
| Destructive deletes | Delete resume, delete application, remove team member |
| Payment / billing mutations | Subscribe, cancel plan, update payment method |
| Outbound communications | Send message, send invite, send email notification |
| Security mutations | Revoke another user's session, change password |

A future v2 setting can enable "write-through impersonation" for specific tenants with explicit SuperAdmin opt-in. In v1, all writes are blocked at the server.

#### 6.2.3 Ending Impersonation

- Click "Exit Emulation" in the emulation bar.
- System discards the impersonation token from memory, restores the admin's original token.
- Writes audit log: `IMPERSONATION_ENDED` with duration, pages visited count, blocked write attempt count.
- Redirects to the Users Management page (or wherever the admin started).
- Toast: "Impersonation session ended. Duration: 12m 33s"

#### 6.2.4 Session Limits & Constraints

- Only one active impersonation session per SuperAdmin at a time. Starting a second returns `409 Conflict`.
- A SuperAdmin **cannot impersonate another SuperAdmin**. Server rejects with `403`.
- Impersonation tokens auto-expire after **1 hour**. Warnings appear at T−10 min and T−5 min.
- On TTL expiry the session ends automatically and the admin is redirected to the Users Management page.
- Impersonation state is stored **in memory only** — it is lost on page reload, which cleanly terminates the session. No accidental "stuck" sessions.
- All active sessions are visible in a new `Impersonation Sessions` audit page.
- SuperAdmin accounts without 2FA enabled cannot initiate impersonation (blocked at the API layer).

#### 6.2.5 In-Session Role Switching

While impersonating a user, the Super Admin can switch the *active persona* mid-session without ending it. Used to compare how the same page renders under different roles.

**Behavior:**
- "Switch Role" dropdown in the emulation bar lists all system personas, with the target user's actual assigned role checkmarked.
- Selecting a persona calls `POST /api/admin/impersonate/:id/switch-role` with `{ role }`.
- Server issues a new impersonation token with the updated role claim. Page re-renders in-place.
- Emulation bar reflects the new role immediately.
- Each role switch is logged as a sub-event (`impersonation_role_switches` table).
- A **"Try any permission set" sandbox** option opens a modal to compose an ad-hoc permission set without persisting anything to the database — for one-off hypothesis testing.
- Browser tab title suffix updates to reflect the active role preview (e.g., `hired.video — [Role Preview: Employer]`).

#### 6.2.6 Emulation Token Design

**Request:**
```json
{
  "targetUserId": "uuid",
  "reason": "Customer reports billing tab is blank (ticket #1234)",
  "enableDebugger": false
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "token": "eyJ...",
  "user": { "id", "email", "firstName", "lastName", "avatarUrl" },
  "companyId": "uuid",
  "role": "recruiter",
  "permissions": ["canPostJobs", "canViewResumes", "canAccessAnalytics", "..."],
  "startedAt": "2026-03-27T14:00:00Z",
  "expiresAt": "2026-03-27T15:00:00Z"
}
```

**Token payload:**
```json
{
  "sub": "<target-user-id>",
  "email": "<target-email>",
  "roles": "<target-role>",
  "companyId": "<target-company-id>",
  "emu": true,
  "emu_by": "<superadmin-user-id>",
  "emu_sid": "<session-id>",
  "emu_readonly": true,
  "jti": "<token-id>",
  "exp": 1743087600
}
```

`emu_readonly: true` causes API middleware to reject all `POST`, `PUT`, `PATCH`, and `DELETE` requests with `403` unless the endpoint is explicitly allow-listed (none in v1).

The `X-Emulation-Token` header carries this token. `Authorization: Bearer` continues to carry the admin's own unmodified token.

#### 6.2.7 Impersonation API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/impersonate` | Start session; returns impersonation token + session metadata |
| POST | `/api/admin/impersonate/:id/end` | End active session; invalidate token |
| POST | `/api/admin/impersonate/:id/switch-role` | Switch active role mid-session; reissues token |
| GET | `/api/admin/impersonate/active` | Get current active session for this admin |
| GET | `/api/admin/impersonate/sessions` | List all sessions (paginated, filterable by admin, target, date) |
| GET | `/api/admin/impersonate/sessions/:id` | Detail + role-switch history for a session |

---

### 6.3 Permission Debugger

A toggleable overlay that annotates the live UI with which permission(s) gate each element.

**Activation:**
- Available to SuperAdmin always, even outside an impersonation session.
- Toggle via: "View Permissions" link in emulation bar, keyboard shortcut `Ctrl+Shift+P`, or header debug dropdown.
- If `enableDebugger` was checked at impersonation start, activates automatically.

#### 6.3.1 How It Works

1. A React context provider (`PermissionDebuggerProvider`) wraps the application.
2. When active, it sets `debugPermissions: true` in context.
3. Every permission-gated element is wrapped in a `<PermissionGate>` component (§6.3.3). In debug mode, `PermissionGate` renders the annotation overlay.
4. Every call to `hasPermission()` and role-gated route guards registers with the provider: component name, required permission(s), current evaluation result (granted/denied), grant source, and a DOM ref.
5. The provider renders colored borders on gated DOM elements:
   - **Green solid border** = permission granted
   - **Red dashed border** = permission denied — element is hidden but ghost outline shows where it *would* render
   - **Yellow border** = soft-gate (visible but disabled/read-only)
6. Hovering a bordered element shows a tooltip:

```
┌──────────────────────────────────────────────┐
│  Permission: canPostJobs                     │
│  Status: GRANTED                             │
│  Role: Recruiter                             │
│  Granted via: Role default                   │
│  API endpoint: POST /api/jobs                │
└──────────────────────────────────────────────┘
```

#### 6.3.2 Permission Debugger Panel (Side Drawer)

```
┌─────────────────────────────────────────────────────────┐
│  Permission Debugger                    [Copy All] [×]   │
│─────────────────────────────────────────────────────────│
│  User: Jane Doe  |  Role: Recruiter  |  Modules: 2      │
│  Active Permissions: 12 / 22 total                       │
│                                                          │
│  [Page] [User] [Role] [Missing]                          │
│─────────────────────────────────────────────────────────│
│  Permission              Status    Source       Count    │
│  ─────────────────────────────────────────────────────  │
│  canPostJobs             GRANTED   Role              2  │
│  canViewResumes          GRANTED   Role              3  │
│  canAccessAnalytics      GRANTED   Module            1  │
│  canDeleteJobs           DENIED    —                 1  │
│  canManageAccount        DENIED    —                 2  │
│  ...                                                     │
└─────────────────────────────────────────────────────────┘
```

**Panel tabs:**
- **Page** — All permissions evaluated on the current page render.
- **User** — Full list of permissions the current/emulated user holds.
- **Role** — Permissions grouped by role for comparison across all roles.
- **Missing** — Only denied permissions (including elements not rendered at all, not just disabled).

**Panel columns:**
- **Permission** — Permission key. Clickable — links to the Role Management page entry for that permission.
- **Status** — GRANTED / DENIED / CONDITIONALLY GRANTED.
- **Source** — "Role" (from role default), "Module" (from a module assignment), "Override" (per-user grant), "—" (denied with no grant source).
- **Count** — Number of UI elements on the current page gated by this permission.
- **"Copy All"** — Exports the full page permission matrix as JSON/CSV for bug reports.

#### 6.3.3 `PermissionGate` Component

Every permission-gated UI element uses this wrapper:

```tsx
// Standard usage
<PermissionGate permission="canPostJobs" fallback={<LockedState />}>
  <PostJobButton />
</PermissionGate>

// In debug mode:
//   Granted  → green border + tooltip on <PostJobButton />
//   Denied   → red dashed ghost box where <PostJobButton /> would have been
//   Soft-gate → yellow border on fallback content
```

Root DOM element carries debug attributes for CSS selector targeting:
```html
<div data-permission="canPostJobs" data-permission-status="granted">
```

All existing inline `hasPermission()` checks must be migrated to `PermissionGate` as part of the implementation.

**Scope of elements to annotate:**
- Navigation sidebar items
- Dashboard sections and stat cards
- Action buttons (Post Job, Edit Job, Delete Job, Invite Member, etc.)
- Page-level route guards (AdminDashboard, employer-only pages)
- Form fields that are read-only for some roles
- Any panel or section conditionally rendered by role

---

### 6.4 Role & Permission Management

Route: `/admin/roles`
Access: SuperAdmin only

#### 6.4.1 Role List

| System Roles (read-only) | Custom Roles (editable) |
|---|---|
| SuperAdmin, Admin, Employer, Recruiter, JobSeeker, Affiliate | User-defined roles created in this portal |

System role permissions are visible but not editable. Changes are stored as `role_permission_overrides` — the default permission set is the baseline and overrides layer on top. This allows future recovery of the original defaults.

**Role inheritance:** Custom roles can inherit all permissions from a base system role and extend or restrict from there. A role **cannot grant permissions its creator does not themselves hold** — validated server-side on every role update to prevent privilege escalation via role creation.

**Role assignment expiry:** When assigning a role to a user, the admin can optionally set an expiry date. The system auto-revokes the role at expiry and writes an `USER_ROLE_EXPIRED` audit event.

**Export:** Permission matrix exportable as CSV for compliance review.

#### 6.4.2 Permission Matrix View

```
Permission              | SuperAdmin | Admin | Employer | Recruiter | JobSeeker | Affiliate
─────────────────────────────────────────────────────────────────────────────────────────
canManageJobs           |     ✓      |   ✓   |    ✓     |     ✓     |           |
canViewResumes          |     ✓      |   ✓   |    ✓     |     ✓     |           |
canCreateResume         |     ✓      |       |          |           |     ✓     |
canPostJobs             |     ✓      |   ✓   |    ✓     |     ✓     |           |
canEditJobs             |     ✓      |   ✓   |    ✓     |     ✓     |           |
canDeleteJobs           |     ✓      |   ✓   |    ✓     |           |           |
canManageAccount        |     ✓      |   ✓   |    ✓     |           |           |
canManageTeam           |     ✓      |   ✓   |    ✓     |           |           |
canAccessAnalytics      |     ✓      |   ✓   |    ✓     |     ✓     |           |
canSendOutreach         |     ✓      |   ✓   |    ✓     |     ✓     |           |
canAccessAffiliatePortal|     ✓      |       |          |           |           |     ✓
canUseAICoach           |     ✓      |       |          |           |     ✓     |
canUploadVideo          |     ✓      |       |          |           |     ✓     |
canAccessInterviewPractice|   ✓      |       |          |           |     ✓     |
system:impersonate      |     ✓      |       |          |           |           |
system:debugPermissions |     ✓      |       |          |           |           |
system:manageRoles      |     ✓      |       |          |           |           |
system:manageModules    |     ✓      |       |          |           |           |
```

Inline toggles to grant/revoke permissions per role. Changes take effect system-wide with a confirmation warning.

#### 6.4.3 User Role Assignment (User Detail)

Extend the user detail panel:
- **Role field** — Current role as a badge. SuperAdmin can change to any role.
- **Role expiry** — Optional date field for time-bounded role grants.
- **Permission overrides** — Section to grant or revoke specific permissions on a per-user basis beyond their role defaults. Stored in `user_permission_overrides`.
- **Effective Permissions** — Read-only computed section showing resolved permissions: role defaults + user overrides − user revocations.
- **History** — Last 10 role/permission changes with who made them and when.

---

### 6.5 Module → Permission → Role Mapping

A **Module** is a named feature bundle. Assigning a module to a user automatically grants the correct role and granular permissions.

Route: `/admin/modules`

#### 6.5.1 Module Definition

| Field | Description |
|---|---|
| `name` | Display name (e.g., "Job Posting") |
| `description` | What this module enables |
| `requiredRole` | Minimum role needed (e.g., Recruiter) |
| `permissions[]` | Explicit permission keys granted |
| `planTier` | Free \| Pro \| Enterprise |
| `isActive` | Toggle to disable without deleting |

#### 6.5.2 Module Assignment Flow

1. Open user detail → Modules tab → "Assign Module"
2. System shows a preview: "This will add the Recruiter role and grant: canPostJobs, canViewResumes, canEditJobs."
3. If user's current role does not satisfy `requiredRole`, prompts to also update role.
4. On confirm: `user_module_assignments` record created; permission overrides written to `user_permission_overrides`; role updated if needed. All atomic.
5. Audit log entry created.
6. Disabling a module reverses the grant (with a warning if the role is shared with another active module).

#### 6.5.3 Initial Module Set

| Module | Required Role | Permissions Granted |
|---|---|---|
| Job Posting | Recruiter / Employer | canPostJobs, canEditJobs, canDeleteJobs, canManageJobs |
| Resume Review | Recruiter / Employer | canViewResumes |
| Video Studio | JobSeeker | canCreateResume, canUploadVideo |
| AI Coach | JobSeeker | canUseAICoach |
| Interview Practice | JobSeeker | canAccessInterviewPractice |
| Outreach | Recruiter | canSendOutreach |
| Analytics | Employer / Recruiter | canAccessAnalytics |
| Team Management | Employer | canManageTeam, canManageAccount |
| Affiliate Program | Affiliate | canAccessAffiliatePortal |

#### 6.5.4 Module Management Page

- CRUD for modules.
- Visual permission builder: checkbox list of all known permissions to add to a module.
- Preview section showing which users currently have each module enabled.

---

### 6.6 Cross-Tenant User Management

Route: `/admin/users`
Access: SuperAdmin only

#### 6.6.1 User List

| Column | Notes |
|---|---|
| Name / Email | Full-text search across all tenants |
| Tenant / Company | Filter by company |
| Plan | Free / Pro / Enterprise |
| Role | Badge, filterable |
| 2FA Status | Enabled / Disabled badge |
| Status | Active / Suspended |
| Last Active | Sortable |
| Created | Sortable |
| Actions | View · Impersonate · Edit Role · Suspend · Reset Password |

**Filters:** Role, Plan, Status, Tenant, Date Range, 2FA Enabled.

**Bulk operations** (via checkbox selection):
- Bulk suspend / unsuspend
- Bulk assign module
- Bulk role assignment
- Bulk export (CSV) of selected user records

All bulk operations write a `BULK_OPERATION` audit event capturing all affected user IDs.

#### 6.6.2 User Detail Page

Route: `/admin/users/:userId`

**Tabs:**

1. **Profile** — Avatar, name, email, phone, joined date, email verified flag, consent timestamps, active session count.
2. **Roles & Permissions** — Current role, effective permissions table, module assignments, per-user overrides, role change history. Includes "Impersonate as this user" shortcut.
3. **Tenant / Company** — Company name, user's company role (member/manager/owner), other members.
4. **Sessions** — All active sessions (IP, user-agent, last seen). Revoke individual or all sessions (increments `session_version`).
5. **Security Log** — Login history with IP/device/method. Impersonation sessions *targeting this user* — who impersonated them, when, duration. This is the admin view; the user sees a limited version in their own Account Settings (§6.11).
6. **Subscription** — Plan, billing status, Stripe customer ID.

**Actions available from user detail:**
- Impersonate
- Suspend / Activate
- Reset Password (sends reset email)
- Force Email Verification
- Revoke All Sessions
- Disable 2FA (with mandatory audit log entry — used when user has lost their authenticator)
- Assign / Remove Role (with optional expiry)
- Assign / Remove Module

---

### 6.7 Tenant Management

Route: `/admin/tenants`

- List all companies with: Name, Owner, Member Count, Plan, Created Date, Status.
- Click through to company detail: members, roles, billing, usage metrics.
- **"Impersonate as [primary role]" quick-action** on each tenant row — starts impersonation as that tenant's primary owner in one click, bypassing the user search step.
- Actions: Suspend tenant, change plan, view all associated users.

---

### 6.8 Backend Authorization Enforcement (Critical Security Fix)

**Current problem:** `/api/admin/*` routes have no `isSuperAdmin` check. Any valid JWT holder can call them.

**Fix:** Add `superAdminMiddleware` to all admin routes.

```typescript
// api/src/middleware/superAdmin.ts
export const superAdminMiddleware = async (c: Context, next: Next) => {
  const user = c.var.user;
  if (!user?.isSuperAdmin) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
};
```

Apply to all routes in: `admin.ts`, future `impersonation.ts`, `roles.ts`, `modules.ts`.

Additionally, the auth middleware must check the `emu_readonly` flag on impersonation tokens and reject mutating verbs:

```typescript
if (token.emu_readonly && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
  return c.json({ error: 'Write operations are blocked during impersonation' }, 403);
}
```

---

### 6.9 Audit Logging

Every SuperAdmin action must be written to `admin_audit_log`. Entries are append-only — cannot be edited or deleted via any API. Minimum retention: 12 months.

**Required audit events:**

| Event | Trigger |
|---|---|
| `IMPERSONATION_STARTED` | SuperAdmin begins impersonating a user (includes reason) |
| `IMPERSONATION_ENDED` | SuperAdmin exits impersonation (includes duration, pages visited, write block count) |
| `IMPERSONATION_EXPIRED` | Token TTL exceeded |
| `IMPERSONATION_WRITE_BLOCKED` | Write attempt blocked during impersonation (captures attempted endpoint + method) |
| `IMPERSONATION_PERSONA_SWITCHED` | Admin switches role mid-session |
| `USER_ROLE_CHANGED` | SuperAdmin assigns/removes a role |
| `USER_ROLE_EXPIRY_SET` | Role assigned with an expiry date |
| `USER_ROLE_EXPIRED` | Role automatically revoked at expiry |
| `USER_PERMISSION_OVERRIDE` | Per-user permission granted or revoked |
| `USER_STATUS_CHANGED` | User activated or suspended |
| `USER_SESSIONS_REVOKED` | All sessions invalidated |
| `ROLE_PERMISSION_CHANGED` | Role-level permission matrix updated |
| `MODULE_ASSIGNED` | Module assigned to user |
| `MODULE_REMOVED` | Module removed from user |
| `2FA_DISABLED_BY_ADMIN` | 2FA reset by admin (mandatory entry) |
| `PASSWORD_RESET_FORCED` | Admin-initiated password reset |
| `BULK_OPERATION` | Bulk suspend/assign capturing all affected user IDs |

**Audit log viewer** (`/admin/audit-log`): Filterable, paginated view. Filter by: event type, acting admin, target user, target tenant, date range. Export to CSV.

**Audit log viewer for impersonation sessions** (`/admin/impersonation-sessions`): All sessions with admin, target user, tenant, duration, reason, end reason. Drill into a session to see individual role switches.

---

### 6.10 Target User Transparency

Users should have visibility that a SuperAdmin accessed their account, without exposing confidential admin details.

**What users see** (in their Account Settings → Security):
- "Recent Admin Access" section showing dates when their account was accessed via impersonation.
- Fields shown: Date/time, Duration, Reason summary (e.g., "Support investigation"). Admin identity intentionally not shown.
- No real-time notification (avoids tipping off a fraud subject if impersonation is part of a fraud investigation). Post-session visibility only.

(See Open Question #6 for whether real-time notification is required.)

---

## 7. Data Model

### 7.1 New Tables

```sql
-- Replace hardcoded email SuperAdmin check
ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
-- Incrementing session_version invalidates all existing JWTs without a blocklist

-- Impersonation sessions
CREATE TABLE impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id UUID NOT NULL REFERENCES users(id),
  target_user_id UUID NOT NULL REFERENCES users(id),
  target_company_id UUID REFERENCES companies(id),
  token_id TEXT NOT NULL UNIQUE,             -- jti claim from the JWT
  reason TEXT NOT NULL,                     -- mandatory; stored immutably
  debugger_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  end_reason TEXT,                          -- 'manual' | 'expired' | 'admin_logout'
  pages_visited JSONB NOT NULL DEFAULT '[]',
  write_block_count INTEGER NOT NULL DEFAULT 0
);

-- In-session role switches
CREATE TABLE impersonation_role_switches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES impersonation_sessions(id),
  from_role TEXT NOT NULL,
  to_role TEXT NOT NULL,
  switched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role-level permission overrides (layers on top of coded defaults)
CREATE TABLE role_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,                       -- system role slug
  permission_key TEXT NOT NULL,
  granted BOOLEAN NOT NULL,                 -- true = explicit grant, false = explicit revoke
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role, permission_key)
);

-- Modules (feature bundles)
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  required_role TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  permissions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User module assignments
CREATE TABLE user_module_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  module_id UUID NOT NULL REFERENCES modules(id),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id, module_id)
);

-- Per-user permission overrides
CREATE TABLE user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  permission_key TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL,                     -- 'module:<module_id>' | 'direct'
  granted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, permission_key)
);

-- Role assignment expiry
CREATE TABLE user_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT
);

-- Admin audit log (append-only)
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES users(id),
  impersonation_session_id UUID REFERENCES impersonation_sessions(id),
  action TEXT NOT NULL,
  target_type TEXT,                         -- 'user' | 'role' | 'module' | 'tenant'
  target_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- No UPDATE or DELETE permissions granted on this table to the API user
```

---

## 8. API Endpoints (Complete List)

### Impersonation

| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/impersonate` | Start session; returns impersonation token + session metadata |
| POST | `/api/admin/impersonate/:id/end` | End active session; invalidate token |
| POST | `/api/admin/impersonate/:id/switch-role` | Switch role mid-session; reissues token |
| GET | `/api/admin/impersonate/active` | Get current active session for this admin |
| GET | `/api/admin/impersonate/sessions` | List all sessions (paginated) |
| GET | `/api/admin/impersonate/sessions/:id` | Detail + role-switch history |

### User Management

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/users` | Paginated cross-tenant user list |
| GET | `/api/admin/users/:id` | User detail |
| PUT | `/api/admin/users/:id/role` | Assign role (with optional expiry) |
| PUT | `/api/admin/users/:id/permissions` | Per-user permission overrides |
| PUT | `/api/admin/users/:id/status` | Activate / suspend |
| POST | `/api/admin/users/:id/reset-password` | Send password reset email |
| POST | `/api/admin/users/:id/revoke-sessions` | Invalidate all sessions (increments `session_version`) |
| PUT | `/api/admin/users/:id/2fa` | Disable 2FA (with mandatory audit entry) |
| POST | `/api/admin/users/:id/modules` | Assign module |
| DELETE | `/api/admin/users/:id/modules/:moduleId` | Remove module |

### Roles & Modules

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/roles` | List roles + permission matrix |
| PUT | `/api/admin/roles/:role/permissions` | Update role permissions |
| GET | `/api/admin/modules` | List modules |
| POST | `/api/admin/modules` | Create module |
| PUT | `/api/admin/modules/:id` | Update module |
| DELETE | `/api/admin/modules/:id` | Deactivate module |

### Audit

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/audit` | Audit log (filter by event, actor, target, date range) |

---

## 9. Frontend Architecture

### 9.1 New Components

| Component | Path | Purpose |
|---|---|---|
| `EmulationBar` | `frontend/components/EmulationBar.tsx` | Header banner during impersonation/role preview |
| `PersonaPreviewDropdown` | `frontend/components/PersonaPreviewDropdown.tsx` | Role switcher for preview mode (no specific user) |
| `ImpersonationModal` | `frontend/components/ImpersonationModal.tsx` | Confirm dialog with mandatory reason field |
| `PermissionDebuggerProvider` | `frontend/providers/PermissionDebuggerProvider.tsx` | Context provider tracking all permission checks |
| `PermissionDebuggerPanel` | `frontend/components/PermissionDebuggerPanel.tsx` | Side drawer with Page/User/Role/Missing tabs |
| `PermissionGate` | `frontend/components/PermissionGate.tsx` | Wrapper HOC for every gated UI element |
| `RolesPermissionMatrix` | `frontend/pages/admin/components/RolesPermissionMatrix.tsx` | Full role × permission grid with toggles |
| `ModuleAssignmentPanel` | `frontend/pages/admin/components/ModuleAssignmentPanel.tsx` | Module toggles within user detail |
| `UserPermissionOverrideForm` | `frontend/pages/admin/components/UserPermissionOverrideForm.tsx` | Per-user permission grants/revocations |

### 9.2 New Pages

| Page | Route | Purpose |
|---|---|---|
| `UsersManagementPage` | `/admin/users` | Cross-tenant user search and management |
| `UserDetailPage` | `/admin/users/:id` | Full user profile with all tabs |
| `RolesManagementPage` | `/admin/roles` | Role × permission matrix editor |
| `ModulesManagementPage` | `/admin/modules` | Module CRUD and permission builder |
| `TenantsManagementPage` | `/admin/tenants` | All companies/tenants |
| `ImpersonationSessionsPage` | `/admin/impersonation-sessions` | Audit of all impersonation sessions |
| `AuditLogPage` | `/admin/audit-log` | Full admin action audit log with filter/export |

### 9.3 Modified Components

| Component | Change |
|---|---|
| `PersonaSwitcher.tsx` | Replace entirely with `EmulationBar.tsx` + `PersonaPreviewDropdown.tsx` |
| `Navigation.tsx` / `Sidebar.tsx` | Add admin portal link (SuperAdmin only); hide SA-only nav items during impersonation |
| `auth.tsx` | Support dual-token (own + impersonation); expose `isImpersonating`, `impersonatedUser`, `impersonationSession` |
| `usePermissions.ts` | Read impersonation session permissions when active; expose `debugMode`, `registerPermissionCheck()` |
| All gated buttons/panels | Migrate inline `hasPermission()` checks to `<PermissionGate>` |
| SuperAdmin check | Replace `email === 'seanhogg@gmail.com'` with `user.isSuperAdmin` |

### 9.4 State Management

- **Impersonation state:** React context + module-level variable. **NOT `localStorage`**. Page reload cleanly terminates the session.
- **Permission debugger state:** React context only. Reset on page navigation between pages.
- **Persona preview state:** React context only. Does not affect API calls.

---

## 10. Security Requirements

1. All impersonation and role-management endpoints reject non-SuperAdmin callers with `403`. Enforced server-side — frontend checks alone are insufficient.
2. Impersonation tokens are read-only by default. `emu_readonly: true` causes the middleware to reject all mutating verbs unless explicitly allow-listed (none in v1).
3. Server rejects impersonation of any user with `is_super_admin = true` with `403`.
4. Server rejects a second impersonation start if one is active. Returns `409 Conflict`.
5. The emulation token travels in `X-Emulation-Token`, never in `Authorization: Bearer`. The admin's own token is never altered.
6. Impersonation state stored in memory only — not `localStorage`. Page reload terminates the session.
7. The `reason` field is required and non-empty. Requests without it return `400`. Stored immutably.
8. Impersonation tokens expire after 1 hour and are non-renewable. Admin must start a new session.
9. `session_version` on the users table enables instant session revocation without a token blocklist. Auth middleware validates the version in the JWT matches the DB value.
10. Audit log entries are append-only. No `UPDATE` or `DELETE` permissions granted on `admin_audit_log` to the API database user.
11. SuperAdmin accounts without 2FA enabled are blocked from initiating impersonation (API layer).
12. Role editor cannot grant permissions the creating admin does not themselves hold (validated server-side).
13. Impersonation tokens carry `targetCompanyId` and auth middleware uses it for all data-scoping decisions.
14. SuperAdmin identification uses `is_super_admin` database column — never the email string.

---

## 11. UX Flows

### 11.1 Impersonation (Happy Path)

```
SuperAdmin on UsersManagementPage
  → Searches for target user (name / email / user ID)
  → Clicks ⋯ → "Impersonate User"
  → Confirmation modal: Jane Doe · jane@acme.com · Acme Corp · Recruiter
  → Admin types reason: "Customer reports job postings not appearing (ticket #4821)"
  → Optionally checks "Enable Permission Debugger on start"
  → Clicks "Start Impersonation"
  → [API: POST /api/admin/impersonate { targetUserId, reason, enableDebugger }]
  → Amber emulation bar appears in header — cannot be dismissed
  → App re-renders as Jane Doe's data and role
  → SuperAdmin navigates, tests, reproduces bug
  → (Optional) Switches role via "Switch Role" dropdown
  → Clicks "Copy Context" to capture bug-report JSON
  → Clicks "Exit Emulation" in bar
  → [API: POST /api/admin/impersonate/:id/end]
  → Returns to UsersManagementPage as SuperAdmin
  → Toast: "Impersonation session ended. Duration: 12m 33s"
```

### 11.2 Persona Role Preview (No Specific User)

```
SuperAdmin on any page
  → Clicks "Preview as role" dropdown in header
  → Selects "Employer"
  → [Frontend only — no API call]
  → Blue "PREVIEWING EMPLOYER ROLE" bar appears
  → Current page re-renders with Employer permissions applied
  → Browser tab: "hired.video — [Role Preview: Employer]"
  → SuperAdmin validates correct panels show/hide
  → Clicks "Exit Preview" or selects another role
```

### 11.3 Permission Debugger Flow

```
SuperAdmin (any state)
  → Clicks "Permission Debug" in header (or Ctrl+Shift+P)
  → All gated elements get colored borders:
      Green = granted, Red dashed = denied, Yellow = soft-gate
  → Side panel opens with Page/User/Role/Missing tabs
  → Red dashed ghost outlines show where denied elements would render
  → Hovering a border shows:
      "Permission: canPostJobs | GRANTED | Role: Recruiter | Source: Role default"
  → Clicks permission name in panel → jumps to RolesManagementPage for that permission
  → Clicks "Copy All" → exports permission matrix as JSON
  → Toggles off via same button or Ctrl+Shift+P
```

---

## 12. Acceptance Criteria

### Impersonation

- [ ] SuperAdmin can search and select any user from the impersonation dialog
- [ ] Confirmation modal requires a non-empty reason before allowing start
- [ ] Attempting to impersonate a SuperAdmin returns `403` with explanation
- [ ] Attempting to start a second session while one is active returns `409` with explanation
- [ ] Impersonation token issued server-side with 1-hour TTL, carrying `emu: true`, `emu_by`, `emu_sid`, `emu_readonly: true`
- [ ] Token delivered in response body; frontend stores in memory only (not localStorage)
- [ ] All data shown reflects the impersonated user's tenant/company scope
- [ ] Emulation bar appears immediately with correct user, tenant, role, permissions count, and session timer
- [ ] Session timer turns amber at T−50 minutes
- [ ] Warning toasts appear at T−10 min and T−5 min; session auto-exits cleanly at TTL
- [ ] "Copy Context" copies a valid JSON blob to clipboard
- [ ] All mutating API calls return `403` during impersonation (server-enforced via `emu_readonly`)
- [ ] Clicking "Exit Emulation" revokes the token and restores admin context
- [ ] Page reload terminates the session (no state in localStorage)
- [ ] `IMPERSONATION_STARTED` and `IMPERSONATION_ENDED` audit events written with reason captured
- [ ] Target user sees an entry in their Account Settings → Security after session ends

### In-Session Role Switching

- [ ] "Switch Role" dropdown lists all system roles; target user's actual role is checkmarked
- [ ] Switching role calls switch-role endpoint and re-renders page with new role context
- [ ] Role switch does not modify the target user's stored role in the database
- [ ] Each role switch recorded as an `impersonation_role_switches` sub-event
- [ ] "Try any permission set" sandbox composes ad-hoc permissions with no DB write
- [ ] Browser tab title suffix updates to reflect the active preview role

### Permission Debugger

- [ ] Toggling debugger shows colored borders on all `PermissionGate`-wrapped elements
- [ ] Green = granted, red dashed = denied (with ghost outline), yellow = soft-gate
- [ ] Tooltip on hover shows: permission name, status, role, grant source
- [ ] Side panel shows all permissions evaluated on the current page with all four tabs
- [ ] "Missing Permissions" tab shows only denied permissions including elements not rendered
- [ ] Permission names in panel are clickable links to RolesManagementPage
- [ ] "Copy All" exports the full page permission matrix as JSON/CSV
- [ ] Debugger works in normal mode, impersonation mode, and persona preview mode
- [ ] Keyboard shortcut `Ctrl+Shift+P` toggles the debugger

### Persona Preview Mode

- [ ] "Preview as role" dropdown in header lists all system roles
- [ ] Selecting a role re-renders the current page with that role's permissions (frontend only)
- [ ] Blue bar (distinct from amber impersonation bar) appears during preview
- [ ] Browser tab title gains suffix for the active preview role
- [ ] No API calls are made during persona preview; only frontend permission logic changes

### Role Management

- [ ] `/admin/roles` shows the full role × permission matrix
- [ ] SuperAdmin can toggle a permission for a system role; change persists to DB via override record
- [ ] Custom roles can be created with selected permissions
- [ ] Custom role cannot be created granting permissions the admin does not hold (server-enforced)
- [ ] Role assignment expiry works: role auto-revoked at expiry with audit event
- [ ] Export generates a valid CSV of the full permission matrix

### Module Management

- [ ] Modules can be created with a required role and a set of permissions
- [ ] Assigning a module to a user grants the role + permissions atomically
- [ ] Removing a module reverses the grants (with conflict warning if role is shared)
- [ ] Module assignments appear in the user's effective permissions view

### User Management

- [ ] SuperAdmin can search all users by name/email across all tenants
- [ ] User detail shows profile, roles, effective permissions, sessions, security log, subscription
- [ ] SuperAdmin can assign or revoke a role with optional expiry date
- [ ] SuperAdmin can grant or revoke individual permissions for a user
- [ ] Effective permissions show resolved final set (role defaults + overrides − revocations)
- [ ] "Revoke All Sessions" increments `session_version`, invalidating all JWTs within one request cycle
- [ ] Admin-initiated 2FA disable works and writes mandatory audit entry
- [ ] Bulk suspend/unsuspend operates on selected users and writes `BULK_OPERATION` audit event
- [ ] Bulk export generates a valid CSV of selected user records

### Security

- [ ] Non-SuperAdmin users receive `403` on all `/api/admin/*` routes
- [ ] SuperAdmin check uses `is_super_admin` column, not email string
- [ ] SuperAdmin without 2FA enabled cannot initiate impersonation
- [ ] Impersonation tokens cannot perform any mutating operations
- [ ] Attempting to create a role with permissions the admin doesn't hold returns `403`
- [ ] Nested impersonation is rejected by the backend
- [ ] All acceptance criteria above produce the correct audit log entries
- [ ] Audit events cannot be deleted or modified via any API

---

## 13. Implementation Phases

### Phase 1 — Security Foundation (prerequisite for all other phases)
1. Add `is_super_admin` and `session_version` columns to the `users` table.
2. Add `superAdminMiddleware` to all existing `/api/admin/*` routes.
3. Update auth middleware to check `session_version` on every request.
4. Replace all `email === 'seanhogg@gmail.com'` checks in the frontend with `user.isSuperAdmin`.
5. Write `admin_audit_log` entries for existing admin mutation endpoints.

### Phase 2 — Impersonation Core
1. `impersonation_sessions` and `impersonation_role_switches` tables + migrations.
2. `POST /api/admin/impersonate`, `POST /api/admin/impersonate/:id/end`.
3. `emu_readonly` middleware blocking mutating verbs on impersonation tokens.
4. Frontend impersonation state management (in-memory context, dual-token approach).
5. `EmulationBar` component in header (amber variant).
6. `ImpersonationModal` confirmation dialog with mandatory reason field.
7. "Impersonate" action on user rows in Users Management page.

### Phase 3 — Permission Debugger
1. `PermissionDebuggerProvider` context wrapping the app.
2. `PermissionGate` HOC + DOM `data-permission` attributes.
3. Update all existing inline `hasPermission()` checks to use `PermissionGate`.
4. `PermissionDebuggerPanel` side drawer with Page/User/Role/Missing tabs.
5. Colored border overlay engine (green/red dashed/yellow).
6. Header toggle button + `Ctrl+Shift+P` keyboard shortcut (SuperAdmin only).

### Phase 4 — Persona Role Preview
1. `PersonaPreviewDropdown` in header.
2. Frontend persona override context (no API call, frontend-only).
3. Blue "PREVIEWING [ROLE] ROLE" variant of `EmulationBar`.
4. Browser tab title suffix for active preview.

### Phase 5 — In-Session Role Switching
1. `POST /api/admin/impersonate/:id/switch-role` endpoint.
2. "Switch Role" dropdown in emulation bar.
3. "Try any permission set" sandbox modal.
4. Role-switch event logging to `impersonation_role_switches`.

### Phase 6 — Role & Module Management
1. `role_permission_overrides`, `modules`, `user_module_assignments`, `user_permission_overrides` tables.
2. Role APIs: `GET/PUT /api/admin/roles/:role/permissions`.
3. Module APIs: full CRUD + `POST/DELETE /api/admin/users/:id/modules`.
4. `RolesManagementPage` with permission matrix and inline toggles.
5. `ModulesManagementPage` with CRUD and permission builder.
6. Module assignment panel in user detail page.
7. User permission override form in user detail page.
8. Role assignment expiry enforcement (cron job or on-access check).

### Phase 7 — Audit Log, Sessions UI & Target Transparency
1. `AuditLogPage` with filter, pagination, and CSV export.
2. `ImpersonationSessionsPage` with session detail and role-switch history.
3. User detail Security Log tab — impersonation sessions targeting this user.
4. Target user "Recent Admin Access" section in Account Settings → Security.
5. "Impersonate as [primary role]" quick-action on Tenant rows.
6. Bulk operations (suspend, module assign, export) on user list.

---

## 14. Observability & Monitoring

### 14.1 Live Sessions Dashboard

Add an **Active Impersonation Sessions** widget to the Super Admin Portal home showing:
- All currently active sessions (admin name, target user, tenant, start time, elapsed time).
- Sessions in the last 24h (with end reason).
- Quick "Terminate Session" action per row (force-ends a session).

### 14.2 Alerts

| Alert | Threshold | Channel |
|---|---|---|
| Long impersonation session | Session active > 30 minutes | Slack + email to designated security contact |
| Bulk permission change | > 10 users modified in < 5 minutes | Slack security alert |
| Multiple failed impersonation attempts | > 3 `403` responses in 10 minutes from same admin | Slack security alert |
| SuperAdmin 2FA disabled | Any time | Immediate Slack + email |
| Impersonation write blocked | Any time | Log + session record increment |

### 14.3 Platform Metrics

| Metric | Description |
|---|---|
| `impersonation_sessions_started` | Daily count of sessions started |
| `impersonation_session_duration_p50_p95` | Session length distribution |
| `impersonation_write_blocks` | Safety signal — how often admins attempt writes |
| `permission_debugger_opens` | Adoption signal for the debugger tool |
| `role_assignments_created` | RBAC adoption tracking |
| `module_assignments_created` | Module adoption tracking |

---

## 15. Identified Gaps in Current hired.video System

| Gap | Current State | Resolution in this PRD |
|---|---|---|
| Backend impersonation | localStorage persona only; API responds as SuperAdmin | Impersonation JWT with `emu` claims; `X-Emulation-Token` header |
| SuperAdmin identification | `email === 'seanhogg@gmail.com'` hardcoded | `is_super_admin` DB column + `superAdminMiddleware` |
| Admin route authorization | No auth middleware on `/api/admin/*` | `superAdminMiddleware` on all admin routes |
| Cross-tenant user search | Not implemented | `/api/admin/users` with cross-tenant query |
| Role assignment UI | Not implemented | Role management portal with permission matrix |
| Module system | Not implemented | Module table + assignment flow |
| Granular permission overrides | Not implemented | `user_permission_overrides` table |
| Permission debugger | Not implemented | `PermissionGate` HOC + debug overlay with panel |
| Audit logging | Not implemented | `admin_audit_log` table; all SA actions logged |
| Custom roles | Not implemented | Role editor with inheritance and escalation prevention |
| Impersonation bar visibility | Compact `PersonaSwitcher` in dashboard only | Sticky header bar visible on all pages |
| Impersonation session timeout | Persona persists indefinitely in localStorage | 1-hour JWT expiry with T−10/T−5 warnings |
| Tenant management UI | Not implemented | `/admin/tenants` with quick-impersonate action |
| In-session role switching | Frontend-only localStorage | Server-issued token update with `impersonation_role_switches` logging |
| Write-protection during impersonation | Not enforced | `emu_readonly` flag + server middleware |
| Mandatory impersonation reason | Not required | Required field stored in `impersonation_sessions.reason` |
| Target user transparency | Not implemented | "Recent Admin Access" in Account Settings → Security |
| Role assignment expiry | Not implemented | `user_role_assignments.expires_at` + auto-revocation |
| Session revocation | Not implemented | `session_version` increment on User; checked by auth middleware |
| 2FA enforcement for SuperAdmin | Not enforced | API blocks impersonation if SA lacks 2FA |
| Bulk user operations | Not implemented | Checkbox selection + bulk actions + `BULK_OPERATION` audit event |
| Impersonation write blocking | Not enforced | `emu_readonly: true` token flag; middleware blocks all mutating verbs |

---

## 16. Open Questions

| # | Question | Owner | Due |
|---|---|---|---|
| 1 | Should write-through impersonation (allowing writes as the user) be a v2 per-tenant opt-in setting, or remain permanently blocked? | Product | v2 planning |
| 2 | Should users receive a real-time notification when an admin accesses their account, or only a post-session security log entry? Real-time risks tipping off a fraud subject. | Legal/Product | Before Phase 7 build |
| 3 | Should custom roles be scoped per-tenant (tenant RBAC, v2) or remain global SuperAdmin-only? | Product | Before Phase 6 build |
| 4 | What plan tier gates which modules? Need module/plan matrix sign-off. | Finance | Before Phase 6 build |
| 5 | Audit log retention period: SOC 2 recommends ≥ 12 months; GDPR may require deletion of personal data within that window. Legal must resolve the conflict. | Legal | Before Phase 1 build |
| 6 | Is a JWT blocklist needed for immediate token revocation, or is `session_version` increment sufficient? (Version approach has a brief window where the old token remains valid until the next request.) | Engineering | Before Phase 2 build |
| 7 | Should the persona role preview mode affect API calls (returning permission-gated data from the server) or only frontend visibility gates? Affects backend complexity significantly. | Engineering | Before Phase 4 build |
| 8 | Should FOUNDER/Employer-level users be able to create scoped custom roles for their own company (tenant RBAC v2)? If yes, what is the privilege escalation boundary? | Product | v2 planning |
| 9 | Should impersonation be time-restricted (e.g., only during business hours in the target user's timezone)? | Security | v2 planning |
| 10 | Should the platform send a Slack/email alert to a designated security contact when any impersonation session exceeds 30 minutes? | Security | Before Phase 2 build |

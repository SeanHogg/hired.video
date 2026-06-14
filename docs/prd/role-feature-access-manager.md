# PRD — Role Feature & Navigation Access Manager (SuperAdmin RBAC manifest)

**Owner:** hired.video Platform.
**Status:** Spec — extends the partial fix shipped as gap #1995 (Sidebar `hideForRoles` deny-list). Net-new SuperAdmin surface; no full reference implementation exists, but it deliberately models the **Dashboard Feed Curation** pattern ([DashboardFeedCuration.tsx](../../frontend/pages/admin/DashboardFeedCuration.tsx) + [feed_features](../../api/src/db/schema/feedFeatures.ts), see [[project_dashboard_feed]]).
**Opened:** 2026-06-13.
**Surfaces:**
- SuperAdmin UI: `/admin/role-access` — per-role tabs (job_seeker · recruiter · employer · employee · creator · affiliate · admin · super_admin), grouped toggle lists for Navigation / Tools / Feature Modules / Admin tabs, drag-to-rank for nav order, "Preview as role", reset-to-default.
- External API: `/api/admin/role-access/*` (SuperAdmin-gated CRUD) + `/api/role-access/me` (cached, per-request consumer read).
- Shared resolver: one `resolveRoleAccess(role)` seam + a single `useRoleAccess()` hook that **every** menu/tool/feature gate self-consumes (DRY) — replacing the six hardcoded gates enumerated in §1.

This is the document behind the "menu/nav shows every item to every role" Consolidated Gap Register entry (#1995). It exists so the owner's headline complaint — *"the product feels too complex; each role should only see what's relevant"* — becomes **true by configuration**, editable by a non-engineer, without a code deploy per change.

---

## 0. Strategic framing

hired.video serves six product-facing personas with sharply different jobs-to-be-done:

- **job_seeker** — promote yourself, get hired (resume video, AI career tooling, jobs, applications).
- **recruiter** — source + submit candidates, run a marketplace pipeline.
- **employer / employee** — post jobs, hire, run a small back-office (People Ops, roster, tasks); the `employee` sub-persona is invite-only back-office ([[project_employee_role]]).
- **affiliate** — refer + earn; almost none of the authoring surfaces apply ([[project_creator_persona_model]]).
- **creator (gig)** — sell gigs/services + content ([[project_gig_marketplace]]).

Today the **same menu, the same tool catalog, and the same feature set render to all of them**, trimmed only by a handful of hardcoded exceptions. The result is the "too complex" problem: an affiliate sees Studio/Resumes/Companies/Outreach/Gigs they will never use; a recruiter sees job-seeker resume tools; a creator sees Outreach. The fix shipped for #1995 was a deny-list bolted onto one component — correct in spirit, but it (a) lives only in the desktop Sidebar, (b) is hardcoded, so streamlining a role still requires an engineer + deploy, and (c) does nothing for the other five surfaces that gate by role.

The right shape is a **single, SuperAdmin-editable, per-role access manifest** with one shared resolver that all surfaces consume. This concentrates "what does role X see" into one place (SSoT), makes it tunable without code (the owner can simplify any role from `/admin/role-access`), and removes six divergent gating mechanisms that already drift (see §1). It mirrors the proven feed-curation model: SuperAdmin curates per-role config in a DB table, a cached resolver serves it, components self-gate.

**Three distinct axes — keep them separate (this PRD owns only the third):**
1. **Capability / permission** — *may* a role perform an action (`rolePermissionOverrides` / `userPermissionOverrides`, [admin.ts](../../api/src/db/schema/admin.ts)). RBAC of verbs.
2. **Plan / entitlement** — is the feature in the user's paid tier (`modules.planTier`, token gates, [[project_token_pricing]]).
3. **Surface visibility & feature enablement per role** — *should* role X see this menu item / tool / feature module at all, to keep its workspace focused. **This PRD.**

These compose: a surface is shown only if visible (axis 3) **and** permitted (axis 1) **and** entitled (axis 2). This PRD does not rebuild axes 1–2; the resolver reads them where relevant (§4.4).

---

## 1. Background & problem — the six hardcoded gates

Role→surface visibility is currently spread across at least six independent, code-only sources of truth that no admin can edit and that already disagree about role taxonomy:

| # | Surface | Where | Mechanism | Problem |
|---|---------|-------|-----------|---------|
| 1 | Desktop sidebar | [Sidebar.tsx:70-106](../../frontend/components/Sidebar.tsx#L70) | `hideForRoles` deny-list + `useEffectiveRole` filter (#1995) | Only `affiliate`/`creator` trimmed; hardcoded; deny-list means every **new** role/item defaults to "see everything". |
| 2 | Mobile bottom nav | [MobileBottomNav.tsx:30-81](../../frontend/components/MobileBottomNav.tsx#L30) | `switch (role)` with a hardcoded 5-item set per role | Diverges from the sidebar; a 7th role has no case; edits need a deploy. |
| 3 | Tools catalog | [tools-catalog.ts:115](../../frontend/data/tools-catalog.ts#L115) | per-tool `audienceRoles?: UserRole[]` + entity exceptions | ~40 tools each hand-tagged; no admin control; `creator`/`affiliate`/`employee` mostly unhandled (default to "universal"). |
| 4 | Screening tools | [screening.ts:120](../../shared/screening.ts#L120) | per-tool `audienceRoles` | Same pattern, second copy. |
| 5 | Admin tabs | [admin-permissions.ts:37-72](../../frontend/lib/admin-permissions.ts#L37) | `ADMIN_CRUD` matrix (super_admin/admin only) | Static; can't grant a tab to a curated role without code. |
| 6 | Feature modules | [modules](../../api/src/db/schema/admin.ts#L67) + [moduleGate.ts](../../api/src/middleware/moduleGate.ts) + [moduleStatus.ts](../../api/src/services/auth/moduleStatus.ts) | DB `is_active` **global** on/off + `required_role` (single) | This is the *only* DB-backed, admin-toggleable gate — but it is **global**, not per-role, and admins always bypass. It is the seam to generalize. |

Consequences:
- **No non-engineer lever.** The owner cannot simplify a role's app without a PR. The explicit ask is exactly this lever.
- **Taxonomy drift.** `creator`, `affiliate`, `employee` are first-class roles ([user-roles.ts](../../shared/user-roles.ts), [[project_creator_persona_model]]) but most gates only reason about job_seeker/recruiter/employer.
- **DRY violation.** Six places encode "what does this role see," contradicting the project DRY rule (a single gate logic duplicated 6×).
- **Inconsistency across form factors.** Desktop and mobile nav can show different items to the same role.

What already exists and should be **reused, not rebuilt**:
- The **feed-curation playbook** — per-role DB config + read-through cache + per-role-tab admin UI + audit log + SuperAdmin middleware ([admin-feed-features.ts](../../api/src/routes/admin-feed-features.ts), [FeedFeatureService](../../api/src/services/feed/FeedFeatureService.ts)).
- `useEffectiveRole()` ([use-effective-role.ts](../../frontend/hooks/use-effective-role.ts)) — the impersonation/persona-preview-aware role seam; the resolver keys on it so "Preview as role" works for free.
- The **module gate** ([moduleGate.ts](../../api/src/middleware/moduleGate.ts)) — the server-side enforcement primitive; this PRD feeds it from the manifest so a "disabled feature" is enforced, not just hidden.
- `getOrSetCached` ([edge-cache.ts](../../api/src/utils/edge-cache.ts)) — the canonical read-through cache.

---

## 2. Goals & non-goals

### Goals
- **One SuperAdmin surface** (`/admin/role-access`) to set, per role, which navigation items / tools / feature modules / admin tabs are **visible** and which features are **enabled (enforced)** — editable without a deploy.
- **One shared resolver** (`resolveRoleAccess` + `useRoleAccess()`) that all six gates in §1 consume, so visibility logic lives in exactly one place and never drifts between desktop/mobile or client/server.
- **A declarative Feature Registry** (`shared/feature-registry.ts`) as the SSoT catalog of every gateable surface (its key, kind, label, group, code-defined default roles + default enabled). The DB stores only **deltas** from these defaults.
- **Zero regression by construction.** Empty override table ⇒ resolver returns exactly today's behavior (registry defaults reproduce the current `hideForRoles`/`audienceRoles`/`modules` state). Streamlining is opt-in per role.
- **Per-role navigation ordering**, not just show/hide, so a role's most-used items rise to the top of the rail.
- **Cached + invalidated** per the perf rule: `/api/role-access/me` served through `getOrSetCached` keyed by role + version, invalidated on every admin write; never N+1 over registry entries.
- **Both-sides enforcement** for true feature-disable: hiding a nav link is cosmetic; disabling a feature module also blocks its API via the existing module gate fed by the manifest. The UI clearly distinguishes "hide from menu" from "disable feature."
- **Preview as role** — SuperAdmin sees exactly what any role's app looks like, reusing the persona-preview/impersonation seam.

### Non-goals
- **Not** a per-*user* override surface. This is per-*role*. Per-user grants already exist (`userPermissionOverrides`, `userModuleAssignments`) and stay as-is; the resolver may layer them later (§9 open item) but Phase 1–4 are role-scoped only.
- **Not** a new capability/permission (RBAC verb) system. `rolePermissionOverrides` keeps owning "may role X do action Y." This PRD owns surface visibility/enablement, and *reads* the permission layer where a surface should also require a capability.
- **Not** a plan/billing gate. `modules.planTier` + token gates keep owning entitlement; the resolver respects them but does not set prices.
- **Not** a marketing-site change. The logged-out top-nav "Features" megamenu ([Navigation.tsx](../../frontend/components/Navigation.tsx)) stays unfiltered — it is a product-discovery surface by design (#1995 rationale).
- **Not** a user-defined surface runtime. The registry is code-declared (new surfaces register in `feature-registry.ts`); admins toggle existing entries, they don't invent components.
- **Not** a rewrite of every tool's relevance logic. Entity-context tool exceptions (`recruiterUseOnEntity`) stay; the resolver gates the *menu/catalog* axis, not in-context entity affordances.

---

## 3. Users & access

| Role | Can do |
|------|--------|
| **SuperAdmin** | Full CRUD on the role-access manifest for every role: toggle visibility, toggle feature-enable (enforced), reorder nav, reset a role to defaults, "Preview as role". |
| **Admin** | Read-only view of the manifest (so support can answer "why can't role X see Y") — no writes. Mirrors `admin-permissions.ts` where `roles` is read-only for `admin`. |
| **All authenticated roles** | Consume their own resolved manifest via `/api/role-access/me` (cached). They never see the raw config, only its effect. |
| **Public (no auth)** | Unaffected — marketing surfaces are not gated by this system. |

Writes are SuperAdmin-only via `superAdminMiddleware` ([admin-feed-features.ts](../../api/src/routes/admin-feed-features.ts) pattern), every mutation appended to `admin_audit_log` (`action = "role_access.*"`, `target_type = "role"`).

---

## 4. Design

### 4.1 Feature Registry — `shared/feature-registry.ts` (the catalog SSoT)

A declarative, code-owned list of every gateable surface. One entry per surface:

```ts
export type FeatureKind = "nav" | "tool" | "module" | "admin_tab";

export interface FeatureRegistryEntry {
  key: string;            // stable, namespaced: "nav:studio", "tool:resume-roast", "module:ads", "admin_tab:users"
  kind: FeatureKind;
  group: string;          // UI grouping in the admin: "Navigation" | "AI Tools" | "Feature Modules" | "Admin"
  label: string;          // i18n key for the admin list + (for nav) the rendered label
  defaultRoles: UserRole[] | "all";  // code default — who sees it today (reproduces current behavior)
  defaultEnabled: boolean;            // code default — is the underlying feature on by default
  enforce: boolean;       // true => disabling also blocks the server route via the module gate (§4.4); false => menu-only/cosmetic
  href?: string;          // for nav entries
  icon?: string;          // for nav entries (icon-name SSoT)
}
```

`defaultRoles` is **seeded from today's hardcoded values** so the registry is a faithful snapshot:
- nav entries ← inverted `hideForRoles` from [Sidebar.tsx](../../frontend/components/Sidebar.tsx) (e.g. `nav:studio` → all except `affiliate`).
- tool entries ← `audienceRoles` from [tools-catalog.ts](../../frontend/data/tools-catalog.ts) / [screening.ts](../../shared/screening.ts) (`undefined` → `"all"`).
- module entries ← `modules` rows (`required_role` → default roles; `is_active` → `defaultEnabled`).
- admin_tab entries ← `ADMIN_CRUD` read grants from [admin-permissions.ts](../../frontend/lib/admin-permissions.ts).

This registry is what `/admin/role-access` renders, and what the resolver merges DB deltas onto. Adding a future surface = one registry entry; it then appears in the admin UI automatically (no admin-side schema change).

### 4.2 Override table — `role_feature_access` (deltas only)

```sql
CREATE TABLE IF NOT EXISTS role_feature_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role        VARCHAR(50)  NOT NULL,         -- USER_ROLES value
  feature_key VARCHAR(200) NOT NULL,         -- FeatureRegistryEntry.key
  visible     BOOLEAN,                       -- NULL => inherit registry default for this role
  enabled     BOOLEAN,                       -- NULL => inherit registry default; only meaningful when entry.enforce
  rank        INTEGER,                       -- NULL => registry order; nav ordering per role
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_feature_access ON role_feature_access (role, feature_key);
CREATE INDEX IF NOT EXISTS idx_role_feature_access_role ON role_feature_access (role);
```

Only rows that **differ from the registry default** exist. "Reset role to defaults" = delete that role's rows. This keeps the table tiny (deltas, not the cross product of roles × surfaces) and makes "zero regression" structural: no row ⇒ registry default.

### 4.3 Resolver — one seam, both sides

`shared/role-access.ts` exports the pure merge so client and server stay aligned:

```ts
export interface ResolvedSurface { key: string; kind: FeatureKind; visible: boolean; enabled: boolean; rank: number; href?: string; icon?: string; label: string; }
export interface RoleAccessManifest { role: UserRole; surfaces: ResolvedSurface[]; }

// pure: registry defaults ⊕ db deltas → manifest (no I/O, unit-testable)
export function resolveRoleAccess(role: UserRole, overrides: RoleFeatureAccessRow[]): RoleAccessManifest;
```

- **Backend:** `RoleAccessService.getManifestForRole(role)` loads `role_feature_access` rows for the role via `RoleFeatureAccessRepository`, calls `resolveRoleAccess`, and serves it through `getOrSetCached({ key: 'role-access:v1:' + role, ttlSeconds: 300, loader })`. `GET /api/role-access/me` returns the caller's manifest (keyed off `effectiveRole`). Admin writes call `invalidateAll()` (loop every `USER_ROLES` value, drop each key) — the FeedFeatureService invalidation shape.
- **Frontend:** `useRoleAccess()` fetches `/api/role-access/me` once (React Query, cached), keyed by `useEffectiveRole()` so impersonation/persona-preview re-resolves automatically. Exposes:
  - `canSee(key): boolean`
  - `isEnabled(key): boolean`
  - `navItems(): ResolvedSurface[]` (visible nav surfaces, sorted by `rank`)
  - `toolKeys(): Set<string>` (visible tool surfaces)

Every gate in §1 becomes a one-liner against this hook. **The hardcoded `hideForRoles` array, the `MobileBottomNav` switch, and the catalog `audienceRoles` client-filter are deleted** (per the dead-code rule) and replaced by `useRoleAccess()` reads — so desktop + mobile + tools share one truth.

### 4.4 Enforcement: hide vs disable (both sides)

The UI exposes two distinct toggles per surface, because they mean different things:

- **Visible** (`visible`) — cosmetic. Removes the menu link / catalog card. The route still works if reached directly. Correct for "declutter this role's menu" — the common case the owner asked for. Applies to all `kind`s.
- **Enabled** (`enabled`, only when `entry.enforce === true`) — enforced. The feature's API is hard-blocked server-side. Implemented by feeding the existing module gate from the manifest: `requireModuleActive(slug)` is generalized to `requireFeatureEnabled(key)` which consults `RoleAccessService` for the **caller's** role (admins still bypass, per current convention). So disabling `module:ads` for `creator` returns `403 FEATURE_DISABLED` on `/api/ads/*` for creators, while leaving it on for employers.

This makes the difference explicit and prevents the trap of "hidden in the menu but still hittable" being mistaken for a security control. Visibility ≠ authorization; true access control remains axis 1 (`rolePermissionOverrides`) + the server gate.

### 4.5 SuperAdmin UI — `/admin/role-access`

Modeled directly on [DashboardFeedCuration.tsx](../../frontend/pages/admin/DashboardFeedCuration.tsx):
- **Per-role tabs** across the top (all eight `USER_ROLES`, with the six product personas first).
- **Grouped collapsible sections** (`group` field): Navigation · AI Tools · Feature Modules · Admin. Each row: surface label, a **Visible** switch, an **Enabled** switch (shown only when `enforce`), and a default-vs-overridden indicator.
- **Drag-to-reorder** within Navigation sets per-role `rank`.
- **Reset role to defaults** button (deletes the role's delta rows after confirm).
- **Preview as role** — sets the persona-preview for the SuperAdmin (existing seam) and opens the app so they see the exact resolved menu/tools; a banner offers "exit preview."
- New `admin_tab` registry entry `admin_tab:role_access` so the page itself shows up in the Admin tab bar, gated like the others.

Add `"roleAccess"` to `AdminResource` in [admin-permissions.ts](../../frontend/lib/admin-permissions.ts) (super_admin: CRUD; admin: read) — that file's matrix still governs *admin-panel* access (axis-1 for staff); the new system governs the *product* surfaces.

### 4.6 Validation: Preview-as-role + permission debugger (reuses existing seams)

A SuperAdmin must be able to *prove* a role's app is correct, not just toggle blindly. Two existing seams are wired in rather than rebuilt ([[project_superadmin_impersonation]]):

- **Preview as role** — the curation page calls `setPersonaPreview(role)` ([PersonaPreviewProvider](../../frontend/providers/PersonaPreviewProvider.tsx)). Because `useRoleAccess` keys on `useEffectiveRole()` (impersonation > persona-preview > own role), flipping the preview re-resolves the entire app's menu/features for that role instantly — the SA navigates the real app *as* that role, no full impersonation session required. An "Exit preview" control + an active-preview banner make the state obvious. (Full per-*user* impersonation still exists for "debug this specific account"; persona-preview is the right tool for "validate this *role*.")
- **Permission debugger** — `useRoleAccess` registers every resolved surface into the existing [PermissionDebuggerProvider](../../frontend/providers/PermissionDebuggerProvider.tsx) (`registerCheck(key, visible ? "granted" : "denied", { source: overridden ? "override" : "role" })`). With the overlay on (Ctrl+Shift+P, or the toggle on the curation page), the SA sees a live, per-surface granted/denied list for the **effective/previewed** role, distinguishing registry defaults from explicit overrides — so "why does an affiliate not see Gigs?" is answerable on the page. The debugger source taxonomy (`role | module | override`) already matches the three axes in §0.

Together: pick a role tab → toggle → **Preview as role** → read the **debugger** = a closed validation loop entirely within `/admin/role-access`.

---

## 5. Per-role target configuration (the streamlining payload)

The registry defaults reproduce today. The product win is the curated per-role manifest the owner asked for. Proposed initial streamlined defaults (seeded as `role_feature_access` rows in the Phase-1 migration so the app ships simpler, not just toggle-able):

- **job_seeker** — Dashboard, Studio, Tools (job-seeker catalog), Resumes, Jobs, People, Tasks, Marketplace, My Services. (Hide: Companies-as-employer surfaces, recruiter pipeline tools.)
- **recruiter** — Dashboard, Tools (recruiter/hire-side catalog), Jobs, Companies, People, Tasks, Outreach, Marketplace, Gigs. (Hide: Resumes-as-owner authoring, job-seeker self-promo tools.)
- **employer** — Dashboard, Jobs, Companies, People (People Ops), Tasks, Outreach, Marketplace, Gigs. (Hide: job-seeker resume tools.)
- **employee** — Dashboard, People (own card), Tasks, Tools (limited), My Services. Invite-only back-office focus ([[project_employee_role]]).
- **affiliate** — Dashboard, Tools (referral), Jobs, People, Tasks, Marketplace, My Services. (Hide: Studio, Resumes, Companies, Outreach, Gigs — matches the #1995 deny-list, now data-driven.)
- **creator (gig)** — Dashboard, Studio, Tools (creator), Jobs, People, Tasks, Marketplace, **Gigs**, My Services. (Hide: Outreach.)

These are first-cut and are exactly what `/admin/role-access` lets the owner tune live thereafter — the PRD ships the lever **and** a sensible default, not a blank slate.

---

## 6. Data ownership, caching & compliance

- **SSoT:** the registry (code) for the catalog + defaults; `role_feature_access` (DB) for deltas. No third copy.
- **Caching:** `/api/role-access/me` and `getManifestForRole` via `getOrSetCached` keyed `role-access:v1:<role>` (300s), invalidated on every write. The manifest is small + slow-changing — never recompute per request, never poll. Client caches via React Query keyed on effective role.
- **No PII** — the manifest is role-level config only.
- **Audit:** every write to `admin_audit_log` (actor, action `role_access.upsert|reset`, target role, before/after delta in metadata) — supports "who hid X from recruiters."
- **i18n:** registry `label` keys flow through the existing `t()` catalog ([[project_tools_localization]]); the admin UI and rendered nav both localize.

---

## 7. Phasing (maps to Consolidated Gap Register #2036–#2042)

- **Phase 1 — Registry + resolver + table + admin + rewire Sidebar (Now) — #2037. ✅ Shipped 2026-06-13.** Delivered: [feature-registry.ts](../../shared/feature-registry.ts) (nav surfaces, defaults = a verbatim snapshot of the old `hideForRoles`) + [role-access.ts](../../shared/role-access.ts) pure resolver + [migration 0214](../../api/drizzle/0214_role_feature_access.sql) + [RoleFeatureAccessRepository](../../api/src/repositories/roleFeatureAccessRepository.ts) + cached [RoleAccessService](../../api/src/services/admin/RoleAccessService.ts) + [`/api/admin/role-access`](../../api/src/routes/admin-role-access.ts) + [`/api/role-access/me`](../../api/src/routes/role-access.ts) + [`/admin/role-access`](../../frontend/pages/admin/RoleAccessManager.tsx) UI + [`useRoleAccess()`](../../frontend/hooks/use-role-access.ts). [Sidebar.tsx](../../frontend/components/Sidebar.tsx) now renders from `navItems()`; `hideForRoles` **deleted**. Includes §4.6 Preview-as-role + permission-debugger validation. Seeded only the net-new `employee` deltas (affiliate/creator trimmed via registry defaults). Resolver zero-regression snapshot test green ([role-access-resolver.test.ts](../../api/src/services/admin/__tests__/role-access-resolver.test.ts), 14 cases).
- **Phase 2 — Converge mobile nav + tools catalog (Soon) — #2038.** Rewire [MobileBottomNav.tsx](../../frontend/components/MobileBottomNav.tsx) (delete the `switch`) and the tools-catalog/screening client filter to `useRoleAccess()`. Desktop, mobile, and Tools now share one truth; per-role tool curation becomes admin-editable.
- **Phase 3 — Feature-disable enforcement, absorb `modules` (Soon) — #2039.** Generalize `requireModuleActive` → `requireFeatureEnabled(key)` reading the manifest per caller role; migrate `modules.is_active` semantics into `role_feature_access` (per-role) with a back-compat shim; the global kill-switch becomes "disable for all roles." Wire the **Enabled** toggle end-to-end (403 `FEATURE_DISABLED`).
- **Phase 4 — Admin tabs + per-role nav ordering + Preview-as-role (Mid) — #2040.** Drive admin-tab visibility from the manifest for curated roles; ship drag-to-rank nav ordering; finish "Preview as role" via the persona-preview seam.
- **Phase 5 — Tests (Mid) — #2041.** Resolver merge (default / override / reset), cache invalidation, `requireFeatureEnabled` (allowed / disabled / admin-bypass), and the manifest endpoint — with real-shape fixtures (seed-derived role rows, all eight roles) per the schema-test convention ([[feedback_tests_with_real_fixtures]]).
- **Open / later — #2042.** Layer per-*user* overrides (`userModuleAssignments` / `userPermissionOverrides`) onto the resolver as a final precedence tier; reconcile `rolePermissionOverrides` (axis 1) so a surface can require both visibility and a capability from one declarative registry field.

---

## 8. Risks & open questions

- **Hide-vs-disable confusion (highest).** Mitigated by two explicit toggles + the §4.4 server gate; the UI must label "Visible" as cosmetic and "Enabled" as enforced, and visibility must never be treated as authorization.
- **Default drift during seeding.** If the registry defaults don't faithfully mirror today's `hideForRoles`/`audienceRoles`/`modules`, Phase 1 regresses live menus. Mitigation: a snapshot test asserting `resolveRoleAccess(role, [])` equals the current hardcoded result for every role before deleting any hardcoded gate.
- **`modules` absorption back-compat (#2039).** Existing `requireModuleActive` call sites + the `modules` admin must keep working through the shim until fully migrated; do the migration + dead-code drop in one pass per [[feedback_full_fix_scope_no_partial]].
- **Two enforcement layers for the same surface** (this PRD's gate vs `rolePermissionOverrides`). Resolve via §0 axis separation and the #2042 reconciliation; document precedence so they never silently disagree.
- **Open:** should `admin_tab` visibility for curated (non-staff) roles ever be allowed, or stay staff-only? Default: staff-only until a concrete need (Phase 4 gates it conservatively).

## 9. Tracking

Phases + residuals tracked in the [Consolidated Gap Register](../../README.md#consolidated-gap-register) as #2036 (umbrella) → #2037–#2042 (this feature), plus #2043–#2046 (the §10 usage/engagement extension). Supersedes the menu-only scope of #1995.

---

## 10. Extension — usage tracking, sessions & live engagement

This system is the natural substrate for *measuring* how each role uses the app and turning that into engagement. The same Feature Registry keys that gate a surface are the dimensions we count usage along, so "what does role X actually use" can later inform "what should role X see" — closing the loop on the streamlining goal with data instead of guesses. Specced here as the next workstream (gaps #2043–#2046); **not built in the #2037 pass**.

### 10.1 Goal
Track every page visit (marketing **and** authenticated) and key intent events; treat an anonymous visitor who starts a search as a **session**; surface "who is active right now" to staff; and let staff start a conversation with an active/identified user (or capture an anonymous visitor as a lead). Goal: see who is engaged and reach them while intent is hot.

### 10.2 Model (reuses existing seams)
- **`usage_sessions`** — `visitor_id` (first-party cookie), `user_id` (nullable; linked on auth), `is_authenticated`, `role`, `entry_path`, `referrer`, UTM, `country` (reuse the geo/region resolver from [[project_content_locations]] / [[project_international_expansion]]), `first_seen`, `last_seen`. A visitor exists before login; on auth the session links `visitor_id → user_id`, so the pre-signup search journey is retained.
- **`usage_events`** — `session_id`, `type` (`page_view | search | tool_run | feature_open | cta_click | …`), `path`, `feature_key` (the **Feature Registry key** where applicable — same SSoT), `payload` jsonb, `occurred_at`. Write-heavy: batch client-side and flush via a beacon; never one round-trip per event.
- **Client**: a single `useUsageTracker()` mounted in `AppShell` beacons page views on route change (marketing + app); the search box calls `trackEvent("search", { query })`. One seam, self-gating on consent (DRY) — no per-page wiring.
- **Ingestion**: `POST /api/usage/track` (batched array). A new read endpoint (presence/analytics) MUST be cached per the perf rule; ingestion is fire-and-forget + queued.

### 10.3 Presence & engagement
- **Active now** = sessions with `last_seen` within N minutes. Staff view at `/admin/active-users` (gate on the existing `accountAnalytics` admin resource; reconcile with the existing `accountAnalytics` + `extensionTelemetry` surfaces rather than adding a parallel one). Read served through the read-through cache with a short TTL (presence is allowed to be a few seconds stale).
- **Engage**: for an identified user, a "Start conversation" action opens the existing conversations/outreach flow; for an anonymous visitor, capture via the existing marketing-leads pipeline (`/api/marketing/contact`). No new messaging stack.
- **Usage → access feedback loop** (the tie-in): per-role, per-`feature_key` usage rollups surface inside `/admin/role-access` as a "this role rarely uses X" hint next to the visibility toggle, so streamlining decisions are evidence-based.

### 10.4 Privacy (gating constraint — must precede launch)
Marketing-visitor tracking is PII/consent-bearing: requires a cookie-consent gate (region-aware, per [[project_international_expansion]]) and must plug into the existing DSR/erasure machinery (a `visitor_id`/`user_id` must be erasable). Anonymous→identified linking only after consent. This is the main reason it's a separate, deliberate workstream rather than folded into #2037.

### 10.5 Open decisions (why not built now)
- **Realtime transport for presence** — short-poll a cached endpoint (cheapest, fits Workers) vs Durable-Object/WebSocket presence. Default proposal: cached short-poll first; DO presence only if sub-second is needed.
- **Reconcile with existing telemetry** — `accountAnalytics` + `extensionTelemetry` already exist; confirm whether `usage_events` extends or replaces them before building (avoid a third analytics store, mirroring the §0 "two data stores = liability" rule).

## 11. Tracking (extension)

The §10 extension is tracked as #2043 (umbrella: usage/session tracking + presence + engagement), #2044 (ingestion + `usage_sessions`/`usage_events` + `useUsageTracker`), #2045 (presence "active now" + staff engage action), #2046 (consent + DSR gate; usage→access feedback hints). Each carries the open decisions in §10.5.

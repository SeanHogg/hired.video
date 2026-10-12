# PRD — Loxo → hired.video Parity (Recruiter & Employer)

**Owner:** hired.video Platform
**Status:** Spec — gap analysis only. Authoritative status of each existing entry lives in the [Consolidated Gap Register](../../README.md) (#1–#205, last updated 2026-04-26).
**Date:** 2026-04-27
**Companion PRD:** [Contacts & Sourcing](integrations-and-sourcing.md) — hired.video's native contact graph, enrichment providers, suppression, DSR.

---

## 1. Strategic framing

Loxo overlaps hired.video on the **recruiter operating system** axis (talent pool, outreach, submissions, placements, hiring-manager portal) and the **employer ATS lite** axis (careers pages, ATS connectors, compliance). Three axes are handled outside this gap list:

- **Sourcing data layer (contact graph, enrichment, suppression, DSR)** is specified in its own PRD, [Contacts & Sourcing](integrations-and-sourcing.md). hired.video builds it natively: `contacts` + `contact_job_links` (`api/drizzle/0493_contacts_graph.sql`), `/api/contacts`, enrichment through the `EnrichmentProvider` seam, duplicates into `person_merge_queue`.
- **AI Notetaker / meeting recorder** (Zoom/Meet/Teams capture) is a native hired.video workstream tracked as gap #266, built on the interview-intelligence transcript pipeline.
- **Loxo's per-action credit ledger** (25 credits/user/month, 1c per personal email, 0.2c per work email, etc.) is rejected. Hired.video's billing axis is **token-bucket pricing — Pro $9.95/mo + 1M tokens, packs $3.99–$199.99** (see project memory `project_token_pricing.md`). Per-action SKUs would re-introduce two parallel meters and contradict the published pricing page.

**Moat vs Loxo.** Loxo is recruiter-only and built around a closed contact graph. Hired.video pairs the recruiter pipeline with (a) a candidate-owned video resume + creator monetisation flywheel, (b) a public marketplace surface that doubles as SEO acquisition, and (c) AI primitives metered uniformly via tokens, not pay-per-action.

---

## 2. Persona scope

Two personas. Most surfaces serve both; the table flags the dominant buyer.

- **Recruiter / agency** — Loxo's primary buyer. Pipeline workflow, outreach, scorecards, candidate packets, BD/sales CRM, placements & splits, hiring-manager portal, resume forwarding.
- **Employer / in-house company** — Careers pages, granular job-share permissions, EEOC/GDPR compliance, branding, ATS connectors, SSO/SAML, job-share approvals.

---

## 3. Feature mapping table

Status legend: ✅ Done · ⚠️ Partial · 🔲 Open · 🆕 Net-new (no existing entry) · ❌ Out of scope.

### 3.1 Settings — calendar, email, phone, profile

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| AI Notetaker (Zoom/Meet/Teams join-by-default) | Both | 🔲 | #266 | — | Native hired.video build (meeting bot + transcript + summary onto the candidate timeline). |
| Loxo Credits ledger (per-action billing) | Recruiter | ❌ | — | — | Rejected. Token model (#94) is the billing axis. |
| Custom email sending domain (SPF/DKIM provisioning) | Both | ⚠️ | #95 | — | Already noted as remaining work on #95. No new entry. |
| Calendar OAuth (Google/Outlook) | Both | ✅ | #11 | — | Two-way sync done. |
| Calendar Link Templates (Intro / Interview / Follow-up presets) | Recruiter | 🆕 | — | #206 | Distinct from raw OAuth — booking-page presets. |
| Synced email + signature + read receipts + auto-unsubscribe | Recruiter | ⚠️ | #95, #146 | — | #95 covers send; #146 covers Gmail/Outlook inbound parsing. Signature/read-receipts not yet flagged but fall under the same OAuth integration. |
| Voicemail + receive incoming calls + DND/SMS auto-reply | Recruiter | ✅ | #97 | — | Phase-2 phone dashboard covers this. |
| Profile / org / workspace tabs scaffolding | Both | ✅ | many | — | Standard settings surface — no gap. |

### 3.2 Loxo Agents (background workers)

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| Contact Information Finding Agent | Recruiter | ⚠️ | #96 | — | Native: `/api/contacts/:id/enrich` spends enrichment credits through the `EnrichmentProvider` seam; resolver/cache per [Contacts & Sourcing](integrations-and-sourcing.md). |
| Candidate Submittal Agent (auto-generated submittal + share link) | Recruiter | 🆕 | — | #207 | New: AI-generated executive submittal doc keyed off `candidateSubmissions` + `studioAtsPackages` (#118). |
| Notetaking Agent | Both | 🔲 | #266 | — | Native hired.video build, consolidated with the AI Notetaker. |
| Self-updating CRM Agent (auto-refresh person records) | Recruiter | 🆕 | — | #208 | Background re-enrichment job — re-runs native enrichment on stale `contacts` on a cadence and writes deltas. |

### 3.3 Workflow engine (the core Loxo primitive)

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| Configurable workflow stages (kanban columns) | Recruiter | 🆕 | — | #209 | THE big one. Stages are tenant-configurable, ordered, color-coded. |
| Progression-activity engine (logging an activity moves stage) | Recruiter | 🆕 | — | #210 | Activity-type → stage transition map; activity-only events that don't move stage. |
| "Customise Activities" global-to-team semantics | Recruiter | 🆕 | — | #211 | Workspace-scoped, not per-user. Includes "cannot be undone" guard rail. |
| Per-stage candidate movement | Recruiter | ⚠️ | #1002 (route) | — | `candidateSubmissions.status` exists but no stage taxonomy. Closed by #209/#210. |

### 3.4 Outreach

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| Outreach sequences (email/SMS/call/task) | Recruiter | ✅ | #15, #29, #95 | — | `followUpSequences` engine + cron processor done. |
| Smart-trigger campaigns | Recruiter | ✅ | #29 | — | Done. |
| Campaign Templates library (4 starter templates) | Recruiter | 🆕 | — | #212 | Seed the library; `outreach_campaign_templates` table. |
| Per-stage email variants (A/B with personalisation-token disable warning) | Recruiter | 🆕 | — | #213 | Multi-variant per step; tracks open/click/reply per variant. |
| Campaign on/off toggle + settings gear | Recruiter | ⚠️ | #15 | — | Cron-driven enrolment exists; explicit toggle UI not flagged. Roll into #212. |
| Workspace-level Outreach Hours of Operation | Recruiter | 🆕 | — | #214 | Distinct from per-user `users.workingHours`; gates send-times across the tenant. |

### 3.5 Sourcing UI (Loxo Source)

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| Boolean / saved-search / faceted recruiter search | Recruiter | ✅ | #70 | — | Done. |
| Source UI shell (filter rail + result grid + session) | Recruiter | 🆕 | — | #215 | New `/recruiter/source` page over the native `contacts` graph (`/api/contacts`). |
| Tri-state per-card triage (Yes / Maybe / Hide + Undo) | Recruiter | 🆕 | — | #216 | `talentPoolCandidates.triageDecision` enum. Drives session metrics + auto-add to longlist. |
| Natural Language Search input | Recruiter | 🆕 | — | #217 | LLM-to-Boolean query translator on top of #70's parser. |
| Talent Insights aggregate panel (top industries / countries / states) | Recruiter | 🆕 | — | #218 | Charts + Charts↔Tables toggle + Share button on filtered result set. |
| "Done Sourcing" session-close + run history | Recruiter | 🆕 | — | #219 | `sourcingSessions` log; feeds Talent Insights & per-recruiter activity. |
| Diversity / Security Clearance / Tenure / Company Ranking filters | Recruiter | 🆕 | — | #220 | Schema additions on the native `contacts` table (indexed filter columns). |
| Filter: Timezone (Beta) | Recruiter | 🆕 | — | #221 | Derived from the native `contacts` location field at write time. |

### 3.6 Sales / BD CRM

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| BD pipeline (employer relationship stages) | Recruiter | 🔲 | #99 | — | Already open. |
| Configurable Default Pipeline (stages, $value, win-prob %) | Recruiter | 🆕 | — | #222 | Extends #99 with per-stage config + ARR rollup. |
| Deals object (separate from candidate submissions) | Recruiter | 🆕 | — | #223 | `recruiterDeals` schema in #99 needs the per-deal pipeline + owner switcher + per-stage probability. |
| Pitches object (pre-deal opportunity record) | Recruiter | 🆕 | — | #224 | New polymorphic `recruiterPitches` keyed off company / job / role. |

### 3.7 Placements (closing the deal)

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| `placements` table + summary endpoint | Recruiter | ✅ | (route line 1365) | — | Basic placement schema exists. |
| Multiple placements per job | Recruiter | 🆕 | — | #225 | Enforce 1:N from `jobItems` to `placements`; bulk "Save N placements" action. |
| Placement Type (FT / Contract / C2H, taxonomy-driven) | Recruiter | 🆕 | — | #226 | Fed by Job Type taxonomy (#231). |
| Fee — Flat | Percent toggle | Recruiter | 🆕 | — | #227 | Schema columns + UI toggle on placement form. |
| Splits (Owner × Type × % across recruiters) | Recruiter | 🆕 | — | #228 | `placementSplits` table; sums-to-100 validation; commission engine reads splits. |
| Back-office (invoice/payable/payroll fields) | Recruiter | 🆕 | — | #229 | Collapsible section; fields stubbed for AR/AP integrations (Xero #245). |
| Per-placement email-notification subscriptions | Recruiter | 🆕 | — | #230 | Rows on `placementNotificationSubscriptions`; fires on stage events. |

### 3.8 Taxonomies — Tags & Types (workspace-level)

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| Tags as colored, ordered, three-axis (Company / Job / Person) taxonomy | Both | 🆕 | — | #231 | `workspaceTags` table; axis enum; orderIndex; color hex; 25 default industry seeds on Job axis. |
| Job Type taxonomy (FT / Contract / C2H + bill/pay/overtime/fee) | Recruiter | 🆕 | — | #232 | Bounded enum + per-row financial fields. Feeds #226 + invoice schedules. |
| Company Type taxonomy | Recruiter | 🆕 | — | #233 | Client / Other / + custom. |
| Rejection Reason taxonomy | Recruiter | 🆕 | — | #234 | 12-row built-in seed + custom; feeds rejection modal + analytics. |
| Email / Phone / Address Type taxonomies | Both | 🆕 | — | #235 | Three small bounded enums on `personEmails` / `personPhones` / `personAddresses`. |
| Diversity taxonomy (self-ID values) | Both | 🆕 | — | #236 | Schema-isolated from EEOC reporting; consent-gated. Feeds #220 sourcing filter. |
| "BUILT-IN entries cannot be deleted" semantics | Both | 🆕 | — | #237 | Cross-cutting `isBuiltIn BOOLEAN` on every taxonomy row + delete-guard middleware. |
| Sources taxonomy (origin attribution on people / jobs) | Both | 🆕 | — | #238 | New `workspaceSources` table; replaces ad-hoc string fields. |
| Statuses taxonomy (workspace-level beyond stages) | Both | 🆕 | — | #239 | Generic status taxonomy (e.g. "Do not contact", "Out of country"); orthogonal to workflow stage. |

### 3.9 Hiring-manager portal & job sharing

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| Granular Job Share Permissions matrix (16+ field-level toggles) | Employer | 🆕 | — | #240 | `jobSharePermissions` JSONB on `jobItems`; each candidate-field render gates against it. |
| Scorecard visibility tri-state (HM hide-until-submit / always-hide / always-show) | Employer | 🆕 | — | #241 | Per-tenant default + per-job override. |
| Hiring-manager scorecards (HM-authored, structured) | Both | 🆕 | — | #242 | Distinct from candidate self-assessment; feeds #241 visibility rules. |
| Candidate Packet generator with Anonymize toggle | Recruiter | 🆕 | — | #243 | Multi-candidate PDF/HTML export; Anonymize replaces name+email+photo with initials. Extends #118 ATS package + pitch-deck flow (#184). |

### 3.10 Compliance — unified workspace surface

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| GDPR settings UI (who-applies / lawful-basis / expiration / privacy link) | Employer | ⚠️ | #186 | #244 | #186 covers candidate-share consent only. New: tenant-level GDPR config page. |
| EEOC/OFCCP compliance settings | Employer | 🆕 | — | #244 | Shared with GDPR config page; one Compliance workspace tab. |
| Outreach unsubscribe link auto-injection on bulk ≥10 | Recruiter | ⚠️ | #95 | — | Covered under #95 "Remaining: bounce webhooks + unsub" — fold in here, no new entry. |
| SMS consent (opt-in tracking) | Recruiter | 🆕 | — | (rolls into #244) | Tenant-level toggle; per-recipient `smsConsentGrantedAt` ledger. |
| Compliance Export tab | Employer | 🔲 | (line 1449) | — | `/api/settings/export` already returns JSON bundle; just needs the UI surface. |

### 3.11 Email deliverability

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| Email safety tolerance slider (Safe/Moderate/High/Risky → daily limit + interval) | Recruiter | 🆕 | — | #245 | Tenant-level send-rate config; auto-throttle on bounce-rate / complaint-rate spike. |
| Email tracking toggles per type (Opens / Clicks / Downloads) | Recruiter | 🆕 | — | #246 | Workspace defaults + per-message override; campaigns track regardless. |
| Email default style preset (font/size/line-height/colour) | Recruiter | 🆕 | — | #247 | Saved on `accountPreferences`; injected into composer + outreach send pipeline. |

### 3.12 Forms, Validations, Roles

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| Forms (custom application / intake forms) | Both | 🆕 | — | #248 | Distinct from in-video lead-capture (#140). Tenant form-builder + URL-shareable application forms; submissions land on the candidate record. |
| Custom Validations (per-tenant required-field rules) | Both | 🆕 | — | #249 | Engine that gates record save (e.g. "must have phone before Submitted stage"). |
| Roles (custom RBAC beyond superadmin/owner) | Both | 🆕 | — | #250 | `workspaceRoles` + `workspaceRolePermissions` matrix. Extends existing `users.role` + `userRoles` with per-tenant custom roles. |

### 3.13 Resume-forwarding & inbound capture

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| Resume Forwarding Address per recruiter (`{slug}.resume-forward.hired.video`) | Recruiter | 🆕 | — | #251 | MX + Mailgun-style inbound webhook; auto-creates person record + parses attached resume into `candidateResumes`. |
| Loxo Boost approvals queue (job-amplification governance) | Employer | 🆕 | — | #252 | Approval queue gating sponsored-job purchases (#106) for owner-required-approval workspaces. |
| "Show Rejected By Types on Rejection Modal" toggle | Recruiter | 🆕 | — | #253 | Tenant pref; reuses Rejection Reason taxonomy (#234). |

### 3.14 Notifications

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| Email on Person Ownership change | Recruiter | 🆕 | — | #254 | Bundled tenant-notification preferences row. |
| Email on Placement update | Recruiter | 🆕 | — | (rolls into #230) | Per-placement subscription model. |
| SMS Response Notifications → Notify Person Owner | Recruiter | 🆕 | — | #255 | Inbound SMS routing rule. |

### 3.15 Integrations (B2B sales surfaces)

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| Greenhouse / Lever / Workday ATS | Employer | ✅ | #64 | — | Done. |
| merge.dev unified ATS | Employer | 🔲 | #189 | — | Already open. |
| Workday integration (Web Services URL + OAuth2) | Employer | 🆕 | — | #256 | Beyond #64 surface — full WS URL + OAuth2 flow for in-house Workday tenants. |
| Okta SSO (client ID/secret + Okta domain) | Employer | 🆕 | — | #257 | Per-tenant Okta config row; OIDC. |
| SAML SSO (metadata XML upload) | Employer | 🆕 | — | #258 | Pure SAML 2.0 IdP-init + SP-init. Required for any enterprise deal. |
| Xero (client ID/secret + redirect URI) | Recruiter | 🆕 | — | #259 | Invoice + payable sync — feeds #229 placement back-office. |
| RingCentral (telephony) | Recruiter | 🆕 | — | #260 | Click-to-call + call-log sync; complements existing SignalWire (#97). |
| Generic API-key vendor integrations (long tail) | Both | 🆕 | — | #261 | Self-serve `tenantIntegrations` table — credentials registry; lets workspace admins paste keys for any vendor without a custom connector. |
| Loxo Email Domains (custom sending domain provisioning) | Both | ⚠️ | #95 | — | Already flagged as remaining on #95. No new entry. |
| Invoice schedules (recurring invoice config) | Recruiter | 🆕 | — | #262 | Tenant-level cadence + counters; pairs with Xero (#259). |
| Default currency / country / timezone | Both | 🆕 | — | #263 | `accountPreferences` extension; threads into formatting helpers. |

### 3.16 Data enrichment policy (consumer-side)

| Loxo feature | Persona | Status | Existing # | New # | Notes |
|---|---|---|---|---|---|
| Enrich catch-all emails toggle | Recruiter | 🆕 | — | #264 | Policy flag evaluated by native enrichment; default off. |
| Enrich unknown emails toggle | Recruiter | 🆕 | — | (rolls into #264) | Same policy row. |
| Auto-merge duplicate people vs review queue | Recruiter | 🆕 | — | #265 | Tenant policy + `personMergeQueue` table when manual-review is selected. |

---

## 4. Net-new gap-register entries (paste-ready)

These rows are formatted to drop straight into the [Consolidated Gap Register](../../README.md) table (`| # | Status | Phase | Priority | Type | Gap | Notes |`). All Open. Numbering picks up at #206 (existing max #205).

| 206 | 🔲 Open | Mid | P2 | `feature` | **Calendar Link Templates (Intro / Interview / Follow-up)** | Booking-page presets layered on top of #11 OAuth. New `calendarLinkTemplates` table + public booking URLs per template. |
| 207 | 🔲 Open | Mid | P1 | `feature` | **Candidate Submittal Agent (auto-generated executive submittal)** | Background job consumes `candidateSubmissions` row + résumé + scorecards, emits a branded submittal doc via the existing storyboard generator (`purpose: "submittal"`) and returns a tokenized share link. Reuses ATS package pattern (#118). |
| 208 | 🔲 Open | Mid | P2 | `feature` | **Self-updating CRM Agent (background person re-enrichment)** | Scheduled worker walks native `contacts` (and `talentPoolCandidates`) whose `enriched_at` is older than N days, re-enriches through the `EnrichmentProvider` seam (credit-metered), writes deltas onto the `contacts` row, re-scores duplicates into `person_merge_queue`, logs change-set on the person timeline. |
| 209 | 🔲 Open | Now | P1 | `feature` | **Configurable workflow stages (per-tenant kanban columns)** | New `workflowStages` table (id, tenantId, name, color, orderIndex, isBuiltIn). Replaces hard-coded `candidateSubmissions.status` enum with FK. Default seed: Applied / Longlist / Shortlist / Outbound / Screening / Submitted / Interviewing / Rejected / Hired. |
| 210 | 🔲 Open | Now | P1 | `feature` | **Progression-activity engine (activity → stage transition map)** | `activityStageTransitions` table maps activity types (Note / Phone Call / Sent Email / Interview Scheduled / etc.) to target `workflowStages`. Logging an activity advances stage via the engine; "activity-only" rows do not. Auditable via `candidateInteractions` log. |
| 211 | 🔲 Open | Now | P2 | `feature` | **"Customise Activities" workspace-global semantics** | Activity registry is tenant-scoped, not per-user. Edits guarded by an irreversible-action confirm (mirror Loxo's "cannot be undone" copy). Audit trail + admin-only edit gate. |
| 212 | 🔲 Open | Soon | P2 | `feature` | **Outreach Campaign Templates library** | Seed 4 starter sequences (Candidate Outreach for Job, Email-only Outreach, Biz Dev Outreach, Biz Dev: New HM at Company). New `outreachCampaignTemplates` table; clone-into-sequence on selection. |
| 213 | 🔲 Open | Soon | P2 | `feature` | **Per-stage email variants in outreach sequences** | Multi-variant per step on `followUpSequenceSteps`; per-variant open/click/reply counters; UI warning that personalisation tokens are disabled when variants are on (mirror Loxo wording). |
| 214 | 🔲 Open | Soon | P2 | `feature` | **Workspace-level Outreach Hours of Operation** | Tenant-scoped send-window config distinct from per-user `users.workingHours`. Cron honours both before dispatching outreach. |
| 215 | 🔲 Open | Soon | P1 | `feature` | **Source UI (`/recruiter/source` shell)** | Filter rail + result grid + per-card actions over the native `contacts` graph (`/api/contacts`, enrich, "Add to pipeline" → `contact_job_links`). Replaces Loxo Source. |
| 216 | 🔲 Open | Soon | P1 | `feature` | **Tri-state sourcing triage (Yes / Maybe / Hide + Undo)** | `talentPoolCandidates.triageDecision` enum. Yes → auto-add to longlist (stage transition). Maybe → keep in session pool. Hide → suppress for this recruiter for N days. Undo restores prior state. |
| 217 | 🔲 Open | Soon | P2 | `feature` | **Natural Language Search on Source** | LLM front-end translates free-text ("senior react engineers in Berlin who speak German") to the existing #70 Boolean parser AST. Reuses `callLLMJson` + Zod schema; metered against the user's token budget. |
| 218 | 🔲 Open | Mid | P2 | `feature` | **Talent Insights aggregate panel** | Top-10 industries / countries / states bar charts of the current result set, with Charts↔Tables toggle and Share button (tokenized read-only link). Backed by pre-aggregated facets returned alongside `/api/search/recruiter` results. |
| 219 | 🔲 Open | Mid | P3 | `feature` | **"Done Sourcing" session log + history** | New `sourcingSessions` table (recruiterId, startedAt, endedAt, queryAst, candidatesReviewed, yes/maybe/hide counts). Powers per-recruiter activity reports + Talent Insights time-series. |
| 220 | 🔲 Open | Mid | P2 | `feature` | **Sourcing filters: Diversity / Security Clearance / Tenure / Company Ranking / Company Size** | Schema additions to the native `contacts` table (indexed fields; see ROADMAP #2143). Diversity filter consent-gated and fed by Diversity taxonomy (#236). |
| 221 | 🔲 Open | Mid | P3 | `feature` | **Sourcing filter: Timezone (Beta)** | Derived at write time from the native `contacts` location field via tz lookup table; UI filter on the Source rail. |
| 222 | 🔲 Open | Mid | P2 | `feature` | **Configurable sales-pipeline stages with $-value + win-prob %** | Extends #99 BD pipeline with per-stage config: dollar value, win-probability %, ARR rollup. New `pipelineStages` table; replaces hard-coded `recruiterDeals.stage`. |
| 223 | 🔲 Open | Mid | P2 | `feature` | **Deals object with owner switcher + custom pipeline assignment** | Builds on #99 `recruiterDeals` — add `pipelineId`, `ownerId`, `ownerType` columns; multi-pipeline support per tenant. |
| 224 | 🔲 Open | Mid | P3 | `feature` | **Pitches object (pre-deal opportunity record)** | Polymorphic `recruiterPitches` keyed off company / job / role triplet. Distinct from Deal — no committed fee yet. Feeds Deal creation when accepted. |
| 225 | 🔲 Open | Soon | P1 | `feature` | **Multiple placements per job + bulk save** | Schema already 1:N capable. Add UI: "Save N placements" bulk action on the job detail; each row gets independent splits/fees. |
| 226 | 🔲 Open | Soon | P1 | `feature` | **Placement Type field driven by Job Type taxonomy** | `placements.placementTypeId` FK → `workspaceJobTypes` (#232). Enables FT / Contract / C2H differentiation in commission engine + back-office fields. |
| 227 | 🔲 Open | Soon | P1 | `feature` | **Placement fee — Flat | Percent toggle** | Add `feeMode` enum + `feeFlatCents` / `feePercentBps` columns on `placements`. Commission engine reads either branch. |
| 228 | 🔲 Open | Soon | P1 | `feature` | **Placement splits across recruiters** | New `placementSplits` (placementId, ownerUserId, ownerType, percentBps). Sums-to-10000-bps validation. Commission engine fans out per-row. |
| 229 | 🔲 Open | Mid | P2 | `feature` | **Placement back-office fields (invoice / payable / payroll)** | Collapsible section on placement editor; columns added to `placements` (PO number, invoice schedule FK, payroll vendor, billing contact, etc.). Pairs with #259 Xero + #262 invoice schedules. |
| 230 | 🔲 Open | Mid | P3 | `feature` | **Per-placement email-notification subscriptions** | `placementNotificationSubscriptions` row per (placementId × event × userId). Fires on stage events (signed / started / first-day / guarantee-expires). |
| 231 | 🔲 Open | Soon | P1 | `feature` | **Three-axis Tags taxonomy (Company / Job / Person)** | `workspaceTags` (id, axis enum, name, colorHex, orderIndex, isBuiltIn). Polymorphic `tagAssignments` (axis, entityId, tagId). Seed 25 default industry tags on the Job axis. Drag-handle ordering UI. |
| 232 | 🔲 Open | Soon | P1 | `feature` | **Job Type taxonomy with bill / pay / overtime / fee defaults** | `workspaceJobTypes` (FT-Yearly / Contract-Hourly / C2H-Hourly + custom). Per-row financial defaults (billRate, payRate, overtimeMultiplier, defaultFeeBps). Feeds #226 + #262 invoice templates. |
| 233 | 🔲 Open | Soon | P3 | `feature` | **Company Type taxonomy (Client / Other / + custom)** | `workspaceCompanyTypes`; FK on `companyProfiles.companyTypeId`. Drives BD-pipeline filtering. |
| 234 | 🔲 Open | Soon | P2 | `feature` | **Rejection Reason taxonomy** | `workspaceRejectionReasons` with 12-row built-in seed (Underqualified / Overqualified / Skills / Personality Match / Not interested / Comp / Remote / Commute / Accepted other / etc.). Feeds rejection modal + funnel-loss analytics. |
| 235 | 🔲 Open | Mid | P3 | `feature` | **Email / Phone / Address Type taxonomies (Personal / Work / Main / Alternate / Billing)** | Three small bounded enums on `personEmails` / `personPhones` / `personAddresses`. Replaces ad-hoc strings. |
| 236 | 🔲 Open | Mid | P2 | `feature` | **Diversity self-ID taxonomy (consent-gated)** | `workspaceDiversityValues` + `personDiversitySelfId` (with `consentedAt`, `consentedIp`). Schema-isolated from EEOC reporting. Feeds #220 Diversity filter (which only reads consented rows). |
| 237 | 🔲 Open | Soon | P3 | `arch` | **`isBuiltIn` semantics + delete-guard middleware across taxonomies** | Cross-cutting: every taxonomy table has `isBuiltIn BOOLEAN`. Delete handler 409s on built-in rows. Hides Delete button in UI. Applies to #231–#236, #238, #239. |
| 238 | 🔲 Open | Mid | P3 | `feature` | **Sources taxonomy (origin attribution on people / jobs)** | `workspaceSources` (Inbound / Referral / Sourced / Job Board / Event / Other + custom). FK on `talentPoolCandidates.sourceId` + `jobItems.sourceId`. Replaces ad-hoc string fields. |
| 239 | 🔲 Open | Mid | P3 | `feature` | **Statuses taxonomy (workspace-level)** | Generic person/company status (e.g. "Do not contact", "Out of country", "Placed elsewhere"). Orthogonal to workflow stage. `workspaceStatuses` + polymorphic assignment. |
| 240 | 🔲 Open | Soon | P1 | `feature` | **Granular Job Share Permissions matrix (16+ field-level toggles)** | `jobSharePermissions` JSONB on `jobItems` — one boolean per candidate field (Name, Compensation, Photo, Title, Location, Social URLs, Experience, Education, Notes, Summary, Latest Activity, Resumes, Kanban Card Fields, Intake) + Job Attachments. HM-portal renderer gates each field against the matrix. |
| 241 | 🔲 Open | Soon | P1 | `feature` | **Scorecard visibility tri-state for hiring managers** | `jobScorecardVisibility` enum: hide-HM-until-submit / always-hide-HM / always-show-HM. Tenant default + per-job override. Renderer in HM portal applies the rule. |
| 242 | 🔲 Open | Soon | P1 | `feature` | **Hiring-manager scorecards (HM-authored, structured)** | Distinct from candidate self-assessment. `hiringManagerScorecards` (jobId, candidateId, hmUserId, ratings JSONB, comments, submittedAt). Configurable via Org → Scorecards. Feeds #241 visibility rules. |
| 243 | 🔲 Open | Soon | P1 | `feature` | **Candidate Packet generator + Anonymize toggle** | Multi-candidate PDF/HTML export keyed off `candidateSubmissions`. Anonymize replaces name + email + photo with initials. Reuses ATS package generator (#118) renderer + storyboard layout. Powers the recruiter→hiring-manager submission artefact. |
| 244 | 🔲 Open | Soon | P1 | `feature` | **Compliance workspace (GDPR + EEOC + Outreach unsub + SMS consent)** | One Settings → Compliance tab consolidating: GDPR scope (All / EU only / etc), lawful basis (legitimate interest vs consent) for archived candidates, retention period, privacy-policy link, EEOC scope, SMS-consent ledger, bulk-≥10 unsubscribe-injection toggle. Wires existing `privacyPreferences` + adds tenant-scoped policy rows. Closes the surface gap left by #186. |
| 245 | 🔲 Open | Soon | P2 | `feature` | **Email safety tolerance slider + auto-throttle on spam-behavior detection** | Tenant pref (Safe / Moderate / High / Risky) → daily-cap + min-interval-between-sends. Cron honours both; auto-downgrades the tier on bounce-rate / complaint-rate spikes. Feeds outreach + transactional sends. |
| 246 | 🔲 Open | Mid | P3 | `feature` | **Email tracking toggles (Opens / Clicks / Downloads)** | Workspace defaults + per-message override. Tracking pixel + click-redirect omitted when disabled. Outreach campaigns track regardless (mirror Loxo behaviour). |
| 247 | 🔲 Open | Mid | P4 | `feature` | **Email default style preset (font / size / line-height / colour)** | Saved on `accountPreferences.emailStyle`. Composer + outreach-send pipeline inject the inline CSS. Includes the Loxo deliverability tip ("plain styles deliver better"). |
| 248 | 🔲 Open | Mid | P2 | `feature` | **Forms (custom application / intake forms)** | Tenant-scoped form builder distinct from in-video lead capture (#140). Schema: `workspaceForms` (fields JSONB), `workspaceFormSubmissions`. Public URL per form; submissions create / update candidate records. Replaces ad-hoc Google Form / Typeform usage. |
| 249 | 🔲 Open | Mid | P3 | `feature` | **Custom Validations (per-tenant required-field rules)** | Rules engine on `candidateSubmissions` save: e.g. "phone required before Submitted stage", "salary required before Hired". `workspaceValidationRules` (entityType, condition, requiredFields). Returns 422 with structured errors. |
| 250 | 🔲 Open | Mid | P2 | `feature` | **Custom Roles (per-tenant RBAC beyond superadmin/owner)** | Extends `users.role` (system-wide) with `workspaceRoles` + `workspaceRolePermissions` matrix. Admin UI to define a role + flip per-feature toggles. Read by `requireWorkspacePermission()` middleware. |
| 251 | 🔲 Open | Soon | P1 | `feature` | **Resume Forwarding Address (`{slug}.resume-forward.hired.video`)** | Per-recruiter inbound email address. MX + Mailgun-style inbound webhook handler parses From + attachment via existing résumé parser (#149), creates a `talentPoolCandidates` row, attaches the parsed résumé. Spam filter + size cap. |
| 252 | 🔲 Open | Mid | P2 | `feature` | **Boost Approvals queue (job-amplification governance)** | Tenant pref `requireBoostApproval`. Sponsored-job purchases (#106) and company-boost purchases (#107) enter `pending_approval` until an owner-role user approves. Adds `boostApprovals` queue. |
| 253 | 🔲 Open | Mid | P4 | `feature` | **"Show Rejected By Types on Rejection Modal" toggle** | Tenant pref. Reuses Rejection Reason taxonomy (#234). When on, the rejection modal additionally captures Rejected By: Candidate / Client / Consultant. |
| 254 | 🔲 Open | Mid | P3 | `feature` | **Per-user notification prefs: ownership-change + SMS-response routing** | `notificationPreferences` rows: emailOnOwnershipChange, emailOnPlacementUpdate, smsResponseNotifyOwner. Read by the existing notifications dispatcher. |
| 255 | 🔲 Open | Mid | P3 | `feature` | **Inbound SMS routing rule → Person Owner** | Inbound SMS webhook (extends #97) maps `from` to person record, looks up the assigned owner, emits an in-app + email notification. |
| 256 | 🔲 Open | Mid | P2 | `feature` | **Workday integration (in-house tenants — WS URL + OAuth2)** | Beyond #64 ATS connector. Per-tenant Workday Web Services URL + OAuth2 client/secret/refresh-token store. Job + candidate sync via SOAP. Targets the Workday-running enterprise that wants hired.video as the front-end. |
| 257 | 🔲 Open | Soon | P1 | `feature` | **Okta SSO (per-tenant OIDC)** | `tenantSsoConnections` row (provider="okta", clientId, clientSecret, oktaDomain). OIDC flow; auto-provisions users on first login. Required for any enterprise deal. |
| 258 | 🔲 Open | Soon | P1 | `feature` | **SAML 2.0 SSO (metadata XML upload)** | Generic SAML IdP-init + SP-init. Stores IdP metadata XML, certificate, SSO URL on `tenantSsoConnections`. Pairs with #257 Okta as alternative auth method. |
| 259 | 🔲 Open | Mid | P2 | `feature` | **Xero integration (invoice / payable sync)** | Per-tenant Xero OAuth2 client/secret + redirect URI. Syncs `placements` back-office (#229) into Xero invoices and bills. |
| 260 | 🔲 Open | Mid | P3 | `feature` | **RingCentral integration (click-to-call + call-log sync)** | Complements existing SignalWire phone (#97) for tenants standardised on RingCentral. Per-user OAuth; inbound call events land on the person timeline. |
| 261 | 🔲 Open | Mid | P3 | `feature` | **Generic API-key vendor integrations registry** | Self-serve `tenantIntegrations` (provider, slug, credentials JSONB encrypted) for the long tail. Lets workspace admins paste credentials for any vendor without a custom connector. Surfaces in Settings → Integrations. |
| 262 | 🔲 Open | Mid | P2 | `feature` | **Invoice schedules (recurring invoice config)** | `invoiceSchedules` (tenantId, cadence, nextRunAt, lineItemTemplate). Cron generates invoices into Xero (#259) on schedule. Pairs with #229 placement back-office. |
| 263 | 🔲 Open | Mid | P4 | `feature` | **Default currency / country / timezone (workspace-level)** | `accountPreferences` extension. Threads into formatting helpers (Intl.NumberFormat / DateTimeFormat) across the app. |
| 264 | 🔲 Open | Mid | P3 | `feature` | **Enrichment policy: catch-all + unknown email toggles** | Workspace policy flags evaluated by native enrichment: when OFF, catch-all / unknown emails are discarded and not charged. Default: catch-all OFF, unknown OFF. |
| 265 | 🔲 Open | Mid | P3 | `feature` | **Auto-merge vs review queue for duplicate persons** | Tenant policy. When manual-review selected, candidate merges land in `personMergeQueue` for owner approval. Auto-merge applies the workspace's confidence threshold to hired.video's native duplicate scorer (`workspace_person_merge_policy`, `shared/contacts.ts`). |

**Total new entries: 60** (#206–#265). Mix: 14 P1 · 28 P2 · 14 P3 · 4 P4. By type: 56 `feature` · 1 `arch`. By phase: 3 Now-P1 · ~13 Soon-P1/P2 · balance Mid · few Later.

---

## 5. Roadmap by persona

Phases mirror the README's `Now` (0–30d) · `Soon` (30–60d) · `Mid` (60–120d) · `Later` (6–12mo) bands.

### 5.1 Recruiter / agency

**Now (P0/P1 wedge — closes Loxo's core differentiator).** Without these the product is not a real recruiter ATS.
- Workflow engine: #209 stages, #210 progression-activity engine, #211 customise-activities semantics
- Placement closing kit: #225 multi-placement, #226 type-from-taxonomy, #227 fee toggle, #228 splits
- Three-axis Tags (#231) + Job Type taxonomy (#232)
- Resume Forwarding Address (#251)
- Existing in-flight: #99 BD pipeline, #157–#159 creator opt-ins

**Soon.**
- Source UI shell + triage (#215, #216, #217)
- Hiring-manager surface: #240 share-permissions matrix, #241 scorecard visibility, #242 HM scorecards, #243 Candidate Packet
- Outreach maturity: #212 templates library, #213 stage variants, #214 workspace hours
- Compliance workspace (#244) + email deliverability slider (#245)
- Rejection Reason taxonomy (#234) + #237 built-in semantics
- Existing in-flight: #95 custom email domain, #134 AI avatar, #146 Gmail/Outlook auto-status

**Mid.**
- Talent Insights (#218), Source filters (#220, #221), session log (#219)
- Sales CRM expansion: #222 configurable pipeline, #223 deals, #224 pitches
- Placement back-office (#229), per-placement notifications (#230), invoice schedules (#262)
- Submittal & CRM agents: #207, #208
- Email tracking toggles (#246), default style (#247)
- Forms (#248), Custom Validations (#249), Custom Roles (#250)
- Workspace taxonomies finishing pass: #233, #235, #236, #238, #239
- Notifications: #254, #255
- Calendar Link Templates (#206)

**Later.**
- Boost approvals (#252), rejected-by toggle (#253)
- Generic API-key registry (#261), RingCentral (#260)
- Existing in-flight: #100 outplacement, #105 corporate L&D

### 5.2 Employer / in-house company

**Now.**
- Existing: #64 ATS connectors, #67 seat billing, #93 AI CHRO hero, #106/#107 sponsored boosts
- Job-share permissions (#240) + scorecard visibility (#241) — table-stakes for HM portal
- Compliance workspace (#244)

**Soon.**
- Okta SSO (#257), SAML SSO (#258) — gates every enterprise deal
- Workday in-house tenant (#256)
- Custom Roles (#250)

**Mid.**
- Forms (#248), Custom Validations (#249)
- Xero (#259), invoice schedules (#262)
- Currency/country/timezone defaults (#263)
- Existing in-flight: #189 merge.dev, #105 L&D, #200 LMS connectors

**Later.**
- Boost approvals (#252), default email style (#247)
- Long-tail integrations (#261)

---

## 6. Decisions deferred / open questions

1. **Submittal Agent (#207) vs ATS Package (#118) overlap.** Both produce a shareable candidate artefact. Decision: ship #207 as a new `purpose` on the existing storyboard generator + #118 renderer pipeline — *not* a separate codepath. If that proves too constrained, split later.
2. **Per-stage email variants (#213) — extend #95 or new entry?** Current call: new entry, because variant-state lives on `followUpSequenceSteps` and #95 is the email-delivery-provider entry. Reasonable to fold if #95 remains open at build time.
3. **Tags axis count.** Loxo has three (Company / Job / Person). Hired.video also has Articles, Templates, Voice Clones, Courses, Services. Should the taxonomy be polymorphic from day one (#231 with `axis enum`)? Default: yes — strictly cheaper than a v2 migration.
4. **BUILT-IN semantics (#237).** Implement once cross-cutting, or per-table? Cross-cutting middleware preferred but requires every taxonomy to share a base table shape — confirm before #231 lands.
5. **Diversity self-ID (#236) consent model.** GDPR special-category data. Current spec stores consent per-record; need a privacy review before ship.
6. **Resume Forwarding Address (#251) DNS model.** `{slug}.resume-forward.hired.video` requires wildcard MX. Cloudflare Email Routing supports this; pending capacity check on inbound parsing latency for resume PDFs.
7. **Compliance workspace (#244) split.** Should this be one fat entry or split into GDPR / EEOC / SMS-consent / unsub-injection sub-entries? Current call: one entry — cheaper to ship as a single Settings tab; sub-entries fragment the work. Re-split if the build slips past Soon.
8. **SSO bundle pricing.** #257 + #258 are typically locked behind an Enterprise tier elsewhere. Hired.video doesn't have one (`project_enterprise_roadmap.md`). Decision deferred to Pricing — ship the capability ungated for the first Okta/SAML deal that closes.

---

## Appendix A — Loxo features explicitly excluded

| Loxo feature | Reason |
|---|---|
| Loxo Credits ledger (per-action billing) | Contradicts hired.video's $9.95 + 1M tokens model. |

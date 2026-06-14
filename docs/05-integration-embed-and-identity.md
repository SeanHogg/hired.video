# 05 — PRD: Integration, Embed-Back & Identity Federation

This is the **contract between the two apps**. It specifies how BurnRateOS authenticates into
hired.video, how external candidates authenticate, how Segments are provisioned, how hired.video
surfaces re-embed into BurnRateOS, the cross-domain API seams, and how the BurnRateOS `/ops/*` pages
become thin shells. It reuses the **existing** BurnRateOS embed rail and AI gateway — no parallel
rails.

---

## 1. Topology

```
┌──────────────────────────────┐                          ┌──────────────────────────────┐
│           BurnRateOS          │                          │          hired.video           │
│                              │                          │                                │
│  Identity Provider (OIDC)    │ ──(1) SSO: OIDC/JWT─────► │  Tenant: "burnrateos"          │
│  Account / Company / User    │      tenant+acct+co       │  resolveSegment() → Segment    │
│                              │                          │                                │
│  Embed rail (embed.ts)       │ ──(2) embed snippet─────► │  Embeddable surfaces           │
│   SystemFeature/AccountFeature│      view=roster|reqs|… │   (roster, 1:1s, reviews, ATS) │
│                              │                          │                                │
│  BI / Investor / CISO / graph│ ◄─(3) cross-domain API──► │  /v1 People + Talent + Video   │
│                              │                          │                                │
│  api.builderforce.ai (LLM)   │ ◄─(4) gateway (unchanged) │  callAiAndCharge (per Segment) │
│                              │                          │   + (5) candidate magic-link   │
└──────────────────────────────┘                          └──────────────────────────────┘
                                                            ▲ (5) external candidates/guests
```

Five channels: **(1) host identity**, **(2) embed UI**, **(3) data API**, **(4) LLM gateway**
(already exists, unchanged), **(5) candidate magic-link identity** (net-new vs BuilderForce).

---

## 2. Identity federation

### 2.1 SSO (BurnRateOS = IdP)

- BurnRateOS exposes an OIDC issuer. hired.video trusts it for the `burnrateos` tenant
  (`Tenant.idpIssuer`).
- On embed load (or direct visit), hired.video receives a signed JWT with claims:

```jsonc
{
  "iss": "https://app.burnrateos.com",
  "sub": "<userId>",
  "tenant": "burnrateos",
  "accountId": "<accountId>",
  "companyId": "<companyId>",
  "role": "OWNER|ADMIN|MEMBER|…",
  "persona": "CHRO|CEO|…",
  "plan": "FREE|PRO|ENTERPRISE",
  "teamIds": ["…"],
  "displayName": "…", "email": "…", "avatarUrl": "…",
  "aud": "host",                       // audience discriminator — see §2.4
  "exp": 1234567890
}
```

- hired.video verifies signature + issuer + expiry, then `resolveSegment()`:
  `(tenant, accountId, companyId)` → `Segment` (lazy-create on first sight, `provisionedAt = now`).
- Claims hydrate `IdentityCache`; `role`/`persona`/`plan` gate features and seed the credit-ledger
  tier for that Segment.

### 2.2 Tenancy enforcement (the no-bleed guarantee)

- `resolveSegment(jwt)` is the **only** entry to host data. Every `/v1` handler runs inside a
  `(tenantId, segmentId)` context object; repositories require it.
- A JWT for company A can never resolve to company B's Segment (`Segment` unique key is
  `(tenantId, externalAccountId, externalCompanyId)`).
- Company switch in BurnRateOS → new `companyId` claim → different Segment. No caching across
  Segments in request scope.

### 2.3 Service-to-service auth

For channel (3) with no end-user present (e.g. a CRM/BI webhook), use a **tenant service token**
(client-credentials) carrying `tenant` + target `accountId`/`companyId` so hired.video resolves the
Segment server-side. Scope tokens to specific endpoints (e.g. `read:bi.burn`, `ingest:roster`).

### 2.4 Candidate / guest magic-link identity (channel 5 — net-new)

External candidates and interview guests are **not** BurnRateOS users. They authenticate by
**magic-link token** (the pattern already exists in `booking_reservations.magicLinkToken`):

- A magic-link token has `aud: "candidate"` (vs `aud: "host"` for SSO JWTs) and is **pinned** to one
  `(segmentId, entityId)` where entity ∈ {Interview, Candidate, BookingReservation, Offer}.
- Candidate tokens are accepted **only** by `/v1/portal/*` and `/v1/public/careers/*` (apply) routes;
  host `/v1/*` routes reject `aud: "candidate"`, and `/v1/portal/*` rejects `aud: "host"`. This audience
  split is the core guardrail.
- Tokens expire (`Interview.expiresAt`); re-issue requires a host action. A candidate session can
  never enumerate Segment data — every read is the single pinned entity.
- All portal actions are audited with the token's entity context.

---

## 3. Segment provisioning handshake

1. First authenticated host request for an unknown `(accountId, companyId)` lazily creates a Segment
   (`status = ACTIVE`, `plan` from claim).
2. Optional eager provisioning: BurnRateOS calls
   `POST /v1/admin/segments { accountId, companyId, displayName, plan }` (tenant service token) when a
   company first enables the embed — pre-warms the Segment and seeds defaults (default TCO
   assumptions, default 1:1 templates, default pipeline stages, default careers slug).
3. Plan changes in BurnRateOS propagate via `PUT /v1/admin/segments/:id { plan }` or the next JWT
   claim; hired.video updates feature gating + credit tier.
4. Company deletion / GDPR erasure in BurnRateOS → `DELETE /v1/admin/segments/:id` cascades delete of
   all Segment-scoped rows **including video recordings, resumes, and transcripts** (honors the
   BurnRateOS DSR/erasure posture and the `EmbedConsentLog` model).

---

## 4. Cross-domain API seams (channel 3)

These replace the in-process coupling that existed when the CHRO domain lived inside BurnRateOS. All
are async/eventual and never block a render path.

### 4.1 Roster → BurnRateOS Company record — *hired.video pushes*

- Every `Employee` CRUD emits a `roster.changed` webhook (HMAC-signed, per tenant). BurnRateOS
  recomputes the Company's `teamSize` + `coFounders` (replacing the in-process `syncCompanyFromRoster`
  that ran on every employee write).
- Idempotent; BurnRateOS is the source of truth for the Company record, hired.video for the roster.

### 4.2 Candidate sourcing/enrichment ← Company/Contact graph — *hired.video pulls*

- hired.video calls the existing BurnRateOS `POST /api/embed/sourcing/{lookup,reconcile}` + Contacts
  API (tenant service token, scope `read:contacts`) to source/enrich candidates (the catalog already
  names recruiting as a graph consumer and Tier-4 enrichment as "hired.video's sweet spot").
- **Suppression + DSR are enforced on the BurnRateOS side** — a suppressed identifier returns no data
  and incurs no spend. hired.video stores provenance in `Candidate.externalContactRef`.

### 4.3 Headcount/TCO/comp → CFO burn & runway — *bidirectional*

- **hired.video → BurnRateOS:** push headcount monthly-cost + hire/termination events so BI's burn
  rate reflects real people-cost. (Replaces the mis-filing where these tables lived under the CFO
  routes but were never read by burn.)
- **BurnRateOS → hired.video:** hired.video calls `GET /api/bi/burn-rate?companyId=…` (scope
  `read:bi.burn`) to get current monthly burn + runway months, used by TA-5 `calculate-impact` to
  produce real `monthlyBurnIncrease` + `runwayImpactDays`. **Closes the "runway impact" marketing gap
  the BurnRateOS code never wired.** Graceful fallback to manual burn input if the scope isn't granted.

### 4.4 Employee equity grants → investor cap table — *hired.video pushes*

- On `Offer` acceptance (TA-3) and equity changes, hired.video emits an `equity.granted` event.
  BurnRateOS reconciles it into `cap_table_entries` (which **stays** in BurnRateOS — CFO/Investor
  domain). hired.video owns people-comp/equity *grants*; BurnRateOS owns the cap table.

### 4.5 HR compliance ↔ CISO Compliance Calendar

- The shared `compliance_items` table is split by `area`: HR-area items move with hired.video;
  non-HR items stay in the CISO Governance domain. HR-area deadlines optionally surface on the CISO
  Compliance Calendar via a `compliance.hr.deadline` webhook.

### 4.6 Goal/OKR linkage ← product/agile work items

- hired.video owns objectives/goals. BurnRateOS (and BuilderForce, if extracted) store
  `linkedObjectiveId`/`linkedKeyResultId` and read goal status via `GET /v1/goals/:id` /
  `GET /v1/strategic-objectives/:id` with the user JWT.

---

## 5. Embed-back: BurnRateOS thin shells (channel 2)

### 5.1 Reuse the existing embed rail — do not build a parallel one

Per the unified-embed-snippet rule, hired.video embedding rides the **same rail** as the heatmap/
support/feedback/sourcing widgets (`routes/embed.ts`):

1. Add **one** embed feature key `embed_hiredvideo` to `EMBED_FEATURE_KEYS` in `routes/embed.ts`.
2. Migration: one `SystemFeature` row (`type = SUB_FEATURE`, parent = `operational_cadence` or a new
   `hiredvideo` parent), `requiredPlan` set (CHRO persona is PRO+ today — keep that gate), default
   `HIDDEN` until wired.
3. Extend `GET /api/embed/config` with the hired.video bootstrap (embed base URL + per-view route map).
4. Add a subsystem block to the `burnrate.js` snippet that mounts a hired.video surface where the page
   markup requests it.
5. Add the toggle card to the embed settings page; reuse the existing consent modal +
   `PUT /api/embed/settings` flow (records `consentVersion`, writes `EmbedConsentLog`).
6. Default OFF; opt-in per (account, company) with the consent moment — same legal posture
   (`isEnabled = true` AND `optedInAt != null`, the two-step account→company fallback lookup).

### 5.2 The thin-shell pages

Each BurnRateOS CHRO page becomes a shell that mounts the corresponding hired.video view, passing the
SSO JWT (so hired.video resolves the Segment):

```
/ops/corporate-roster      → <HiredVideoEmbed view="roster" />
/ops/one-on-ones           → <HiredVideoEmbed view="one-on-ones" />
/ops/performance-reviews   → <HiredVideoEmbed view="performance-reviews" />
/ops/strategy              → <HiredVideoEmbed view="strategy" />        (objectives|milestones|goals tabs)
/ops/pulse-checks          → <HiredVideoEmbed view="pulse-checks" />
/ops/check-ins             → <HiredVideoEmbed view="check-ins" />
/ops/scorecards            → <HiredVideoEmbed view="scorecards" />
/ops/weekly-syncs          → <HiredVideoEmbed view="weekly-syncs" />
/ops/team-health           → <HiredVideoEmbed view="team-health" />
/ops/meeting-intelligence  → <HiredVideoEmbed view="meeting-intelligence" />
/ops/workflows             → <HiredVideoEmbed view="workflows" />
/ops/calendar | /ops/slack → <HiredVideoEmbed view="integrations" />
/ops/bookings              → <HiredVideoEmbed view="bookings" />
/headcount-planning        → <HiredVideoEmbed view="headcount" />
/ops/recruiting            → <HiredVideoEmbed view="ats" />            (new nav; replaces SuperAdmin ATSPage)
/ops/interviews            → <HiredVideoEmbed view="interviews" />     (new — video interview layer)
```

- The `operational_cadence` nav entry in the domain catalog + sidebar stays unchanged — dogfooding +
  CHRO persona gating preserved. The ATS moves out of SuperAdmin into the product `/ops/recruiting`
  surface, and the video-interview layer is a new `/ops/interviews` surface.
- `<HiredVideoEmbed>` is a single shared component (DRY): it handles the iframe/web-component mount,
  JWT handoff, height/resize, deep-link sync (URL ↔ embed route), and a loading/error state. One
  component, parameterized by `view` — not N bespoke embeds.

### 5.3 Migration sequence for BurnRateOS

1. Ship `embed_hiredvideo` (HIDDEN) + the `<HiredVideoEmbed>` component.
2. Behind a feature flag, swap one page (e.g. `/ops/corporate-roster`) to the shell; validate parity
   for one Segment.
3. Roll the rest; keep legacy pages importable until parity is confirmed.
4. **Then** delete the legacy `domains/operationalCadence` + `HeadcountPlanningPage` + SuperAdmin
   `ATSPage` frontend, and the moved backend routes/models (`operationalCadence.ts`, the ATS/
   performance/payroll/PTO halves of `hrLegal.ts`, headcount routes in `businessIntelligence.ts`, TCO
   routes in `financial.ts`) per the "no legacy tables / clean replacement" rule. Verify zero
   references before deleting. **Keep** `cap_table_entries`, `ip_assets`, non-HR `compliance_items`,
   and the `Team`/`TeamMember`/`UserInvitation` identity tables.

---

## 6. LLM gateway (channel 4) — unchanged

- hired.video keeps using `@seanhogg/builderforce-sdk` → `api.builderforce.ai` for all LLM dispatch,
  exactly as BurnRateOS does today: caller passes `useCase` + `viewer`; the gateway owns vendor
  failover; usage is projected to hide vendor/model from non-admins.
- The credit ledger, tier rates, and viewer projection live in hired.video, **scoped per Segment**
  (the `viewer` carries the Segment + role/plan from the JWT).
- The **CHRO persona prompt** is ported verbatim and is the default voice on People-Ops surfaces. New
  `ats.*` and `interview.*` use cases (doc 01 §8) are added to hired.video's `AI_USE_CASES` registry.
- Circuit breaker + `aiErrorMapping` behavior is reused as-is. Note the naming: `api.builderforce.ai`
  (the LLM gateway) is distinct from both apps — hired.video is a *client* of it, like BurnRateOS.

---

## 7. Security & compliance checklist

- [ ] JWT signature + issuer + expiry verified on every embed/API request; `aud` enforced (`host` vs
      `candidate`).
- [ ] `resolveSegment()` is the sole entry to host data; no handler runs without `(tenantId, segmentId)`.
- [ ] Candidate magic-link tokens pin to one `(segmentId, entityId)`; rejected by all host `/v1`
      routes; cannot enumerate.
- [ ] Cross-Segment read is impossible (integration test: Segment A token cannot fetch Segment B rows
      for every `/v1` resource; candidate token cannot fetch any other entity).
- [ ] Service tokens are per-tenant, per-scope, rotatable, and audited.
- [ ] Embed defaults OFF; opt-in records `consentVersion` via the existing consent modal +
      `EmbedConsentLog`.
- [ ] Webhooks HMAC-signed; replay-protected.
- [ ] **Video recordings, resumes, and transcripts** are Segment-scoped, encrypted at rest,
      retention-policed per Segment, and erased by the Segment DSR cascade.
- [ ] Careers-page application captures consent; sourcing/enrichment honors the BurnRateOS suppression
      list + DSR queue (no spend on suppressed identifiers).
- [ ] AI hiring outputs are advisory; never auto-decide; bias guardrails documented (doc 04 VI-4).
- [ ] Per-Segment credit ledger; gateway daily breaker respected.

---

## 8. API surface summary (hired.video `/v1`)

| Group | Endpoints (see PRDs for full list) |
|-------|-------------------------------------|
| Identity/admin | `POST/PUT/DELETE /v1/admin/segments`, `resolveSegment` (internal) |
| People Ops | `/v1/employees*`, `/v1/one-on-ones*`, `/v1/performance-reviews*`, `/v1/goals*`, `/v1/strategic-objectives*`, `/v1/milestones*`, `/v1/pulse-checks*`, `/v1/scheduled-check-ins*`, `/v1/scorecards*`, `/v1/weekly-syncs*`, `/v1/meeting-intelligence*`, `/v1/workflow-triggers*`, `/v1/calendar*`, `/v1/slack*`, `/v1/booking*`, `/v1/analytics/*` |
| Talent + Cost | `/v1/requisitions*`, `/v1/candidates*`, `/v1/offers*`, `/v1/tco/*`, `/v1/headcount/*`, `/v1/roles*`, `/v1/hiring-forecasts*`, `/v1/pto*` |
| Video / Interview | `/v1/interviews*`, `/v1/interviews/:id/scorecards*`, `/v1/requisitions/:id/interview-questions/generate` |
| Candidate portal (magic-link) | `/v1/portal/interviews/:token/*`, `/v1/portal/offers/:token`, `/v1/public/careers/*` |
| Seams | `roster.changed` / `equity.granted` / `compliance.hr.deadline` webhooks (out); `GET /api/bi/burn-rate`, sourcing/contacts (in) |
| Realtime | live-interview rooms + async-recording processing stream (WebSocket/SSE, Segment- or token-authorized) |

All host `/v1` require a Segment-scoped JWT (end-user) or a tenant service token (S2S); all
`/v1/portal/*` require a single-entity candidate magic-link token. Everything is Segment-isolated and
rate-limited per Segment.
```

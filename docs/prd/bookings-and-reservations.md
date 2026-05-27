# PRD — BurnRateOS Bookings & Reservations

**Owner:** BurnRateOS Platform
**Status:** Spec — to be built in BurnRateOS. No reference implementation exists in hired.video today (grep across `api/src/services/`, `frontend/lib/services/`, and `shared/` returns zero matches for `availability` / `reservation` / `booking_*`).
**Surfaces:**
- BurnRateOS UI: `/bookings` module (Availability · Services · Reservations · Payouts · Comments · Calendar Sync · Widgets)
- **Booking Widget**: drop-in `<script>` snippet for any host site (parity with the Sourcing Widget — see `integrations-and-sourcing.md`). "Powered by BurnRateOS.com" attribution.
- External API: `api.burnrateos.com/v1/bookings/*` for hired.video and other consumers.
- Provisioning bridge: SSO/JIT account creation when a hired.video Creator first toggles "Offer sessions."

**Related:**
- [docs/prd/integrations-and-sourcing.md](./integrations-and-sourcing.md) — the contact-sourcing PRD established the cross-product pattern this PRD reuses verbatim.
- Gap register entry **#1648** (open).
- Adjacent register entries: #1627 (senior/executive tooling — fractional/advisory bookings ride on this), #1644 (per-form AudiencePicker — services get audience-tagged via the same picker).

---

## 0. Strategic framing

Hired.video and BurnRateOS are sister products with deliberately separate moats:

- **Hired.video**: *"promote yourself, get hired."* Resume video, personal brand, promotion campaigns, Creator channels, discovery. Primary buyer is the individual.
- **BurnRateOS**: *"a 360 OS for running a business."* Every CxO function in one product. Primary buyer is the business operator (founder, ops lead, fractional CxO, full-time coach, consultant).

1:1 bookings is an operator workflow — calendar management, Stripe Connect onboarding, payout splits, refunds + disputes, accounting entries, two-way calendar sync. It maps cleanly to BurnRateOS's "run your business" thesis and would dilute hired.video's individual-centric story. **BurnRateOS owns the bookings product**; hired.video calls it via the server API. Self-serve customers outside hired.video adopt via the **Booking Widget** with "Powered by BurnRateOS.com" attribution.

The moat for BurnRateOS becomes: the OS that owns the operator's calendar + payment rails alongside the contact graph (`integrations-and-sourcing.md`) — a real wedge against the Calendly + HubSpot + QuickBooks stack. The moat for hired.video remains: the bridge between Creator content ↔ audience discovery ↔ session purchase — uniquely defensible because the audience is acquired on hired.video and converted into paid sessions through the BurnRateOS engine.

---

## 1. Background & problem

The Creator persona model (`memory/project_creator_persona_model.md`) added a `profileMode` flip on `job_seeker`, but stopped at content. Creators today have no surface for selling **time**: coaches, consultants, fractional CxOs, resume coaches, mentors, technical advisors all need to:

1. **Profile** — import a coaching CV / resume of experience to establish credibility (already covered by hired.video resume import).
2. **Services** — define length-tiered session offerings (30 / 60 / 90 / 120 min), each with its own price + description + buffer time.
3. **Availability** — declare recurring weekly availability + one-off overrides + blocked windows; two-way sync with external calendars so personal commitments don't double-book.
4. **Payouts** — onboard to Stripe Connect, accept payment at booking time, collect a platform fee, route the net payout to the host's bank.
5. **Public booking flow** — bookers (often unauthenticated, often coming from a marketing link) see a slot grid showing only `available` / `booked`, never the identity of who booked what; bookers reserve a slot via a magic link with email-only contact.
6. **Reservation management** — bookers can view, comment, reschedule, or cancel their own reservation via a tokenised URL without ever signing up; hosts manage every reservation from the operator surface with full booker identity + payment status + comment thread.
7. **Owner-only reservation visibility** — slot details (booker name, contact, comments) visible to the host; public consumers see status only. Reuses [useEntityDetailsPermission](../../frontend/hooks/use-entity-details-permission.ts) — same single seam established for the globe + Details drawer rule (#1173 / `memory/project_globe_details_owner_only.md`).

No part of this exists today in either codebase.

---

## 2. Goals & non-goals

### Goals
- One BurnRateOS module — `/bookings` — for tenant admins to manage availability, services, reservations, payouts, calendar sync.
- Cache-friendly availability resolution: a slot-grid query for a host over a 14-day window must resolve in < 100 ms p95.
- Magic-link reservation lifecycle: every reservation gets a tokenised URL the booker can use to view / comment / reschedule / cancel without signup.
- Stripe Connect onboarding embedded inside `/bookings` — host completes KYC, links payout bank, and selects platform fee tier in one flow.
- Two-way calendar sync (Google Calendar + Microsoft Outlook): read busy windows so external commitments block availability, write confirmed reservations so they appear in the host's calendar app.
- An external API surface (`/v1/bookings/*`) consumed by hired.video, third-party tenants, and the Booking Widget — API-key auth, rate limits, usage-based billing, webhook callbacks.
- A provisioning bridge that lets hired.video silently provision a BurnRateOS bookings host from a Creator toggle — the user never sees BurnRateOS until they opt in to the full operator surface.

### Non-goals
- Recurring subscription bookings (drip enrollment, weekly cohorts). Phase 2 — tracked separately once single-session is stable.
- Group sessions (one host, many bookers in one slot). Phase 2.
- In-call video. Hosts paste their own Zoom / Google Meet / Whereby link in the service config, surfaced to the booker on confirmation. Native video is a separate workstream.
- Native mobile app for hosts. The operator surface is web-only at launch; the Booking Widget runs anywhere.
- Replacing hired.video's existing Creator surfaces. Hired.video remains the system of record for Creator content, profile, audience.

---

## 3. Users & access

| Role | Can do |
|------|--------|
| **BurnRateOS platform admin** | Manage platform fee tiers, approve high-volume hosts, process disputes, edit refund policy templates, manage external API consumers (issue keys, set rate limits, set billing tier). |
| **Tenant admin** (per-workspace) | Onboard to Stripe Connect, configure services + availability + buffer rules, manage own reservations + comments + payouts, configure calendar sync. |
| **Tenant user** (per-workspace, non-admin) | View own assigned reservations (when a workspace has multiple coaches / hosts). |
| **Booker (public, magic-link)** | Pick a slot, pay, view + comment + reschedule + cancel own reservation via tokenised URL. No signup required. |
| **External API consumer** (hired.video, third-party tenants) | Authenticate via API key. Read host availability, create reservations, register webhooks. Billed per call against the consumer's plan. |
| **Widget host site** | Drops the BurnRateOS Booking Widget `<script>` into their page. Authenticated via short-lived JWT minted by their backend. End-user calls are billed against the host tenant. |

Owner-only reservation visibility is enforced **at the API layer**, not the consumer layer: `GET /v1/bookings/hosts/:id/availability` returns slot status only (`available` | `booked`) for unauthenticated callers and for callers whose `userId ≠ host.userId`. The same endpoint returns full booker identity + payment status + comment count when called with the host's auth. **This is the single seam** — no consumer needs to know "should I show this?"; it asks the API, gets the right shape back. Mirrors the `useEntityDetailsPermission` pattern from #1173.

---

## 4. Data model

All tables live in BurnRateOS. None of these tables exist in hired.video; the consumer reads via API only.

| Table | Purpose |
|-------|---------|
| `booking_hosts` | One per operator. `userId`, `displayName`, `handle` (URL slug, globally unique), `stripeConnectAccountId`, `payoutCurrency`, `platformFeeBps`, `timezone`, `confirmedKycAt`. |
| `booking_services` | A length-tiered offering. `hostId`, `name`, `slug`, `durationMinutes` (30 / 60 / 90 / 120), `priceCents`, `currency`, `descriptionMd`, `videoConferenceLink` (host-supplied Zoom/Meet/Whereby), `bufferBeforeMinutes`, `bufferAfterMinutes`, `isActive`. Unique `(host_id, slug)`. |
| `booking_availability_rules` | Recurring weekly availability. `hostId`, `weekday` (0–6), `startTimeLocal`, `endTimeLocal`, `effectiveFromDate`, `effectiveUntilDate?`. |
| `booking_availability_overrides` | One-off additions or blocks. `hostId`, `dateLocal`, `startTimeLocal`, `endTimeLocal`, `kind` (`add` \| `block`), `reason?`. |
| `booking_external_calendar_links` | OAuth tokens + sync state for Google / Outlook. `hostId`, `provider`, `accessToken`, `refreshToken`, `lastSyncedAt`, `syncCursor`. Tokens encrypted at rest. |
| `booking_reservations` | Each confirmed or pending reservation. `hostId`, `serviceId`, `slotStartUtc`, `slotEndUtc`, `bookerEmail`, `bookerName`, `bookerPhone?`, `status` (`pending_payment` \| `confirmed` \| `cancelled_by_host` \| `cancelled_by_booker` \| `no_show` \| `completed` \| `refunded`), `magicLinkToken` (256-bit, URL-safe, unique), `stripePaymentIntentId`, `amountCents`, `platformFeeCents`, `confirmedAt`, `cancelledAt?`, `cancellationReason?`. |
| `booking_comments` | Threaded comments on a reservation. `reservationId`, `authorKind` (`host` \| `booker`), `authorUserId?` (null when booker), `bodyMd`, `createdAt`. |
| `booking_payout_records` | One per Stripe transfer. `reservationId`, `stripeTransferId`, `netAmountCents`, `currency`, `transferredAt`, `payoutStatus`. |
| `booking_webhook_subscriptions` | Per external API consumer. `consumerId`, `eventType` (`reservation.confirmed` \| `reservation.cancelled` \| `reservation.completed` \| etc.), `targetUrl`, `signingSecret`. |

**Indexes**: `booking_reservations (host_id, slot_start_utc)` for availability resolution; `booking_reservations (magic_link_token)` unique; `booking_services (host_id, is_active)`.

**CHECK constraints**: `booking_services.duration_minutes IN (30, 60, 90, 120)` at launch (the four lengths the gymnastics-coach use case enumerated). Loosen post-launch only with a deliberate widening — keep the seam tight so hosts can't accidentally create 7-minute services.

---

## 5. Provisioning bridge (hired.video → BurnRateOS)

The gymnastics-coach lookalike never visits BurnRateOS directly — they sign up on hired.video, build a Creator profile, and toggle **Settings → Services → Offer sessions**. The bridge:

1. Hired.video Settings page calls `POST api.burnrateos.com/v1/bookings/hosts` with an SSO-bridged JWT identifying the hired.video user. JWT signed by hired.video, verified by BurnRateOS against a published JWK set (same pattern the contact-sourcing widget uses for tenant auth).
2. BurnRateOS provisions a `booking_hosts` row, returns `{ bookingHostId, stripeConnectOnboardingUrl }`.
3. Hired.video stores `bookingHostId` on the user's profile (single column add on the existing user-profile table — no new hired.video table).
4. Hired.video renders the Stripe Connect onboarding URL inline so the host completes KYC without leaving hired.video. On completion Stripe redirects back to hired.video, which polls BurnRateOS for `confirmedKycAt`.
5. Subsequent host actions (configure services + availability) happen via embedded forms on hired.video that call `/v1/bookings/services` + `/v1/bookings/availability-rules` directly. The host never opens BurnRateOS at this stage.
6. If the host later wants the full operator surface (multi-coach workspace, accounting reports, dispute centre), hired.video offers a "Open in BurnRateOS" CTA that SSO-hands off via the same JWT mechanism.

Result: the cross-product split is invisible to the gymnastics coach. They sign up on hired.video, configure once, get paid. BurnRateOS exists as the engine, not as a product they have to learn.

---

## 6. Consumer surfaces (hired.video side)

All consumer surfaces live in hired.video and call the BurnRateOS API. No bookings logic lives in hired.video.

### 6.1 "Services" section on `/people/[id]`

A new section on the public profile that **self-gates**: it queries `/v1/bookings/hosts/handle/:handle/services` and renders only when at least one active service exists. No prop-drilled `canBookSessions` boolean — the section asks the API, returns null if no services, renders the catalogue otherwise. Per the DRY rule (`feedback_extract_on_duplication`).

Each service card shows name, duration, price, description, and a "Book" button that links to `/book/[handle]?service=[slug]`.

### 6.2 Public booking page `/book/[handle]`

A new top-level route. Renders:
- Host hero (name, headshot, short bio — pulled from hired.video profile, not from BurnRateOS).
- Service picker (calls `GET /v1/bookings/hosts/handle/:handle/services`).
- Slot grid for the next 14 days (calls `GET /v1/bookings/hosts/handle/:handle/availability?from=…&to=…&serviceId=…`). Slots display only `available` (clickable) or `booked` (greyed out). No PII visible to the public.
- On slot click: a checkout panel that collects `bookerEmail` + `bookerName` + Stripe Payment Element, then calls `POST /v1/bookings/reservations`. The response includes a `magicLinkUrl` that's emailed to the booker.

### 6.3 Magic-link reservation page `/book/[handle]/r/[token]`

Anyone holding a valid `magicLinkToken` (delivered by email at booking time) can:
- View the reservation (slot, service, payment status).
- Add a comment (`POST /v1/bookings/reservations/:id/comments` with token auth).
- Reschedule (slot grid limited to host's availability; subject to host's rescheduling policy).
- Cancel (subject to host's cancellation policy + refund window).

No signup required. The token is the auth.

### 6.4 Host reservation dashboard `/services` (hired.video)

Hosts on hired.video see a lightweight reservation list at `/services` — pulls `GET /v1/bookings/hosts/:hostId/reservations` with the host's auth. Full reservation detail (booker email, payment status, comment thread) is visible because the API returns the wide shape to the owner. For multi-coach workspaces, hosts are pushed to the full BurnRateOS operator surface via the SSO handoff.

### 6.5 Discovery facet on UnifiedSearch

A new `audience: bookings` filter on `/search` that surfaces every Creator with at least one active service. Wired through the existing `content_audiences` table (#1629) — services get tagged via the shared `<AudiencePicker>` at publish time (#1644 covers the per-form integration).

---

## 7. API surface (external)

All endpoints under `api.burnrateos.com/v1/bookings/`. JSON request/response. API-key auth via `Authorization: Bearer <key>`. Per-consumer rate limits + usage-based billing.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/hosts` | Provision a host from an SSO-bridged JWT. Returns `{ bookingHostId, stripeConnectOnboardingUrl }`. |
| `GET` | `/hosts/:id` | Fetch host config. Owner-wide shape if auth = host; public-narrow shape otherwise. |
| `PATCH` | `/hosts/:id` | Update host config (display name, handle, timezone, platform fee tier). |
| `GET` | `/hosts/handle/:handle/services` | List active services for a public host handle. |
| `POST` | `/hosts/:id/services` | Create a service (host auth). |
| `PATCH` | `/services/:id` | Update a service. |
| `DELETE` | `/services/:id` | Soft-delete (sets `is_active = false`). |
| `GET` | `/hosts/:id/availability-rules` | List recurring rules. |
| `POST` | `/hosts/:id/availability-rules` | Add a rule. |
| `GET` | `/hosts/handle/:handle/availability` | Resolved slot grid for a date range + service (public). Returns `[{ slotStart, slotEnd, status: "available" \| "booked" }]`. |
| `POST` | `/reservations` | Create a reservation. Public + payment-gated. Returns `{ reservationId, magicLinkUrl, paymentClientSecret }`. |
| `GET` | `/reservations/token/:token` | Fetch reservation by magic-link token (booker auth). |
| `GET` | `/reservations/:id` | Fetch reservation by id (host auth). |
| `PATCH` | `/reservations/:id` | Update status / reschedule / cancel. Token auth for booker actions; host auth for host actions. |
| `POST` | `/reservations/:id/comments` | Add a comment. Token auth (booker) or host auth. |
| `GET` | `/reservations/:id/comments` | List comments. Same auth rules as the reservation read. |
| `POST` | `/webhooks/subscriptions` | Register a webhook target. |

**Webhook events**: `reservation.confirmed`, `reservation.cancelled`, `reservation.completed`, `reservation.refunded`, `reservation.comment_added`, `host.kyc_confirmed`. Signed with `signingSecret` per subscription (HMAC-SHA256 over the request body).

---

## 8. Calendar sync

Two-way sync with Google Calendar + Microsoft Outlook via OAuth.

- **Read busy windows**: every confirmed event on the host's primary external calendar blocks the corresponding slots in the BurnRateOS availability resolution. This is critical so a coach who blocks "school pickup 3–4pm Tuesday" in Google Calendar doesn't accept a reservation in that slot.
- **Write reservations**: every BurnRateOS reservation is mirrored to the host's external calendar as a confirmed event with attendee = booker email + link to the magic-link reservation page. This is what gives hosts the "all in one place" calendar view they expect.
- **Conflict handling**: if a host manually deletes the mirrored event in Google, the BurnRateOS reservation stays in `confirmed` state (the external calendar is a mirror, not the source of truth). A future "calendar reconciliation queue" surface in `/bookings` shows external deletions and lets the host decide whether to cancel.

OAuth tokens stored in `booking_external_calendar_links`, encrypted at rest. Refresh token rotation on every use. Webhook-based sync where the provider supports it (Google push notifications, Microsoft Graph change notifications); poll-based fallback every 15 minutes.

---

## 9. Payments (Stripe Connect)

- Hosts onboard to Stripe Connect (Standard accounts at launch; Express as a follow-up).
- Platform fee captured at reservation time: `amountCents × platformFeeBps / 10000`. Default platform fee tier: **5% (500 bps)** for the launch host cohort, with admin-configurable per-host tiers for high-volume operators.
- Payouts: Stripe handles the host payout schedule (default daily rolling). BurnRateOS records each transfer in `booking_payout_records` for reconciliation.
- Refunds: host-initiated from the operator surface, subject to the service's refund policy. Platform fee is refunded proportionally (Stripe's `refund_application_fee=true`).
- Disputes: routed to BurnRateOS platform admin queue. Hosts above a dispute-rate threshold get rate-limited or suspended (admin-tunable).

---

## 10. Phasing

| Phase | Scope | Status |
|-------|-------|--------|
| **0 — foundation** | `booking_*` tables, host provisioning bridge, Stripe Connect onboarding, basic services + availability CRUD, public slot grid (no payments yet). | Not started |
| **1 — paid bookings** | Stripe Payment Element on the public booking page, `pending_payment` → `confirmed` lifecycle, magic-link emails, reservation page (view + comment + cancel). | Not started |
| **2 — reschedule + calendar sync** | Reschedule flow (booker + host initiated), Google Calendar two-way sync, Outlook two-way sync. | Not started |
| **3 — operator polish** | Refund tooling, dispute queue, multi-coach workspaces, accounting export (BurnRateOS ledger entries). | Not started |
| **4 — distribution** | Booking Widget (`<script>` snippet for any host site), external API key + rate-limit + webhook surface for non-hired.video tenants. | Not started |
| **5 — recurring + groups** | Recurring booking subscriptions (weekly sessions, package deals); group sessions (one host, many bookers). | Deferred — out of scope for v1 |

---

## 11. Open questions

- **Default platform fee tier**: 5% is a placeholder. Calendly takes 0% (subscription-based), Cal.com takes 0% (open-source), Acuity/Squarespace take 0% (subscription). A take-rate model differentiates BurnRateOS but may push self-serve hosts to alternatives. Decide before launch whether the take-rate is the primary revenue line or a low-margin distribution lever paired with a BurnRateOS subscription.
- **Multi-tenancy on the host side**: a coaching business with 5 coaches needs 1 BurnRateOS workspace + 5 host records vs. 5 independent workspaces. The data model supports both via `booking_hosts.userId`; the operator surface needs a workspace-host roster to make the multi-coach case usable.
- **Refund policy templates**: should BurnRateOS ship 3 canned templates (strict / moderate / flexible — Airbnb pattern) vs. requiring hosts to write their own? Canned templates lower the onboarding cliff.
- **Booker account creation**: the magic-link flow deliberately skips signup. But power bookers (someone booking 10+ sessions with different coaches) might prefer a unified "my reservations" view. Phase 4 question — solve only if the data shows a meaningful tail of repeat bookers across hosts.

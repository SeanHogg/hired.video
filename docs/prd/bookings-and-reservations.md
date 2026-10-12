# PRD — Bookings & Reservations (hired.video native)

**Owner:** hired.video Platform (Creator program).
**Status:** v1 **built natively** in hired.video — migration `api/drizzle/0195_bookings.sql`,
routes [api/src/routes/bookings.ts](../../api/src/routes/bookings.ts) (mounted at `/api/bookings`),
`BookingsService`, pages `/bookings` (host dashboard), `/book/:handle` (public booking),
`/book/:handle/r/:token` (magic-link reservation). Follow-ups: Stripe Connect payments (#1900),
calendar sync (#1901), UnifiedSearch facet (#1904), magic-link emails (#1905), host comment thread
(#1906).
**Surfaces:**
- hired.video host dashboard `/bookings` (Offerings · Availability · Reservations · Payouts · Comments · Calendar Sync).
- Public booking page `/book/:handle` + magic-link reservation page `/book/:handle/r/:token`.
- "Services" section on the Creator's public profile.
- **Company embed:** the `bookings` surface in `shared/embed.ts`, so a host can put their slot grid
  on their own site.

**Related:**
- Gap register entry **#1648** (closed by v1) and its follow-ups above.
- Adjacent register entries: #1627 (senior/executive tooling — fractional/advisory bookings ride on this), #1644 (per-form AudiencePicker — services get audience-tagged via the same picker).

---

## 0. Strategic framing

hired.video's thesis is *"promote yourself, get hired."* Creators — coaches, consultants, fractional
CxOs, resume coaches, mentors — build an audience on hired.video; bookings let them convert that
audience into paid sessions without leaving the platform. hired.video **owns and builds** the
bookings product natively: calendar management, payments + payout splits, refunds and disputes,
two-way calendar sync. The moat is the uninterrupted loop **Creator content → audience discovery →
session purchase**, all on hired.video.

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

v1 of this shipped natively in migration 0195 (#1648); remaining gaps are listed in the status line above.

---

## 2. Goals & non-goals

### Goals
- One hired.video host dashboard — `/bookings` — to manage offerings, availability, reservations, payouts, calendar sync.
- Cache-friendly availability resolution: a slot-grid query for a host over a 14-day window must resolve in < 100 ms p95.
- Magic-link reservation lifecycle: every reservation gets a tokenised URL the booker can use to view / comment / reschedule / cancel without signup.
- Stripe Connect onboarding inside `/bookings` (via `PayoutOnboardingService`, #1900) — host completes KYC, links payout bank, and selects platform fee tier in one flow.
- Two-way calendar sync (Google Calendar + Microsoft Outlook): read busy windows so external commitments block availability, write confirmed reservations so they appear in the host's calendar app.
- A bookings company-embed surface (`shared/embed.ts`) so hosts can place their slot grid on their own site.
- One-toggle activation: a Creator flips **Offer sessions** (`creator_profiles.bookings_active`) and is a host.

### Non-goals
- Recurring subscription bookings (drip enrollment, weekly cohorts). Phase 2 — tracked separately once single-session is stable.
- Group sessions (one host, many bookers in one slot). Phase 2.
- In-call video. Hosts paste their own Zoom / Google Meet / Whereby link in the service config, surfaced to the booker on confirmation. Native video is a separate workstream.
- Native mobile app for hosts. The host dashboard is web (PWA) at launch; the bookings embed runs on any site.
- Replacing hired.video's existing Creator surfaces. Hired.video remains the system of record for Creator content, profile, audience.

---

## 3. Users & access

| Role | Can do |
|------|--------|
| **SuperAdmin** | Manage platform fee tiers, approve high-volume hosts, process disputes, edit refund policy templates. |
| **Host** (Creator with `bookings_active`) | Onboard to Stripe Connect, configure offerings + availability + buffer rules, manage own reservations + comments + payouts, configure calendar sync. |
| **Workspace member** (multi-coach, Phase 3) | View own assigned reservations when a workspace has multiple coaches / hosts. |
| **Booker (public, magic-link)** | Pick a slot, pay, view + comment + reschedule + cancel own reservation via tokenised URL. No signup required. |
| **Embedding site** | A host's own website showing the bookings company embed (embed key scoped to `bookings`). Same public, status-only slot shape as `/book/:handle`. |

Owner-only reservation visibility is enforced **at the API layer**: the public `GET /api/bookings/public/host/:handle/availability` returns slot status only (`available` | `booked`), while the host-authenticated `/api/bookings/me/reservations*` routes return full booker identity + payment status + comments. **This is the single seam** — no surface needs to know "should I show this?"; it calls the right route and gets the right shape back. Mirrors the `useEntityDetailsPermission` pattern from #1173.

---

## 4. Data model

All tables live in hired.video (`0195_bookings.sql`). As shipped: there is **no `booking_hosts` table** — host identity is `users.id` with `creator_profiles.bookings_active`; the service catalog is `booking_offerings`; `booking_external_calendar_links` (#1901) and `booking_webhook_subscriptions` are not yet built. The table below is the full target model.

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

## 5. Host activation

A Creator never leaves hired.video to start selling sessions:

1. On their Creator profile / Settings they toggle **Offer sessions** → `creator_profiles.bookings_active = true`. Their handle is their hired.video profile handle.
2. They add offerings (`POST /api/bookings/me/offerings`) and availability rules/overrides (`/api/bookings/me/availability/*`) on `/bookings`.
3. Paid offerings require Stripe Connect onboarding through hired.video's `PayoutOnboardingService` (#1900); until then a paid reservation stays `pending_payment` and the host confirms it with `POST /api/bookings/me/reservations/:id/mark-paid`.
4. Multi-coach workspaces, accounting reports, and the dispute centre are Phase 3 features of the same `/bookings` dashboard.

---

## 6. Surfaces

All surfaces and all bookings logic live in hired.video (`BookingsService` + `routes/bookings.ts`).

### 6.1 "Services" section on `/people/[id]`

A section on the public profile that **self-gates**: it queries `GET /api/bookings/public/host/:handle` and renders only when at least one active offering exists. No prop-drilled `canBookSessions` boolean — the section asks the API, returns null if no services, renders the catalogue otherwise. Per the DRY rule (`feedback_extract_on_duplication`).

Each service card shows name, duration, price, description, and a "Book" button that links to `/book/[handle]?service=[slug]`.

### 6.2 Public booking page `/book/[handle]`

A new top-level route. Renders:
- Host hero (name, headshot, short bio — from the hired.video profile).
- Offering picker (calls `GET /api/bookings/public/host/:handle`).
- Slot grid for the next 14 days (calls `GET /api/bookings/public/host/:handle/availability`). Slots display only `available` (clickable) or `booked` (greyed out). No PII visible to the public.
- On slot click: a checkout panel that collects `bookerEmail` + `bookerName` + Stripe Payment Element, then calls `POST /api/bookings/public/reservations`. The response includes a `magicLinkUrl` that's emailed to the booker.

### 6.3 Magic-link reservation page `/book/[handle]/r/[token]`

Anyone holding a valid `magicLinkToken` (delivered by email at booking time) can:
- View the reservation (slot, service, payment status).
- Add a comment (`POST /api/bookings/r/:token/comments`).
- Reschedule (slot grid limited to host's availability; subject to host's rescheduling policy).
- Cancel (subject to host's cancellation policy + refund window).

No signup required. The token is the auth.

### 6.4 Host dashboard `/bookings`

Hosts manage offerings, availability, and reservations at `/bookings` ([BookingsHost.tsx](../../frontend/pages/bookings/BookingsHost.tsx)) — `GET /api/bookings/me/reservations` with the host's auth returns the wide shape (booker email, payment status, comments). Multi-coach workspaces are a Phase 3 extension of the same dashboard.

### 6.5 Discovery facet on UnifiedSearch

A new `audience: bookings` filter on `/search` that surfaces every Creator with at least one active service. Wired through the existing `content_audiences` table (#1629) — services get tagged via the shared `<AudiencePicker>` at publish time (#1644 covers the per-form integration).

---

## 7. API surface (`/api/bookings`, shipped)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/public/host/:handle` | Public host + active offerings. |
| `GET` | `/public/host/:handle/availability` | Resolved slot grid (status only). |
| `POST` | `/public/reservations` | Create a reservation; returns the magic-link token. |
| `GET` | `/r/:token` | Reservation by magic-link token (booker). |
| `GET/POST` | `/r/:token/comments` | Booker comment thread. |
| `POST` | `/r/:token/reschedule` · `/r/:token/cancel` | Booker reschedule / cancel. |
| `GET` | `/me/host` | Host config for the signed-in Creator. |
| `GET/POST/PUT/DELETE` | `/me/offerings[/:id]` | Offering CRUD (soft-delete). |
| `GET/POST/DELETE` | `/me/availability/rules[/:id]` | Recurring weekly availability. |
| `POST/DELETE` | `/me/availability/overrides[/:id]` | One-off adds/blocks. |
| `GET` | `/me/reservations[/:id]` | Host reservation list / detail (wide shape). |
| `GET/POST` | `/me/reservations/:id/comments` | Host comment thread. |
| `POST` | `/me/reservations/:id/cancel` · `/reschedule` · `/mark-paid` | Host actions. |

**Planned:** Stripe webhook `payment_intent.succeeded` → `BookingsService.markPaid` (#1900); outbound
reservation events (`reservation.confirmed`, `reservation.cancelled`, `reservation.completed`,
`reservation.refunded`, `reservation.comment_added`) through the notification dispatcher and, for
hosts who want them, HMAC-signed webhooks (`booking_webhook_subscriptions`).

---

## 8. Calendar sync

Two-way sync with Google Calendar + Microsoft Outlook via OAuth.

- **Read busy windows**: every confirmed event on the host's primary external calendar blocks the corresponding slots in hired.video's availability resolution (`resolveAvailableSlots`). This is critical so a coach who blocks "school pickup 3–4pm Tuesday" in Google Calendar doesn't accept a reservation in that slot.
- **Write reservations**: every hired.video reservation is mirrored to the host's external calendar as a confirmed event with attendee = booker email + link to the magic-link reservation page. This is what gives hosts the "all in one place" calendar view they expect.
- **Conflict handling**: if a host manually deletes the mirrored event in Google, the hired.video reservation stays in `confirmed` state (the external calendar is a mirror, not the source of truth). A future "calendar reconciliation queue" surface in `/bookings` shows external deletions and lets the host decide whether to cancel.

OAuth tokens stored in `booking_external_calendar_links`, encrypted at rest. Refresh token rotation on every use. Webhook-based sync where the provider supports it (Google push notifications, Microsoft Graph change notifications); poll-based fallback every 15 minutes.

---

## 9. Payments (Stripe Connect)

- Hosts onboard to Stripe Connect (Standard accounts at launch; Express as a follow-up).
- Platform fee captured at reservation time: `amountCents × platformFeeBps / 10000`. Default platform fee tier: **5% (500 bps)** for the launch host cohort, with admin-configurable per-host tiers for high-volume operators.
- Payouts: Stripe handles the host payout schedule (default daily rolling). hired.video records each transfer in `booking_payout_records` for reconciliation.
- Refunds: host-initiated from the operator surface, subject to the service's refund policy. Platform fee is refunded proportionally (Stripe's `refund_application_fee=true`).
- Disputes: routed to the hired.video SuperAdmin queue. Hosts above a dispute-rate threshold get rate-limited or suspended (admin-tunable).

---

## 10. Phasing

| Phase | Scope | Status |
|-------|-------|--------|
| **0 — foundation** | `booking_*` tables, `bookings_active` host activation, offerings + availability CRUD, public slot grid. | Done (0195) |
| **1 — paid bookings** | Stripe Connect onboarding + Payment Element on the public booking page (#1900), `pending_payment` → `confirmed` lifecycle (host mark-paid today), magic-link emails (#1905), reservation page (view + comment + cancel — done). | Partial |
| **2 — reschedule + calendar sync** | Reschedule flow (booker + host initiated — done), Google Calendar + Outlook two-way sync (#1901). | Partial |
| **3 — operator polish** | Refund tooling, dispute queue, multi-coach workspaces, accounting export (hired.video payout-ledger entries), host comment thread (#1906). | Not started |
| **4 — distribution** | Bookings company embed (`shared/embed.ts`) for hosts' own sites, UnifiedSearch "Available for sessions" facet (#1904), host webhooks. | Not started |
| **5 — recurring + groups** | Recurring booking subscriptions (weekly sessions, package deals); group sessions (one host, many bookers). | Deferred — out of scope for v1 |

---

## 11. Open questions

- **Default platform fee tier**: 5% is a placeholder. Calendly takes 0% (subscription-based), Cal.com takes 0% (open-source), Acuity/Squarespace take 0% (subscription). A take-rate model differentiates hired.video but may push self-serve hosts to alternatives. Decide before launch whether the take-rate is the primary revenue line or a low-margin distribution lever paired with the $9.95 Creator seat.
- **Multi-tenancy on the host side**: a coaching business with 5 coaches needs 1 hired.video workspace + 5 hosts vs. 5 independent accounts. Host identity is `users.id`, so both work; the `/bookings` dashboard needs a workspace-host roster to make the multi-coach case usable.
- **Refund policy templates**: should hired.video ship 3 canned templates (strict / moderate / flexible — Airbnb pattern) vs. requiring hosts to write their own? Canned templates lower the onboarding cliff.
- **Booker account creation**: the magic-link flow deliberately skips signup. But power bookers (someone booking 10+ sessions with different coaches) might prefer a unified "my reservations" view. Phase 4 question — solve only if the data shows a meaningful tail of repeat bookers across hosts.

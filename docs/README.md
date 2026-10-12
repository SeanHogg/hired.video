# hired.video — CHRO / People & Talent Domain

> **Purpose of this folder.** These are the domain + PRD design documents for the **CHRO / HR
> (People & Talent) domain that hired.video owns and builds natively** — Operational Cadence plus the
> HR-cost cluster (headcount, TCO/comp, runway impact) and video-first recruiting — inside
> **hired.video**, a video-first People & Talent platform.
>
> Hand these documents to the agentic build solution that is constructing hired.video. Each
> document is self-contained and written to be implementable from this folder alone, while staying
> faithful to the schema and routes that exist in hired.video today.

> **2026-10-03 — BurnRateOS retired.** BurnRateOS was retired on 2026-10-03. Every capability these
> docs once assigned to it is owned and built natively by hired.video; nothing is delegated to an
> external sister product. Native replacements:
> - **Contact graph & sourcing** — `contacts` + `contact_job_links`
>   (`api/drizzle/0493_contacts_graph.sql`, `shared/contacts.ts`), `/api/contacts` (CRUD,
>   `/:id/enrich` via the native `EnrichmentProvider` seam in `api/src/services/enrichment/`,
>   `/:id/jobs` pipeline links, `/merge-queue`). Duplicate-person scoring feeds `person_merge_queue`
>   under `workspace_person_merge_policy`; same-email platform users auto-link via `linked_user_id`.
> - **Inbox actions** — `upsert_contact`, `create_sourcing_lead`, `link_to_pipeline` write native
>   `contacts` / `contact_job_links` rows.
> - **Runway** — `people_tco_settings.cash_on_hand_cents` + `monthly_burn_cents`
>   (`api/drizzle/0440_people_runway_inputs.sql`); the headcount-plan summary computes
>   `runwayImpactDays` natively.
> - **Web push, contact form, cookie consent, help** — `/api/push` + `frontend/public/push-sw.js`,
>   `/api/marketing/contact` + ContactForm, the native cookie banner, and the AI assistant.
> - **Still to build (native roadmap)** — full HR back-office (personnel file, PTO/leave,
>   performance cycles, comp, e-sign), AI meeting notetaker, enterprise SSO (external OIDC tenant
>   federation), the sourcing Source UI, scheduled re-enrichment, and enrichment catch-all/unknown
>   policy flags.
>
> The entity and route designs in docs 00–05 were originally reverse-engineered from the BurnRateOS
> codebase (as of 2026-05-31); they are now hired.video's own specification.

hired.video is the system of record for everything people/talent. There is no host product and no
embed-back relationship: hired.video's only embed surfaces are the company embeds it offers its own
customers for their own sites (`shared/embed.ts`).

## The four locked decisions (these shape everything below)

| # | Decision | Choice |
|---|----------|--------|
| 1 | **System of record** | **hired.video owns the people/talent data.** Roster, org chart, 1:1s, performance, goals/OKRs, objectives, pulse/check-ins, scorecards, weekly syncs, meeting intelligence, workflow automation, calendar/Slack, interview scheduling/bookings, **and** the HR-cost cluster (headcount plans, TCO/comp, runway impact, payroll/equity grants, hiring forecasts, PTO) **and** recruiting (jobs, candidates, contacts, video interviews). |
| 2 | **Net-new depth** | **Video-first talent acquisition.** Build every CHRO feature *and* the thing the name promises: async + live **video interviews**, AI resume parsing, AI candidate screening/scoring, structured interview scorecards, and interview intelligence. LLM calls dispatch through the Builderforce LLM gateway (`@seanhogg/builderforce-sdk`) with new recruiting/interview use cases. |
| 3 | **Customer embeds** | **hired.video's own company embeds.** Customers can surface hired.video views (careers, roster/org chart, booking, profiles) on their own sites via `shared/embed.ts`; hired.video is never embedded into another product's shell. |
| 4 | **Identity & tenancy** | **hired.video owns identity and is multi-tenant.** hired.video `users` / companies are the identity source; isolation is **Tenant → Segment → Entity** (today a single `self` tenant, one Segment per company). Enterprise SSO (a customer's own OIDC IdP) is native roadmap work. hired.video also has external **candidate / interview-guest** identities (magic-link, no account). |

## What hired.video owns (the boundary)

**hired.video owns** (system of record): the entire Operational Cadence domain (roster, 1:1s,
performance, goals/OKRs, objectives, pulse/check-ins, scorecards, weekly syncs, meeting intelligence,
workflow automation, calendar/Slack, bookings), the ATS + performance + payroll/equity grants + PTO,
Headcount Planning, Employee TCO, **runway impact** (cash on hand + monthly burn inputs on
`people_tco_settings`), the **contacts/sourcing graph**, identity/tenancy, and the AI credit ledger.
See [00 §2](./00-extraction-strategy.md).

**Out of scope** (not people/talent, so not built here): an investor cap table, IP/patent asset
registers, and non-HR compliance calendars. Employee equity *grants* are people-comp and are recorded
natively in hired.video; HR-area compliance (employment law, worker classification, I-9) is in scope.
LLM dispatch goes through the Builderforce LLM gateway (`@seanhogg/builderforce-sdk`) — a transport
dependency, not a product owner.

## Reading order

1. **[00 — Domain Ownership Strategy](./00-extraction-strategy.md)** — why, the ownership boundary,
   the native architecture, the build plan, rollout, risks.
2. **[01 — Domain Model & Tenancy](./01-domain-model.md)** — the complete hired.video data model:
   Tenant→Segment→Entity, the Person spine (Employee⇄Candidate), every entity with full field
   unions, the video/recruiting entities, enums, indexes.
3. **[02 — PRD: People Operations Pillar (CHRO)](./02-prd-people-operations.md)** — roster, 1:1s,
   performance, goals/OKRs, objectives & milestones, pulse/check-ins, scorecards, weekly syncs,
   meeting intelligence, workflow automation, calendar/Slack, teams. Stories, flows, acceptance, API.
4. **[03 — PRD: Talent Acquisition & People-Cost Pillar](./03-prd-talent-acquisition.md)** — ATS
   (jobs, candidates, pipeline), headcount planning + runway impact, employee TCO/comp, hiring
   forecasts, payroll/equity grants, PTO. Stories, flows, acceptance, API.
5. **[04 — PRD: Video Interview Intelligence Layer](./04-prd-video-interview-intelligence.md)** —
   the net-new hired.video value: async + live video interviews, resume parsing, AI screening/
   scoring, interview scorecards, interview intelligence, candidate magic-link portal.
6. **[05 — PRD: Identity, Customer Embeds & Internal Seams](./05-integration-embed-and-identity.md)**
   — hired.video identity + enterprise SSO roadmap, candidate magic-link identity, Segment
   provisioning, company embeds for customers' own sites, and the in-process seams (roster →
   company, headcount → runway, offer → equity grant, sourcing → native contacts graph).

## Source-of-truth provenance

The entities and routes in these docs were reverse-engineered from the original source codebase
named in the retirement note above (Prisma schema, the operational-cadence / hr-legal /
business-intelligence / financial route modules, the ops AI tools, and the operational-cadence
frontend domain) as of **2026-05-31**, and are now hired.video's own specification. Where the
source's catalog/marketing copy promised a flow its code did not implement (e.g. workflow automation
actually firing, meeting-intelligence transcription, headcount→runway auto-feed), the PRDs treat it
as a **requirement to build** in hired.video, not an existing behavior, and flag it explicitly.
Schema drift found during the survey (two `performance_reviews` tables; `Employee` rows vs
`payroll_records.employee_name` strings) is called out and **resolved into one spine** in doc 01.

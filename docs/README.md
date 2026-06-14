# hired.video — CHRO / People & Talent Domain Extraction

> **Purpose of this folder.** These are the domain + PRD design documents for **extracting the
> entire CHRO / HR (People & Talent) domain out of BurnRateOS** — Operational Cadence plus the
> HR-cost cluster currently mis-filed under the CFO — and rebuilding it inside **hired.video**, a
> video-first People & Talent platform, which is then **re-embedded back into BurnRateOS** as a
> tenant.
>
> Hand these documents to the agentic build solution that will construct hired.video. Each
> document is self-contained and written to be implementable without reading the BurnRateOS
> source, while staying faithful to the real schema and routes that exist today.

hired.video already exists as a real tenant of the BurnRateOS embed rail (it serves `/resumes/<id>`
pages through `/api/embed/burnrate.js` — see the BurnRateOS gap register). This plan turns that
embed relationship into a **full product relationship**: hired.video becomes the system of record
for everything people/talent, and BurnRateOS becomes one of its tenants and embeds it back.

## The four locked decisions (these shape everything below)

| # | Decision | Choice |
|---|----------|--------|
| 1 | **System of record** | **hired.video owns the people/talent data.** Roster, org chart, 1:1s, performance, goals/OKRs, objectives, pulse/check-ins, scorecards, weekly syncs, meeting intelligence, workflow automation, calendar/Slack, interview scheduling/bookings, **and** the HR-cost cluster (headcount plans, TCO/comp, payroll/equity grants, hiring forecasts, PTO) **and** recruiting (jobs, candidates, video interviews). BurnRateOS reads via embed + API. |
| 2 | **Net-new depth** | **Video-first talent acquisition.** Port every CHRO feature *and* add the thing the name promises: async + live **video interviews**, AI resume parsing, AI candidate screening/scoring, structured interview scorecards, and interview intelligence. Built on the existing `api.builderforce.ai` gateway (CHRO persona + new recruiting/interview use cases). |
| 3 | **BurnRateOS side** | **Thin embed shells.** `/ops/*` nav entries stay, but each page renders an embedded hired.video surface via the existing embed rail. Dogfooding + cross-domain links preserved. |
| 4 | **Identity & tenancy** | **BurnRateOS is the IdP; hired.video is multi-tenant.** BurnRateOS is **one tenant**. Because BurnRateOS is itself multi-tenant, a **Segment** carries the client's `(accountId, companyId)`. Isolation: **Tenant → Segment → Entity.** hired.video adds a **second identity class** BurnRateOS never needed: external **candidate / interview-guest** identities (magic-link, no host account). |

## What moves, what stays (the boundary)

**Moves to hired.video** (becomes its system of record): the entire Operational Cadence domain
(`domains/operationalCadence/*`, `routes/operationalCadence.ts`), the ATS + performance + payroll
+ PTO from `routes/hrLegal.ts`, Headcount Planning from `routes/businessIntelligence.ts`, and
Employee TCO from `routes/financial.ts`. See [00 §2.1](./00-extraction-strategy.md).

**Stays in BurnRateOS** (hired.video federates, never owns): identity/tenancy core
(`Account/Company/Team/User`, RBAC, billing, plan registry), the embed rail itself, the AI gateway,
and three things adjacent-but-not-CHRO that `hrLegal.ts` happened to bundle — the **investor cap
table**, **IP/patent assets**, and **non-HR compliance items** (those belong to CFO/CISO domains).
The CFO keeps consuming people-cost (burn/runway) over an API seam. See [00 §2.2–2.3](./00-extraction-strategy.md).

## Reading order

1. **[00 — Extraction Strategy & Two-App Architecture](./00-extraction-strategy.md)** — why, the
   extraction boundary, the two-app topology, the migration plan, rollout/cutover, risks.
2. **[01 — Domain Model & Tenancy](./01-domain-model.md)** — the complete hired.video data model:
   Tenant→Segment→Entity, the Person spine (Employee⇄Candidate), every ported entity with full
   field unions, the new video/recruiting entities, enums, indexes.
3. **[02 — PRD: People Operations Pillar (CHRO)](./02-prd-people-operations.md)** — roster, 1:1s,
   performance, goals/OKRs, objectives & milestones, pulse/check-ins, scorecards, weekly syncs,
   meeting intelligence, workflow automation, calendar/Slack, teams. Stories, flows, acceptance, API.
4. **[03 — PRD: Talent Acquisition & People-Cost Pillar](./03-prd-talent-acquisition.md)** — ATS
   (jobs, candidates, pipeline), headcount planning, employee TCO/comp, hiring forecasts, payroll/
   equity grants, PTO. Stories, flows, acceptance, API.
5. **[04 — PRD: Video Interview Intelligence Layer](./04-prd-video-interview-intelligence.md)** —
   the net-new hired.video value: async + live video interviews, resume parsing, AI screening/
   scoring, interview scorecards, interview intelligence, candidate magic-link portal.
6. **[05 — PRD: Integration, Embed-Back & Identity Federation](./05-integration-embed-and-identity.md)**
   — the contract between the two apps: SSO/JWT federation, candidate magic-link identity, Segment
   provisioning, the embed rail extension, the BurnRateOS thin-shell migration, cross-domain API
   seams (CFO burn/runway, Company/Contact graph for sourcing, CISO compliance overlap).

## Source-of-truth provenance

Every entity and route in these docs was reverse-engineered from the live BurnRateOS codebase
(`product/api/prisma/schema.prisma`, `product/api/src/worker/routes/{operationalCadence,hrLegal,
businessIntelligence,financial}.ts`, `product/api/src/worker/ai/tools/ops.ts`,
`product/api/src/worker/routes/{ai,embed}.ts`,
`product/frontend/src/domains/operationalCadence/*`) as of **2026-05-31**. Where the catalog/
marketing copy promised a flow the code did not implement (e.g. workflow automation actually firing,
meeting-intelligence transcription, headcount→runway auto-feed), the PRDs treat it as a **requirement
to build**, not an existing behavior, and flag it explicitly. Schema drift found during the survey
(two `performance_reviews` tables; `Employee` rows vs `payroll_records.employee_name` strings) is
called out and **resolved into one spine** in doc 01.

# PRD — Role-Aware Inbox Processors (Profiles + Extraction + Actions)

**Owner:** hired.video Platform
**Status:** Spec. Authoritative status of each entry lives in the [Consolidated Gap Register](../../README.md) (#1979–#1985).
**Date:** 2026-06-08
**Related:** [Loxo Parity](loxo-parity-recruiter-platform.md) (recruiter pipeline/contacts that actions write into) · [BurnRateOS Contacts & Sourcing](integrations-and-sourcing.md) (contact graph) · project memory `project_token_pricing.md` (actions bill the token ledger, no per-action SKU).

---

## 1. Problem

The synced inbox at `/outreach?tab=inbox` is **hardwired to the `job_seeker` persona**. Every layer assumes the user is the candidate:

- The Stage-2 classifier prompt opens literally `"You classify an email for a job-seeker's inbox"` ([classify.ts](../../api/src/services/email-integration/classify.ts)).
- The taxonomy (`JOB_INBOX_CATEGORIES` in [shared/email-classification/types.ts](../../shared/email-classification/types.ts)) is candidate-only: job_opportunity / application_status / recruiter_outreach / interview_invite / offer / rejection. A recruiter's "new req posted" or "this company is hiring" has **no category to land in** → falls to `other` → hidden from the feed.
- `min_job_score` ([externalEmail.ts](../../api/src/db/schema/externalEmail.ts)) is a single per-mailbox threshold against that candidate taxonomy. Surfaced as the Settings slider in [InboxSettingsSheet.tsx](../../frontend/components/communication/InboxSettingsSheet.tsx).
- Stage-1 default rules ([shared/email-classification/rules.ts](../../shared/email-classification/rules.ts)) encode the candidate POV (ATS domains → application_status, recruiter phrases → recruiter_outreach).

So the answer to "does inbox logic change by role?" today is **no**. The toolbar chips (Unread / Show dismissed / Junk) are the only persona-neutral parts — pure view filters over already-classified rows.

There is an existing user-rule system (`email_user_rules` + [EmailRulesPanel.tsx](../../frontend/components/email/EmailRulesPanel.tsx)), but it is deterministic field-matching (sender/subject/body `contains`) emitting a category from the **fixed candidate taxonomy** — not a prompt, not extraction, not actions.

## 2. The two layers (the core decomposition)

The recruiter use-cases below conflate two distinct concerns. The whole design hinges on separating them:

| Layer | Question it answers | Cost | Examples |
|---|---|---|---|
| **L1 — Extract / classify** | *Which emails do I value, and what structured data do I pull out?* | Per-email, cheap, idempotent | job-hunter min-score; recruiter "new req posted"; "company is hiring" |
| **L2 — Act / automate** | *When one matches, do something in another aggregate* | Touches Contacts / JD / pipeline; must be idempotent + audited | associate reply → candidate/JD; intake notes + JD → tailored JD; new hiring company → create contact |

A single prompt cannot do both. L1 is the classifier seam; L2 is a separate, auditable action engine. Conflating them yields an inbox that silently mutates the CRM.

## 3. Target model

### 3.1 Inbox Profile (the role-keyed unit)

Generalize the hardcoded job-seeker classifier into a first-class, role-keyed aggregate. New table `inbox_profiles`:

```
inbox_profiles {
  id, owner_id (nullable for system presets),
  roles: UserRole[]              -- job_seeker | recruiter | employer (USER_ROLES SSoT)
  name, description,
  is_preset: bool,               -- seeded template vs user clone
  taxonomy: jsonb,               -- Category[] — replaces the hardcoded JOB_INBOX_CATEGORIES
  classify_prompt: text,         -- replaces the literal "job-seeker's inbox" constant
  extract_schema: jsonb,         -- JSON Schema of fields to pull (company, role, candidateRef, …)
  min_relevance_score: numeric,  -- generalizes min_job_score; meaning now comes from the profile
  version: int,                  -- bumped on edit; cache key + rules-compile invalidation
}
```

- `min_job_score` on `external_email_accounts` is **renamed** `min_relevance_score` and an `active_profile_id` FK is added. The job-seeker default profile preserves today's threshold semantics → **zero regression**.
- Profile owns its own Stage-1 ruleset (`email_user_rules` gains `profile_id`, nullable = legacy global rule applied to the job-seeker profile).
- `taxonomy` replaces `JOB_INBOX_CATEGORIES` as the inbox-visibility SSoT; `isJobCategory()` becomes `isVisibleCategory(category, profile)`.

### 3.2 Processor (L1 runtime)

The existing two-stage pipeline ([classify.ts](../../api/src/services/email-integration/classify.ts)) becomes **profile-driven** rather than constant-driven:

- Stage-1 `classifyByRules` already supports user rules — key them to the active profile.
- Stage-2 prompt + the extraction schema come from `profile.classify_prompt` / `profile.extract_schema`, not the hardcoded `CLASSIFY_PROMPT`. Extracted fields persist to a new `external_email_messages.extracted` jsonb column.
- `min_relevance_score` gate replaces the `min_job_score` gate in [ingest.ts](../../api/src/services/email-integration/ingest.ts) PASS B.

### 3.3 Action Engine (L2 runtime)

New `inbox_actions` config (per profile) + `inbox_action_runs` audit table. An action is `(trigger) → handler(extracted, email)`:

```
trigger:  category match | rule match | always
handler:  upsert_contact | link_to_pipeline | draft_tailored_jd | create_sourcing_lead | notify | webhook
```

- Handlers reuse existing aggregates — Contacts/sourcing (BurnRateOS consumer pattern, see `project_contact_sourcing_burnrateos`), [JobService](../../api/src/services/job/JobService.ts), recruiter pipeline — never re-implement them in the email service.
- **Idempotent**: keyed on `(message_id, action_id)`; re-sync never double-creates. Audited in `inbox_action_runs` (status, target ref, error) and surfaced in the Sync History sheet next to `rules_fired`.
- Actions bill the token ledger when they call the LLM (e.g. draft_tailored_jd) — no per-action SKU.

### 3.4 Builder UI (full editor — chosen scope)

`/outreach` Settings → "Inbox processor" editor, reusing the Settings sheet seam. Tabs: **Taxonomy** · **Rules** (extends [EmailRulesPanel.tsx](../../frontend/components/email/EmailRulesPanel.tsx)) · **Prompt** (classify + extraction-schema editor) · **Actions** · **Dry-run preview** (classify a sample of the last N synced messages without persisting — guards against a bad prompt wrecking the inbox). DRY: one `<InboxProcessorEditor>` shared across roles; it self-gates visible tabs by the profile's roles, no prop-drilled `canEdit`.

## 4. Preset seeds (system profiles)

| Preset | Roles | Taxonomy adds | Extraction | Actions |
|---|---|---|---|---|
| **Job Hunter** (default) | job_seeker | *(today's categories)* | — | *(none — preserves current behavior exactly)* |
| **Recruiter — Sourcing** | recruiter | `new_requisition`, `candidate_reply`, `submission_update` | role, company, candidateRef, jobRef | link_to_pipeline (reply→candidate/JD) |
| **Recruiter — Biz Dev** | recruiter | `company_hiring`, `inbound_lead` | company, domain, signalSource | upsert_contact, create_sourcing_lead |
| **Recruiter — Intake** | recruiter | `intake_notes` | role, mustHaves, comp, JD-ref | draft_tailored_jd (intake notes + JD → tailored JD) |

Presets are clonable; cloning produces an editable `owner_id`-scoped profile at the user's current `version`.

## 5. Phasing (→ gap register #1979–#1985)

1. **#1979 — Profile foundation (zero-regression).** Migration: `inbox_profiles`, rename `min_job_score`→`min_relevance_score`, `active_profile_id` FK, `email_user_rules.profile_id`, `external_email_messages.extracted`. Seed Job Hunter preset. Rewire classifier/ingest to read the profile; job-seeker path byte-for-byte unchanged. Repo + service + cached profile read (`getOrSetCached` keyed `(ownerId, profileId, version)`).
2. **#1980 — Recruiter extraction presets.** Seed Sourcing/BizDev/Intake taxonomies + prompts + extraction schemas. `extracted` column populated. No actions yet — recruiter mail now reaches the feed correctly.
3. **#1981 — Action engine core.** `inbox_actions` config + `inbox_action_runs` audit + idempotent dispatcher + Sync-History surfacing. Ships with `notify` only.
4. **#1982 — Action handlers.** upsert_contact, link_to_pipeline, create_sourcing_lead, draft_tailored_jd — each wired to its existing aggregate.
5. **#1983 — Builder UI.** `<InboxProcessorEditor>` (taxonomy/rules/prompt/actions) + dry-run preview endpoint.
6. **#1984 — Account→profile assignment + onboarding.** Per-mailbox profile picker in Settings; signup seeds the role-appropriate preset.
7. **#1985 — i18n + tests.** Localize editor (`outreach.processor.*`); schema tests with real-shape fixtures; dry-run snapshot tests.

## 6. Non-goals / open questions

- Multi-job-per-email auto-create stays as-is (existing gap).
- Cross-mailbox shared team profiles (workspace-scoped) deferred — v1 is owner-scoped + system presets.
- AI Notetaker / intake **capture** is BurnRateOS; this PRD only consumes intake notes that arrive by email or are pasted in.

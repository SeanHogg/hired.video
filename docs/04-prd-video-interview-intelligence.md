# 04 — PRD: Video Interview Intelligence Layer

This is the net-new hired.video value — the thing the name promises.
It is a deep capability built **on top of** the People & Talent domain. It consumes the recruiting graph (doc 03) and the AI gateway, and introduces
hired.video's second identity class — the external **candidate / interview-guest** (magic-link).

> Conventions: `/v1`, Segment-scoped JWT for host users; **candidate sessions use a magic-link token
> scoped to a single `(segmentId, interviewId|candidateId)`** (doc 05 §2.4). AI calls name their
> `AI_USE_CASES` key. Video/recordings/resumes are PII — Segment-scoped, encrypted at rest,
> retention-policed, DSR-erasable.

---

## VI-1 — Async Video Interviews

**What it is.** One-way (recorded) video interviews: the recruiter defines questions; the candidate
records answers on their own time via a magic link; the panel reviews asynchronously.

**Entities:** `Interview` (`kind=ASYNC_VIDEO`), `InterviewRecording`.

**User stories**
- As a recruiter, I create an async interview for a candidate (ordered questions, per-question think
  time + max record time) and send the candidate a magic link.
- As a candidate, I open the link (no account), see each question, record/re-record within limits,
  and submit; I never see anyone else's data.
- As a panelist, I watch the recordings, read the AI transcript, and score (VI-4).

**Flow**
1. Create `Interview` (status `INVITED`, `magicLinkToken` minted, `questions` JSON, `expiresAt`).
2. Candidate magic-link session → records each answer → `InterviewRecording` rows (video object,
   `durationSeconds`); status `IN_PROGRESS→SUBMITTED`.
3. On each recording, kick `interview.transcribe` → `transcript` + `transcriptStatus`, then
   `interview.analyze` → `aiAnalysis` (competency signals, sentiment, keywords).

**API**
```
POST   /v1/interviews                              create (kind=ASYNC_VIDEO)  → magic link
GET    /v1/interviews/:id                          host view (recordings + transcripts + analysis)
POST   /v1/interviews/:id/invite                   (re)send magic link
# Candidate (magic-link token, not host JWT):
GET    /v1/portal/interviews/:token                question list + state
POST   /v1/portal/interviews/:token/recordings     upload an answer clip
POST   /v1/portal/interviews/:token/submit
```

**Acceptance**
- Magic-link session can touch **only** its one interview + its own recordings; cannot enumerate the
  Segment.
- Record/think-time limits enforced server-side; re-records bounded.
- Transcription/analysis are credit-metered, retried on failure (`transcriptStatus`), and never block
  candidate submission.

---

## VI-2 — Live Video Interviews

**What it is.** Scheduled real-time interviews, scheduled through the booking cluster (PO-11), with
optional recording + transcription.

**Entities:** `Interview` (`kind=LIVE_VIDEO`), `BookingReservation`, `InterviewRecording`.

**User stories**
- As a recruiter, I schedule a live interview; it creates a `BookingReservation` (slot, panel) and a
  candidate magic link to join.
- As a panelist, I join the room; the session is optionally recorded → transcript → analysis.

**Flow**
1. Create `Interview` (`kind=LIVE_VIDEO`, `reservationId`, `scheduledStartUtc`) via PO-11 booking.
2. At start, both panel (host JWT) and candidate (magic link) join the realtime room.
3. Optional recording → `InterviewRecording` → `interview.transcribe`/`interview.analyze`.

**API**
```
POST   /v1/interviews                              create (kind=LIVE_VIDEO, reservationId)
GET    /v1/interviews/:id/room                     host join token
GET    /v1/portal/interviews/:token/room           candidate join token
```

**Acceptance**
- Room authorization is Segment + interview scoped; a token never joins another interview's room.
- Recording consent is captured (DPA posture); recordings honor retention + erasure.

---

## VI-3 — Resume Parsing & Candidate Enrichment

**What it is.** Turn an uploaded resume (or a sourced contact) into structured candidate data, and
enrich from hired.video's native contacts graph.

**Entities:** `Candidate.parsedResume`, `Candidate.contactId` → `contacts`.

**User stories**
- As a recruiter, I upload a resume and get structured skills/experience/education.
- As a recruiter, I source a candidate from hired.video's contacts graph and auto-fill their profile,
  respecting suppression/DSR.

**Flow**
1. `ats.resume.parse` (doc 03 TA-2) → `parsedResume`.
2. Enrichment via hired.video's `/api/contacts/:id/enrich` (native `EnrichmentProvider` seam in
   `api/src/services/enrichment/`, credit-metered) (doc 05 §4.2); links `Candidate.contactId` and
   records field-level provenance on the contact.

**API** (see TA-2; enrichment runs on the native contacts graph)
```
POST   /v1/candidates/:id/enrich    → graph lookup/reconcile (suppression-checked)
```

**Acceptance**
- Parse idempotent per resume version; enrichment never spends on a suppressed identifier.
- Provenance recorded; enriched fields are field-level attributable.

---

## VI-4 — AI Screening, Scoring & Scorecards

**What it is.** AI-assisted candidate evaluation — fit scoring against the requisition, transcript-
driven competency signals, and structured human scorecards the AI pre-fills (human owns the verdict).

**Entities:** `Candidate.fitScore/fitRationale`, `InterviewScorecard`, `InterviewRecording.aiAnalysis`.

**User stories**
- As a recruiter, I get an AI fit score (0–100) with rationale comparing the candidate to the
  requisition's structured requirements.
- As a panelist, I fill a structured scorecard (competencies, ratings, recommendation STRONG_NO…
  STRONG_YES); the AI suggests ratings from the transcript (`interview.scorecard.assist`) that I can
  accept or override.
- As a hiring manager, I see all panel scorecards aggregated to a hire decision.

**Flow**
1. `ats.candidate.score` → `fitScore`/`fitRationale` (reads requisition + parsed resume + analysis).
2. `interview.scorecard.assist` reads the recording transcript → `aiAssist` suggestions on
   `InterviewScorecard`.
3. Panel submits scorecards (`@@unique([interviewId, interviewerId])`); aggregate view for the decision.

**API**
```
POST   /v1/candidates/:id/score                     → fitScore (ats.candidate.score)
GET/POST /v1/interviews/:id/scorecards              list / submit (one per interviewer)
POST   /v1/interviews/:id/scorecards/assist          → AI-suggested ratings (interview.scorecard.assist)
GET    /v1/candidates/:id/decision                   aggregated panel recommendation
```

**Acceptance**
- AI never sets the final recommendation — it only suggests; the human submits.
- Scoring is credit-metered and explainable (rationale + signals stored).
- Bias guardrails: the CHRO persona prompt + scorecard structure steer toward competency evidence,
  not protected attributes; document the guardrail.

---

## VI-5 — Interview Question Generation

**What it is.** Generate role-specific, competency-mapped interview questions for a requisition.

**Entities:** `Interview.questions`, reads `JobRequisition`.

**User stories**
- As a recruiter, I generate a question set from the requisition (role, level, requirements) and edit
  before sending.

**Flow**
1. `interview.questions.generate` reads requisition → suggested questions (mapped to competencies +
   suggested think/record times) → recruiter edits → attaches to an `Interview`.

**API**
```
POST   /v1/requisitions/:id/interview-questions/generate   → interview.questions.generate
```

**Acceptance**
- Questions are editable, competency-tagged, and credit-metered. Never auto-sent.

---

## VI-6 — Public Careers Page & Application Intake

**What it is.** A public, Segment-branded careers page where candidates apply — the inbound top of
the pipeline.

**Entities:** `JobRequisition` (`careersPagePublished`, `publicSlug`), `Candidate` (`source=CAREERS_PAGE`).

**User stories**
- As a candidate, I browse a company's open roles and apply (name, email, resume), optionally
  recording a quick intro video.
- As a recruiter, applications land as `Candidate`s in stage `APPLIED` with the resume parsed.

**Flow**
1. Published requisitions render on the public page (Segment-branded; reuses the embed-rail public
   surface pattern). Application creates a `Candidate` + optional async-video intro (`Interview`).
2. Resume auto-parsed; DPA/consent captured at submit (the candidate accepts the privacy terms —
   reuse the embed consent posture).

**API** (public, no host JWT — rate-limited, captcha-gated)
```
GET    /v1/public/careers/:segmentSlug                 list published roles
GET    /v1/public/careers/:segmentSlug/:requisitionSlug
POST   /v1/public/careers/:segmentSlug/:requisitionSlug/apply   → Candidate + consent log
```

**Acceptance**
- Public intake never leaks internal data; only published, public-safe fields render.
- Application consent is logged (consentVersion) like the embed rail; suppression honored.
- Spam-resistant (rate limit + captcha); resume upload size/type validated.

---

## VI-7 — Candidate Magic-Link Portal

**What it is.** The single surface external candidates use — record async answers, join live rooms,
view/accept offers — without ever holding a host account.

**Entities:** magic-link tokens on `Interview`, `BookingReservation`, optionally `Offer`.

**User stories**
- As a candidate, one link gets me to my interview/room/offer; the token is single-purpose and
  expiring; I can never see another candidate's data or any roster data.

**Flow**
1. All candidate-facing endpoints live under `/v1/portal/*`, authenticated by a magic-link token whose
   audience is `candidate`, pinned to one `(segmentId, entityId)` (doc 05 §2.4).
2. Tokens expire; re-issue requires a host action.

**API** (token-scoped; see VI-1/VI-2/TA-3)
```
GET/POST  /v1/portal/interviews/:token/*
GET       /v1/portal/offers/:token        (optional offer view/accept)
```

**Acceptance**
- A `candidate`-audience token is rejected by every host `/v1` endpoint and vice-versa.
- The portal cannot enumerate; every read is the one pinned entity.
- All portal actions are audited with the token's entity context.

---

## Layer-level acceptance

- The recruiting graph is continuous with doc 03: `JobRequisition` → (careers/sourced/referral)
  `Candidate` → `Interview` (async/live) → `InterviewRecording` → AI transcript/analysis →
  `InterviewScorecard` → decision → `Offer` → `Employee`.
- Two identity classes coexist safely: host users (Segment-scoped JWT) and candidates/guests
  (single-entity magic-link). The boundary is enforced at the token-audience level.
- All video/resume PII is Segment-scoped, encrypted, retention-policed, and erasable via the Segment
  DSR cascade (doc 05 §7).
- Every AI call (parse, score, transcribe, analyze, scorecard-assist, question-gen) routes through
  the gateway with the CHRO persona, is credit-metered per Segment, and is advisory — humans own
  hiring decisions.

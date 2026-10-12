-- 0207_inbox_recruiter_presets.sql
-- Role-aware inbox processors — Phase 2: recruiter extraction presets (#1980).
--
-- Seeds three system presets so recruiter mail reaches the feed in the
-- right category with structured fields pulled into
-- external_email_messages.extracted (populated by the profile-driven
-- Stage-2 classifier — no actions yet, that's #1981+).
--
--   • Recruiter — Sourcing  (new_requisition / candidate_reply / submission_update)
--   • Recruiter — Biz Dev   (company_hiring / inbound_lead)
--   • Recruiter — Intake    (intake_notes)
--
-- Bodies mirror shared/email-classification/presets.ts (parity-tested, #1985).
-- Idempotent (ON CONFLICT DO NOTHING on the fixed preset id).

-- ── Recruiter — Sourcing ─────────────────────────────────────────────────────
INSERT INTO inbox_profiles (
  id, owner_id, roles, name, description, is_preset, preset_key,
  taxonomy, classify_prompt, summary_prompt, extract_schema,
  default_rule_set, min_relevance_score, version
) VALUES (
  '10b0c0de-0000-4000-a000-000000000002',
  NULL,
  '["recruiter"]'::jsonb,
  'Recruiter — Sourcing',
  'For active sourcing: surfaces new requisitions, candidate replies, and submission updates, and pulls the role / company / candidate / job references out of each.',
  true,
  'recruiter_sourcing',
  '[
    {"key":"new_requisition","label":"New requisition","description":"a hiring manager or client opens a new role / req to fill","visible":true},
    {"key":"candidate_reply","label":"Candidate reply","description":"a candidate responds to outreach (interested, not interested, scheduling)","visible":true},
    {"key":"submission_update","label":"Submission update","description":"client/hiring-team feedback on a candidate you submitted (advance, reject, interview)","visible":true},
    {"key":"newsletter","label":"Newsletter","description":"job-board digest, marketing newsletter","visible":false},
    {"key":"spam","label":"Spam","description":"unsolicited bulk, scam, fraudulent","visible":false},
    {"key":"personal","label":"Personal","description":"friend/family/personal correspondence","visible":false},
    {"key":"other","label":"Other","description":"does not fit any category above","visible":false}
  ]'::jsonb,
  $classify$You classify an email for a RECRUITER's sourcing inbox.
Return ONLY a JSON object: { "category": "...", "score": 0.NN, "reason": "...", "extracted": { ... } }.
Allowed categories:
- new_requisition    = a hiring manager or client opens a new role / requisition to fill
- candidate_reply    = a candidate responds to your outreach (interested, not interested, scheduling)
- submission_update  = client / hiring-team feedback on a candidate you submitted (advance, reject, interview)
- newsletter         = job board digest, marketing newsletter
- spam               = unsolicited bulk, scam, fraudulent
- personal           = friend/family/personal correspondence
- other              = does not fit the above

score = your confidence in [0, 1].$classify$,
  $summary$You produce a one-sentence summary of an email for a recruiter's sourcing inbox.
Constraints:
- One sentence, max 25 words.
- Lead with the most actionable detail (candidate name, role, company, next step).
- Plain text, no markdown, no quoting.
$summary$,
  '{
    "type":"object",
    "properties":{
      "role":{"type":"string","description":"the role / job title referenced"},
      "company":{"type":"string","description":"the hiring company or client"},
      "candidateRef":{"type":"string","description":"candidate name or identifier when the mail is about a specific person"},
      "jobRef":{"type":"string","description":"requisition id / job reference when present"}
    }
  }'::jsonb,
  'recruiter_sourcing',
  '0.500',
  1
)
ON CONFLICT (id) DO NOTHING;

-- ── Recruiter — Biz Dev ──────────────────────────────────────────────────────
INSERT INTO inbox_profiles (
  id, owner_id, roles, name, description, is_preset, preset_key,
  taxonomy, classify_prompt, summary_prompt, extract_schema,
  default_rule_set, min_relevance_score, version
) VALUES (
  '10b0c0de-0000-4000-a000-000000000003',
  NULL,
  '["recruiter"]'::jsonb,
  'Recruiter — Biz Dev',
  'For business development: surfaces companies that are hiring and inbound leads, and pulls the company / domain / signal source out of each.',
  true,
  'recruiter_bizdev',
  '[
    {"key":"company_hiring","label":"Company hiring","description":"signal that a company is hiring / scaling a team (press, job posts, funding)","visible":true},
    {"key":"inbound_lead","label":"Inbound lead","description":"a company reaches out about recruiting / staffing services","visible":true},
    {"key":"newsletter","label":"Newsletter","description":"job-board digest, marketing newsletter","visible":false},
    {"key":"spam","label":"Spam","description":"unsolicited bulk, scam, fraudulent","visible":false},
    {"key":"personal","label":"Personal","description":"friend/family/personal correspondence","visible":false},
    {"key":"other","label":"Other","description":"does not fit any category above","visible":false}
  ]'::jsonb,
  $classify$You classify an email for a RECRUITER's business-development inbox.
Return ONLY a JSON object: { "category": "...", "score": 0.NN, "reason": "...", "extracted": { ... } }.
Allowed categories:
- company_hiring  = signal that a company is hiring or scaling a team (press, job posts, funding, expansion)
- inbound_lead    = a company / prospect reaches out about recruiting or staffing services
- newsletter      = job board digest, marketing newsletter
- spam            = unsolicited bulk, scam, fraudulent
- personal        = friend/family/personal correspondence
- other           = does not fit the above

score = your confidence in [0, 1].$classify$,
  $summary$You produce a one-sentence summary of an email for a recruiter's business-development inbox.
Constraints:
- One sentence, max 25 words.
- Lead with the most actionable detail (company, hiring signal, who to contact).
- Plain text, no markdown, no quoting.
$summary$,
  '{
    "type":"object",
    "properties":{
      "company":{"type":"string","description":"the company name"},
      "domain":{"type":"string","description":"the company''s web domain when derivable"},
      "signalSource":{"type":"string","description":"what surfaced the signal (funding announcement, job post, referral, inbound form)"}
    }
  }'::jsonb,
  'recruiter_bizdev',
  '0.500',
  1
)
ON CONFLICT (id) DO NOTHING;

-- ── Recruiter — Intake ───────────────────────────────────────────────────────
INSERT INTO inbox_profiles (
  id, owner_id, roles, name, description, is_preset, preset_key,
  taxonomy, classify_prompt, summary_prompt, extract_schema,
  default_rule_set, min_relevance_score, version
) VALUES (
  '10b0c0de-0000-4000-a000-000000000004',
  NULL,
  '["recruiter"]'::jsonb,
  'Recruiter — Intake',
  'For req intake: surfaces intake notes from hiring managers and pulls the role / must-haves / comp / JD reference so a tailored JD can be drafted.',
  true,
  'recruiter_intake',
  '[
    {"key":"intake_notes","label":"Intake notes","description":"a hiring manager describes a role they need filled — requirements, comp, must-haves","visible":true},
    {"key":"newsletter","label":"Newsletter","description":"job-board digest, marketing newsletter","visible":false},
    {"key":"spam","label":"Spam","description":"unsolicited bulk, scam, fraudulent","visible":false},
    {"key":"personal","label":"Personal","description":"friend/family/personal correspondence","visible":false},
    {"key":"other","label":"Other","description":"does not fit any category above","visible":false}
  ]'::jsonb,
  $classify$You classify an email for a RECRUITER's requisition-intake inbox.
Return ONLY a JSON object: { "category": "...", "score": 0.NN, "reason": "...", "extracted": { ... } }.
Allowed categories:
- intake_notes  = a hiring manager describes a role they need filled — requirements, comp, must-haves, JD references
- newsletter    = job board digest, marketing newsletter
- spam          = unsolicited bulk, scam, fraudulent
- personal      = friend/family/personal correspondence
- other         = does not fit the above

score = your confidence in [0, 1].$classify$,
  $summary$You produce a one-sentence summary of a requisition-intake email for a recruiter.
Constraints:
- One sentence, max 25 words.
- Lead with the role and the single most important requirement.
- Plain text, no markdown, no quoting.
$summary$,
  '{
    "type":"object",
    "properties":{
      "role":{"type":"string","description":"the role / job title to fill"},
      "mustHaves":{"type":"array","items":{"type":"string"},"description":"non-negotiable requirements"},
      "comp":{"type":"string","description":"compensation range or budget when stated"},
      "jdRef":{"type":"string","description":"link or reference to an existing JD when present"}
    }
  }'::jsonb,
  'recruiter_intake',
  '0.500',
  1
)
ON CONFLICT (id) DO NOTHING;

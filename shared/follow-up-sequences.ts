/**
 * follow-up-sequences.ts — vocabulary for the ONE sequence engine
 * (`follow_up_sequences` / `follow_up_steps` / `follow_up_enrollments` /
 * `follow_up_logs`, migration 0636).
 *
 * `kind` separates the two products that share the engine:
 *   - nurture            — /api/followups drips to an email recipient
 *   - recruiter_outreach — /api/recruiter/sequences cadences to a
 *                          talent-pool candidate (was recruiter_outreach_*)
 *
 * The DB CHECK on follow_up_sequences.kind is built from this list.
 */
export const FOLLOW_UP_SEQUENCE_KINDS = ["nurture", "recruiter_outreach"] as const;
export type FollowUpSequenceKind = (typeof FOLLOW_UP_SEQUENCE_KINDS)[number];

/** Step delivery channels the engine accepts (sms/message have no live
 *  transport yet — they advance the enrollment without delivery). */
export const FOLLOW_UP_STEP_CHANNELS = ["email", "message", "sms"] as const;
export type FollowUpStepChannel = (typeof FOLLOW_UP_STEP_CHANNELS)[number];

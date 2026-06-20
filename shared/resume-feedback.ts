/**
 * Resume feedback & career coaching — single source of truth for the review
 * aggregate's enums, anchor model, suggested-edit shape, and the request /
 * response contracts shared by the API (`routes/resume-feedback.ts`,
 * `services/resume-feedback/`) and the frontend studio annotation layer.
 *
 * ── The model ────────────────────────────────────────────────────────────────
 * A `ResumeReview` is one feedback engagement on ONE resume between an owner
 * and a reviewer. Two entry points, one engine:
 *   • self_share — the owner shares their resume with anyone (a peer / mentor)
 *     by user id or email + an unguessable `shareToken` link.
 *   • coaching   — a paid Career Coach (Creator `coaching` program) engagement
 *     auto-provisions the SAME review bound to the shared resume.
 *
 * Feedback is layered:
 *   • Annotations — sticky notes (positioned on the canvas), highlights
 *     (anchored to a content target + quoted text), and general comments /
 *     replies. These live in their OWN table, never in the resume's
 *     `DocumentState` — so feedback never prints and never pollutes the
 *     owner's design layers. Each annotation may carry an inline
 *     `suggestedEdit` the owner accepts per-item.
 *   • Proposed draft — the reviewer can submit a full edited copy as a
 *     `resume_versions` row flagged `proposalStatus = 'proposed'`; the owner
 *     accepts (applies it to `resume_information.content`) or rejects it.
 *
 * Anchoring is by stable section-item `id` (the `ResumeSectionMeta.referenceId`
 * convention), never array index, so an annotation survives section reordering.
 */

import { z } from "zod";

// ── Review aggregate enums ───────────────────────────────────────────────────

/** Where the review came from. `coaching` rows additionally carry
 *  `coachingInquiryId`. */
export const REVIEW_SOURCES = ["self_share", "coaching"] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

/**
 * Review lifecycle:
 *   pending   → invite issued, reviewer has not opened it yet
 *   active    → reviewer has opened it and is annotating
 *   submitted → reviewer handed feedback (annotations + optional proposal) back
 *   completed → owner closed it after accepting / dismissing feedback
 *   cancelled → owner (or coach) cancelled before completion
 */
export const REVIEW_STATUSES = [
  "pending",
  "active",
  "submitted",
  "completed",
  "cancelled",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// ── Annotation enums ─────────────────────────────────────────────────────────

export const ANNOTATION_KINDS = ["sticky_note", "highlight", "comment"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

/**
 * Annotation lifecycle:
 *   open      → outstanding feedback
 *   accepted  → owner accepted it (and applied its `suggestedEdit`, if any)
 *   dismissed → owner dismissed it without acting
 *   resolved  → addressed / closed in the thread (either party)
 */
export const ANNOTATION_STATUSES = ["open", "accepted", "dismissed", "resolved"] as const;
export type AnnotationStatus = (typeof ANNOTATION_STATUSES)[number];

/** Suggested default sticky-note / highlight swatches. Stored loosely as a
 *  hex string so a custom colour is allowed; this is the palette the UI seeds. */
export const FEEDBACK_COLORS = [
  "#fde68a", // amber
  "#bfdbfe", // blue
  "#bbf7d0", // green
  "#fecaca", // red
  "#e9d5ff", // purple
] as const;

// ── Proposed-draft status (rides on resume_versions) ─────────────────────────

export const PROPOSAL_STATUSES = ["proposed", "accepted", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

// ── Annotation anchor (discriminated union, persisted as jsonb) ───────────────

/** Sticky note: a free position on a document page, in the same 0..1 fraction
 *  convention as `WidgetPosition` so the canvas drag/zoom math is shared. */
export const CanvasAnchorSchema = z.object({
  type: z.literal("canvas"),
  /** `DocumentPage.id` the note is pinned to. */
  pageId: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type CanvasAnchor = z.infer<typeof CanvasAnchorSchema>;

/** Highlight: attached to a content target. Resolves against the resume's
 *  content by `sectionKey` + stable item `referenceId` + an optional
 *  `fieldPath` ("summary", "highlights[2]"). `quote` is the anchor of last
 *  resort when the field moved. */
export const ContentAnchorSchema = z.object({
  type: z.literal("content"),
  sectionKey: z.string(),
  referenceId: z.string().optional(),
  itemType: z.string().optional(),
  fieldPath: z.string().optional(),
  quote: z.string().optional(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
});
export type ContentAnchor = z.infer<typeof ContentAnchorSchema>;

/** General comment about the whole resume (or a threaded reply). */
export const GeneralAnchorSchema = z.object({ type: z.literal("general") });
export type GeneralAnchor = z.infer<typeof GeneralAnchorSchema>;

export const AnnotationAnchorSchema = z.discriminatedUnion("type", [
  CanvasAnchorSchema,
  ContentAnchorSchema,
  GeneralAnchorSchema,
]);
export type AnnotationAnchor = z.infer<typeof AnnotationAnchorSchema>;

// ── Suggested edit (the per-annotation inline change) ─────────────────────────

/**
 * A concrete content change the reviewer proposes for one field. Applied to
 * `resume_information.content` when the owner accepts the annotation:
 *   • `sectionKey === "basics"` → set `fieldPath` on the basics object.
 *   • otherwise                 → find `content[sectionKey][i]` by `id ===
 *     referenceId` and set `fieldPath` on it.
 * `fieldPath` supports dotted + bracketed paths ("summary", "highlights[1]").
 */
export const SuggestedEditSchema = z.object({
  sectionKey: z.string(),
  referenceId: z.string().optional(),
  fieldPath: z.string(),
  /** Optional original value, for diff display. Not used to apply. */
  before: z.string().optional(),
  after: z.string(),
});
export type SuggestedEdit = z.infer<typeof SuggestedEditSchema>;

// ── Request contracts ─────────────────────────────────────────────────────────

export const CreateReviewInputSchema = z
  .object({
    resumeId: z.string().uuid(),
    /** Invite an existing platform user directly. */
    reviewerUserId: z.string().uuid().optional(),
    /** Invite by email (link-claim flow); ignored if `reviewerUserId` set. */
    reviewerEmail: z.string().email().optional(),
    source: z.enum(REVIEW_SOURCES).default("self_share"),
    /** Set when `source === "coaching"` to bind the paid engagement. */
    coachingInquiryId: z.string().uuid().optional(),
    title: z.string().trim().max(160).optional(),
    message: z.string().trim().max(4000).optional(),
    /** Link/invite TTL. Omit for no expiry. */
    expiresInDays: z.number().int().positive().max(365).optional(),
  })
  .strict();
export type CreateReviewInput = z.infer<typeof CreateReviewInputSchema>;

export const CreateAnnotationInputSchema = z
  .object({
    kind: z.enum(ANNOTATION_KINDS),
    body: z.string().trim().min(1).max(8000),
    color: z.string().trim().max(16).optional(),
    anchor: AnnotationAnchorSchema,
    suggestedEdit: SuggestedEditSchema.optional(),
    parentAnnotationId: z.string().uuid().optional(),
  })
  .strict();
export type CreateAnnotationInput = z.infer<typeof CreateAnnotationInputSchema>;

export const UpdateAnnotationInputSchema = z
  .object({
    body: z.string().trim().min(1).max(8000).optional(),
    color: z.string().trim().max(16).optional(),
    status: z.enum(ANNOTATION_STATUSES).optional(),
  })
  .strict();
export type UpdateAnnotationInput = z.infer<typeof UpdateAnnotationInputSchema>;

export const SubmitReviewInputSchema = z
  .object({ message: z.string().trim().max(4000).optional() })
  .strict();
export type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>;

/** Reviewer submits a full edited copy as a proposed draft revision. The
 *  payload is the resume content; the API validates it as `ResumeContent`. */
export const ProposeDraftInputSchema = z
  .object({
    resumeData: z.unknown(),
    label: z.string().trim().max(120).optional(),
    message: z.string().trim().max(4000).optional(),
  })
  .strict();
export type ProposeDraftInput = z.infer<typeof ProposeDraftInputSchema>;

// ── Response DTOs ─────────────────────────────────────────────────────────────

export interface ResumeReviewDTO {
  id: string;
  resumeId: string;
  ownerId: string;
  reviewerId: string | null;
  reviewerEmail: string | null;
  source: ReviewSource;
  coachingInquiryId: string | null;
  title: string | null;
  status: ReviewStatus;
  message: string | null;
  /** Present only on the create/owner-detail response so the owner can copy
   *  the share link. Never returned on reviewer-facing reads. */
  shareToken?: string;
  expiresAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Hydrated counts for list rendering. */
  openAnnotationCount?: number;
  totalAnnotationCount?: number;
}

export interface ResumeReviewAnnotationDTO {
  id: string;
  reviewId: string;
  authorId: string | null;
  kind: AnnotationKind;
  body: string;
  color: string | null;
  status: AnnotationStatus;
  pageId: string | null;
  anchor: AnnotationAnchor;
  suggestedEdit: SuggestedEdit | null;
  parentAnnotationId: string | null;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposedDraftDTO {
  versionId: string;
  reviewId: string | null;
  proposedByUserId: string;
  label: string | null;
  proposalStatus: ProposalStatus;
  createdAt: string;
}

/** Whether the caller is the resume owner or the invited reviewer. The studio
 *  review surface gates owner-only actions (accept / dismiss / complete) on
 *  this. */
export type ReviewRole = "owner" | "reviewer";

/**
 * Full review payload returned by `GET /reviews/:id` (owner) and
 * `GET /link/:token` (reviewer). The single contract the API emits and the
 * frontend studio annotation layer consumes — kept here so neither side can
 * redefine the shape and drift. `resume.content` is the opaque `ResumeContent`
 * blob (the renderer narrows it); `shareToken` rides on `review` only for the
 * owner so they can copy the invite link.
 */
export interface ResumeReviewDetailDTO {
  role: ReviewRole;
  review: ResumeReviewDTO;
  resume: { id: string; title: string; content: unknown };
  annotations: ResumeReviewAnnotationDTO[];
  proposals: ProposedDraftDTO[];
}

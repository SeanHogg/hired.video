/**
 * Subject Descriptors for the polymorphic review system.
 *
 * Every reviewable thing (company, promo_project, service, voice_clone,
 * …) registers a descriptor here. The descriptor declares:
 *
 *   - which sub-rating axes the form collects (averaged separately)
 *   - which metadata fields the form collects (free-form, per-type)
 *   - which body sections the form collects (pros/cons/advice/body)
 *   - eligibility (any | buyer_only | owner_blocked)
 *   - verification rule (email-domain match, was-a-buyer, …)
 *   - where to deep-link back to the subject in the UI
 *   - copy for the form / CTA / aggregate header
 *
 * Adding a new reviewable type is a single descriptor entry plus
 * (usually) a backfill migration if data already exists. The schema
 * does not change. The frontend renders forms / cards / aggregates
 * straight off the descriptor — no per-type components.
 *
 * Lives in `shared/` so the API (validation) and the frontend (form
 * rendering) read the same source of truth.
 */

import { publicArticleByIdPath, publicCompanyPath } from "../public-paths.js";

export type SubjectType =
  | "company"
  | "promo_project"
  | "service"
  | "voice_clone"
  | "article"
  | "resume_template"
  | "video_template"
  | "course"
  | "certification";

export type Eligibility = "any" | "buyer_only" | "owner_blocked";

export type VerificationMethod =
  | "none"
  | "email_domain" // reviewer's verified email domain matches subject's website domain
  | "was_buyer"; // reviewer has a completed purchase / project for this subject

export interface SubRatingAxis {
  /** Stored under sub_ratings[key] in the DB. */
  key: string;
  label: string;
  /** Description shown under the axis in the form (optional). */
  hint?: string;
}

export type MetadataFieldType = "text" | "multiline" | "select";

export interface MetadataField {
  /** Stored under metadata[key] in the DB. */
  key: string;
  label: string;
  type: MetadataFieldType;
  maxLength?: number;
  /** select only */
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
}

export type BodySectionKey = "body" | "pros" | "cons" | "advice";

export interface BodySection {
  key: BodySectionKey;
  label: string;
  placeholder?: string;
  /** Optional per-section character cap; default 4000. */
  maxLength?: number;
}

export interface SubjectDescriptor {
  type: SubjectType;
  /** Singular noun, e.g. "company", "voice clone". */
  noun: string;

  /** Heading for the form ("Review {subjectName}"). */
  formTitle: (subjectName: string) => string;
  /** Empty-state copy on the public listing. */
  emptyState: (subjectName: string) => string;
  /** Label for the public-page CTA when pro is allowed. */
  writeCta: string;
  /** Header above the aggregate block, e.g. "Reviews" or "Customer reviews". */
  sectionTitle: string;

  /** Optional sub-rating axes. May be empty (overall-only types). */
  subRatings: SubRatingAxis[];

  /** Optional structured metadata captured by the form. */
  metadataFields: MetadataField[];

  /** Body sections the form renders (one or more). */
  bodySections: BodySection[];

  /** Whether anyone authenticated may review, only buyers, etc. */
  eligibility: Eligibility;

  /**
   * How the reviewer's "verified" badge is computed at write time.
   * `none` = no verified status ever shown.
   */
  verification: VerificationMethod;

  /**
   * Whether reviews of this subject type get the *Pro* gate. For
   * marketplace transactional reviews (promo_project / service /
   * voice_clone) the eligibility itself ("you bought it") is the gate
   * and we don't want to charge buyers extra to leave feedback.
   */
  requiresProToWrite: boolean;

  /** Build a deep-link path to the subject (used by the feed card + OG). */
  subjectPath: (subjectId: string) => string;
}

// ---------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------

export const COMPANY_DESCRIPTOR: SubjectDescriptor = {
  type: "company",
  noun: "company",
  formTitle: (name) => `Review ${name}`,
  emptyState: (name) =>
    `No reviews yet. Be the first to share what it's like to work at ${name}.`,
  writeCta: "Write a review",
  sectionTitle: "Reviews",
  subRatings: [
    { key: "culture", label: "Culture" },
    { key: "leadership", label: "Leadership" },
    { key: "workLifeBalance", label: "Work-Life Balance" },
    { key: "compensation", label: "Compensation" },
    { key: "careerGrowth", label: "Career Growth" },
    { key: "diversity", label: "Diversity & Inclusion" },
  ],
  metadataFields: [
    {
      key: "employmentStatus",
      label: "Employment status",
      type: "select",
      options: [
        { value: "current", label: "Current employee" },
        { value: "former", label: "Former employee" },
      ],
    },
    { key: "jobTitle", label: "Job title", type: "text", maxLength: 120, placeholder: "e.g. Senior Engineer" },
    { key: "locationLabel", label: "Location", type: "text", maxLength: 120, placeholder: "e.g. Remote / NYC" },
  ],
  bodySections: [
    { key: "pros", label: "Pros", placeholder: "What's working well?" },
    { key: "cons", label: "Cons", placeholder: "What could be better?" },
    { key: "advice", label: "Advice to leadership", placeholder: "What would you change?" },
  ],
  eligibility: "owner_blocked",
  verification: "email_domain",
  requiresProToWrite: true,
  subjectPath: (id) => publicCompanyPath(id),
};

export const PROMO_PROJECT_DESCRIPTOR: SubjectDescriptor = {
  type: "promo_project",
  noun: "creator",
  formTitle: (name) => `Review your project with ${name}`,
  emptyState: () => "No reviews yet for this project.",
  writeCta: "Leave a review",
  sectionTitle: "Customer reviews",
  subRatings: [
    { key: "communication", label: "Communication" },
    { key: "quality", label: "Quality" },
    { key: "timeliness", label: "Timeliness" },
  ],
  metadataFields: [],
  bodySections: [
    { key: "body", label: "Your feedback", placeholder: "How did the project go?" },
  ],
  eligibility: "buyer_only",
  verification: "was_buyer",
  requiresProToWrite: false,
  subjectPath: (id) => `/projects/${id}`,
};

export const SERVICE_DESCRIPTOR: SubjectDescriptor = {
  type: "service",
  noun: "service",
  formTitle: (name) => `Review ${name}`,
  emptyState: (name) => `No reviews yet for ${name}.`,
  writeCta: "Write a review",
  sectionTitle: "Customer reviews",
  subRatings: [
    { key: "value", label: "Value for money" },
    { key: "quality", label: "Quality" },
    { key: "responsiveness", label: "Responsiveness" },
  ],
  metadataFields: [],
  bodySections: [
    { key: "body", label: "Your review", placeholder: "How was the service?" },
  ],
  eligibility: "buyer_only",
  verification: "was_buyer",
  requiresProToWrite: false,
  subjectPath: (id) => `/services/${id}`,
};

export const VOICE_CLONE_DESCRIPTOR: SubjectDescriptor = {
  type: "voice_clone",
  noun: "voice clone",
  formTitle: (name) => `Review the "${name}" voice`,
  emptyState: (name) => `No reviews yet for "${name}".`,
  writeCta: "Write a review",
  sectionTitle: "Reviews",
  subRatings: [
    { key: "naturalness", label: "Naturalness" },
    { key: "expressiveness", label: "Expressiveness" },
    { key: "value", label: "Value" },
  ],
  metadataFields: [
    {
      key: "useCase",
      label: "What did you use it for?",
      type: "text",
      maxLength: 120,
      placeholder: "e.g. Demo videos, audiobook narration",
    },
  ],
  bodySections: [
    { key: "body", label: "Your review", placeholder: "How did the voice perform?" },
  ],
  eligibility: "buyer_only",
  verification: "was_buyer",
  requiresProToWrite: false,
  subjectPath: (id) => `/marketplace/voices/${id}`,
};

export const ARTICLE_DESCRIPTOR: SubjectDescriptor = {
  type: "article",
  noun: "article",
  formTitle: (name) => `Review "${name}"`,
  emptyState: () => "No reviews yet. Be the first to share what you thought.",
  writeCta: "Write a review",
  sectionTitle: "Reader reviews",
  subRatings: [
    { key: "clarity", label: "Clarity" },
    { key: "depth", label: "Depth" },
    { key: "usefulness", label: "Usefulness" },
  ],
  metadataFields: [],
  bodySections: [
    { key: "body", label: "Your review", placeholder: "What did you learn? What did you wish was different?" },
  ],
  // Any authenticated reader can review — engagement-based content needs
  // broad rating coverage to feed the Partner Program adoption signal (#180).
  eligibility: "owner_blocked",
  verification: "none",
  requiresProToWrite: false,
  // The article id resolves to its public page (author + slug).
  subjectPath: (id) => publicArticleByIdPath(id),
};

export const RESUME_TEMPLATE_DESCRIPTOR: SubjectDescriptor = {
  type: "resume_template",
  noun: "resume template",
  formTitle: (name) => `Review the "${name}" template`,
  emptyState: (name) => `No reviews yet for "${name}".`,
  writeCta: "Write a review",
  sectionTitle: "Reviews",
  subRatings: [
    { key: "design", label: "Design" },
    { key: "atsFriendliness", label: "ATS friendliness" },
    { key: "value", label: "Value" },
  ],
  metadataFields: [
    { key: "industry", label: "Industry you used it for", type: "text", maxLength: 80, placeholder: "e.g. Finance, Healthcare" },
  ],
  bodySections: [
    { key: "body", label: "Your review", placeholder: "How did this template work for your application?" },
  ],
  eligibility: "buyer_only",
  verification: "was_buyer",
  requiresProToWrite: false,
  // A studio template (résumé or video alike) — the one template detail
  // page resolves it by id or slug. The old /marketplace/templates/<kind>/:id
  // paths redirect there (App.tsx).
  subjectPath: (id) => `/marketplace/templates/${id}`,
};

export const VIDEO_TEMPLATE_DESCRIPTOR: SubjectDescriptor = {
  type: "video_template",
  noun: "video template",
  formTitle: (name) => `Review the "${name}" video template`,
  emptyState: (name) => `No reviews yet for "${name}".`,
  writeCta: "Write a review",
  sectionTitle: "Reviews",
  subRatings: [
    { key: "creativity", label: "Creativity" },
    { key: "easeOfUse", label: "Ease of use" },
    { key: "value", label: "Value" },
  ],
  metadataFields: [
    { key: "useCase", label: "What did you use it for?", type: "text", maxLength: 120, placeholder: "e.g. Personal brand reel, recruiter outreach" },
  ],
  bodySections: [
    { key: "body", label: "Your review", placeholder: "How well did the template adapt to your project?" },
  ],
  eligibility: "buyer_only",
  verification: "was_buyer",
  requiresProToWrite: false,
  // A studio template (résumé or video alike) — the one template detail
  // page resolves it by id or slug. The old /marketplace/templates/<kind>/:id
  // paths redirect there (App.tsx).
  subjectPath: (id) => `/marketplace/templates/${id}`,
};

export const COURSE_DESCRIPTOR: SubjectDescriptor = {
  type: "course",
  noun: "course",
  formTitle: (name) => `Review "${name}"`,
  emptyState: (name) => `No reviews yet for "${name}".`,
  writeCta: "Write a review",
  sectionTitle: "Student reviews",
  subRatings: [
    { key: "content", label: "Content quality" },
    { key: "instructor", label: "Instructor" },
    { key: "value", label: "Value" },
  ],
  metadataFields: [
    { key: "completionStatus", label: "How far did you get?", type: "select", options: [
      { value: "previewed", label: "Previewed only" },
      { value: "in_progress", label: "In progress" },
      { value: "completed", label: "Completed" },
    ] },
  ],
  bodySections: [
    { key: "body", label: "Your review", placeholder: "What worked, what would you change?" },
  ],
  eligibility: "buyer_only",
  verification: "was_buyer",
  requiresProToWrite: false,
  subjectPath: (id) => `/marketplace/courses/${id}`,
};

export const CERTIFICATION_DESCRIPTOR: SubjectDescriptor = {
  type: "certification",
  noun: "certification",
  formTitle: (name) => `Review the "${name}" certification`,
  emptyState: (name) => `No reviews yet for "${name}".`,
  writeCta: "Write a review",
  sectionTitle: "Holder reviews",
  subRatings: [
    { key: "rigor", label: "Rigor" },
    { key: "relevance", label: "Relevance to my work" },
    { key: "recognition", label: "Industry recognition" },
  ],
  metadataFields: [],
  bodySections: [
    { key: "body", label: "Your review", placeholder: "Has this certification helped you professionally?" },
  ],
  eligibility: "buyer_only",
  verification: "was_buyer",
  requiresProToWrite: false,
  subjectPath: (id) => `/verify/${id}`,
};

const REGISTRY: Record<SubjectType, SubjectDescriptor> = {
  company: COMPANY_DESCRIPTOR,
  promo_project: PROMO_PROJECT_DESCRIPTOR,
  service: SERVICE_DESCRIPTOR,
  voice_clone: VOICE_CLONE_DESCRIPTOR,
  article: ARTICLE_DESCRIPTOR,
  resume_template: RESUME_TEMPLATE_DESCRIPTOR,
  video_template: VIDEO_TEMPLATE_DESCRIPTOR,
  course: COURSE_DESCRIPTOR,
  certification: CERTIFICATION_DESCRIPTOR,
};

export const ALL_SUBJECT_TYPES: SubjectType[] = Object.keys(REGISTRY) as SubjectType[];

export function getSubjectDescriptor(type: SubjectType): SubjectDescriptor {
  const d = REGISTRY[type];
  if (!d) throw new Error(`Unknown review subject type: ${type}`);
  return d;
}

export function isSubjectType(value: unknown): value is SubjectType {
  return typeof value === "string" && value in REGISTRY;
}

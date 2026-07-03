/**
 * Public types for the Hired.Video partner SDK. These mirror the server's
 * shared/partner.ts SSoT. They are re-declared here (not imported) because a
 * published package must not depend on the app's internal source tree; keep
 * the two in sync when scopes change.
 */

/** Scopes a partner API key may hold. */
export type PartnerScope =
  | "write:job_seekers"
  | "write:resumes"
  | "read:profile"
  | "write:connections"
  | "read:connections";

export type PartnerConnectionSource = "partner_created" | "connected";
export type PartnerConnectionStatus = "pending" | "active" | "revoked";
export type PartnerEmbedKind = "profile" | "resume";
export type PartnerEmbedTheme = "auto" | "light" | "dark";

/** Whether the job seeker's résumé is populated yet (drives your "résumé
 *  pending" vs "ready" UI). */
export type PartnerResumeStatus = "ready" | "parsing" | "none";

/**
 * Machine-readable `HiredApiError.code` values. Branch on these instead of
 * message strings. `ALREADY_EXISTS` is safe to treat as success.
 */
export type HiredErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "FORBIDDEN_SCOPE"
  | "NOT_FOUND"
  | "EMAIL_EXISTS"
  | "ALREADY_EXISTS"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INVALID_RESUME";

export interface PartnerInfo {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  status: string;
  createdAt: string;
}

/** JSON Resume-style content (canonical lowercase keys). Kept loose so partners
 *  can pass any valid resume document; the server heals + validates on write. */
export type ResumeContent = Record<string, unknown>;

export interface CreateJobSeekerInput {
  email: string;
  name: string;
  /** Optional — omit to let the job seeker set their own password via the
   *  returned `claimUrl`. */
  password?: string;
  /** Your platform's own id for this user, so you can reconcile later. */
  externalUserId?: string;
  /** Optionally create a first resume in the same call. */
  resume?: UploadResumeInput;
}

export interface CreateJobSeekerResult {
  userId: string;
  connectionId: string;
  status: PartnerConnectionStatus;
  /** One-time link the job seeker opens to claim/log into the account. */
  claimUrl: string;
  resumeId: string | null;
  /** True when this `externalUserId` was already provisioned — the call was an
   *  idempotent no-op (find-or-create), not a fresh account. */
  alreadyExisted: boolean;
  /** Present when the account was created but the attached résumé could not be
   *  ingested (e.g. a binary `file`); the account is still usable — retry via
   *  `uploadResume`. */
  resumeError?: { code: HiredErrorCode; message: string };
}

/**
 * A résumé file to upload. The SDK base64-encodes `Blob`/`File`/`ArrayBuffer`/
 * `Uint8Array` for you; you may also pass a base64 string directly.
 *
 * NOTE: server-side parsing currently supports **text/JSON** only
 * (`text/plain`, `application/json`). Binary PDF/DOC/DOCX are rejected with
 * `UNSUPPORTED_MEDIA_TYPE` — extract their text client-side first and pass it
 * as `rawText`. Max decoded size: 256 KB.
 */
export type ResumeFileSource = string | ArrayBuffer | Uint8Array | Blob;

export interface UploadResumeInput {
  title?: string;
  /** Structured JSON Resume content (preferred). */
  content?: ResumeContent;
  /** Raw resume text (used when `content` is absent). */
  rawText?: string;
  /** Original résumé file (see {@link ResumeFileSource}). Used when neither
   *  `content` nor `rawText` is given. */
  file?: ResumeFileSource;
  /** File name (helps the server pick a parser; optional). */
  filename?: string;
  /** MIME type of `file`. Binary types are rejected — send `rawText` instead. */
  contentType?: string;
  privacy?: "public" | "unlisted" | "private";
}

/** Result of `jobSeekers.getByExternalUserId` — the reconciliation mapping. */
export interface JobSeekerRef {
  userId: string;
  connectionId: string;
  externalUserId: string | null;
  status: PartnerConnectionStatus;
  source: PartnerConnectionSource;
}

export interface ConnectInput {
  /** Email of the EXISTING Hired.Video account to connect. */
  email: string;
  externalUserId?: string;
  /** Where to return the job seeker after they approve/deny consent. */
  redirectUrl?: string;
}

export interface ConnectResult {
  userId: string;
  connectionId: string;
  status: PartnerConnectionStatus;
  /** Hosted consent screen — send the job seeker here to approve. */
  consentUrl: string;
}

export interface PartnerConnection {
  id: string;
  partnerId: string;
  userId: string;
  externalUserId: string | null;
  source: PartnerConnectionSource;
  status: PartnerConnectionStatus;
  scopes: string[];
  consentAgreedAt: string | null;
  createdAt: string;
}

export interface ExperienceItem {
  company: string;
  position: string;
  startDate: string | null;
  endDate: string | null;
  summary: string | null;
  highlights: string[];
}

export interface EducationItem {
  institution: string;
  area: string | null;
  studyType: string | null;
  startDate: string | null;
  endDate: string | null;
}

/** Flat, typed extract from the active résumé — use this for skill-prefill and
 *  display instead of parsing the raw JSON Resume yourself. */
export interface ProfileSummary {
  skills: string[];
  headline: string | null;
  summary: string | null;
  location: string | null;
  experience: ExperienceItem[];
  education: EducationItem[];
}

export interface ProfilePayload {
  user: {
    id: string;
    name: string;
    email: string | null;
    handle: string | null;
    headline: string | null;
    location: string | null;
    avatarUrl: string | null;
    videoPitchUrl: string | null;
  };
  /** Documented, stable extract for prefill/display. */
  profile: ProfileSummary;
  /** Whether the résumé is populated (`ready`), pending, or absent (`none`). */
  resumeStatus: PartnerResumeStatus;
  /** ISO timestamp of the latest résumé/profile change. Use as a poll cursor
   *  (also returned as the `ETag` header for `If-None-Match` 304s). */
  updatedAt: string | null;
  /** Raw JSON Resume document of the active résumé (null if none). */
  resume: Record<string, unknown> | null;
}

export interface CreateEmbedTokenInput {
  userId: string;
  kind?: PartnerEmbedKind;
  /** Color theme for the embedded viewer. Defaults to `auto`. */
  theme?: PartnerEmbedTheme;
  /** BCP-47 locale for the embedded viewer (e.g. `"en"`, `"fr-CA"`). */
  locale?: string;
}

export interface EmbedToken {
  token: string;
  kind: PartnerEmbedKind;
  theme: PartnerEmbedTheme | null;
  locale: string | null;
  /** The resume the embed renders (the connected user's active/master resume),
   *  or null if they have none yet. */
  resumeId: string | null;
  /** Ready-to-iframe URL (canonical resume embed page with the token attached).
   *  Null when the user has no resume to embed. */
  embedUrl: string | null;
  expiresAt: string;
}

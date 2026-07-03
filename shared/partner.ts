/**
 * Partner platform SSoT (shared between the API and the `@hiredvideo/sdk`
 * npm package). Scope names, connection states, and the embed-kind union
 * live here so the SDK and the server can never drift.
 */

/** Every scope a partner API key may be granted. */
export const PARTNER_SCOPES = [
  "write:job_seekers", // create Hired.Video accounts
  "write:resumes", // upload/create resumes into a connected account
  "read:profile", // read a connected user's live profile + resume
  "write:connections", // initiate a connect-existing-account consent flow
  "read:connections", // list the partner's connections
] as const;

export type PartnerScope = (typeof PARTNER_SCOPES)[number];

/** Sensible default grant for a new partner key. */
export const DEFAULT_PARTNER_SCOPES: PartnerScope[] = [
  "write:job_seekers",
  "write:resumes",
  "read:profile",
  "write:connections",
  "read:connections",
];

/** How a connection came to exist. */
export type PartnerConnectionSource = "partner_created" | "connected";

/** Lifecycle of a connection. */
export type PartnerConnectionStatus = "pending" | "active" | "revoked";

/** What an embed token renders. */
export const PARTNER_EMBED_KINDS = ["profile", "resume"] as const;
export type PartnerEmbedKind = (typeof PARTNER_EMBED_KINDS)[number];

/** Prefix for partner system-to-system keys — distinct from user `hvk_` keys. */
export const PARTNER_KEY_PREFIX = "hvpk_";

/** Embed token lifetime (seconds). Short-lived: the partner mints one per
 *  page render server-side and hands it to the browser. */
export const PARTNER_EMBED_TOKEN_TTL_SECONDS = 15 * 60;

/** Embed theme options — forwarded to the embed page as `?theme=`. `auto`
 *  follows the iframe's `prefers-color-scheme`. */
export const PARTNER_EMBED_THEMES = ["auto", "light", "dark"] as const;
export type PartnerEmbedTheme = (typeof PARTNER_EMBED_THEMES)[number];

/**
 * Résumé-status signal returned on the partner profile payload so a partner
 * knows whether the embed/skills are populated yet.
 *   - `ready`    → an active/master résumé exists and is rendered.
 *   - `parsing`  → a résumé write is in flight / awaiting extraction (binary
 *                  upload accepted but not yet turned into content).
 *   - `none`     → the job seeker has no résumé yet.
 */
export const PARTNER_RESUME_STATUSES = ["ready", "parsing", "none"] as const;
export type PartnerResumeStatus = (typeof PARTNER_RESUME_STATUSES)[number];

/** Accepted MIME types for a partner résumé `file` upload. Text/JSON is parsed
 *  in-Worker (no AI); PDF/DOCX byte-extraction is a roadmap item — until then
 *  partners send extracted `rawText` or structured `content`. */
export const PARTNER_RESUME_UPLOAD_MIME_TYPES = [
  "text/plain",
  "application/json",
  "application/vnd.hired.jsonresume+json",
] as const;

/** Max decoded size of a partner résumé `file` upload (bytes). Matches the
 *  60k-char rawText ceiling with headroom for base64/UTF-8 overhead. */
export const PARTNER_RESUME_UPLOAD_MAX_BYTES = 256 * 1024;

/**
 * Machine-readable error codes the partner API returns in the envelope
 * `error.code`. Published so SDK consumers can branch (e.g. treat
 * `ALREADY_EXISTS` as success). SSoT for the server + the SDK's HiredErrorCode.
 */
export const PARTNER_ERROR_CODES = [
  "VALIDATION_ERROR", // 400 — body failed schema validation
  "UNAUTHORIZED", // 401 — missing/invalid partner key
  "FORBIDDEN", // 403 — no active connection for this user
  "FORBIDDEN_SCOPE", // 403 — key lacks the scope this method needs
  "NOT_FOUND", // 404 — partner/user/connection/profile not found
  "EMAIL_EXISTS", // 409 — email already has an account; use connect()
  "ALREADY_EXISTS", // 200/409 — idempotent hit: this externalUserId is already provisioned
  "UNSUPPORTED_MEDIA_TYPE", // 415 — binary file format not yet parseable server-side
  "PAYLOAD_TOO_LARGE", // 413 — file exceeds PARTNER_RESUME_UPLOAD_MAX_BYTES
  "RATE_LIMITED", // 429 — reserved; no per-key limit enforced yet
  "INVALID_RESUME", // 422 — file decoded but no usable résumé content
] as const;
export type PartnerErrorCode = (typeof PARTNER_ERROR_CODES)[number];

/** Which scope each partner SDK method requires — SSoT for docs + tests. */
export const PARTNER_METHOD_SCOPES = {
  "jobSeekers.create": "write:job_seekers",
  "jobSeekers.uploadResume": "write:resumes",
  "jobSeekers.getProfile": "read:profile",
  "jobSeekers.getByExternalUserId": "read:connections",
  createEmbedToken: "read:profile",
  connect: "write:connections",
  "connections.list": "read:connections",
  "connections.revoke": "write:connections",
} as const satisfies Record<string, PartnerScope>;

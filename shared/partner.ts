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

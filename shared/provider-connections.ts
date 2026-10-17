/**
 * Provider connections — the SSoT vocabularies for `provider_connections`
 * (W3-C, migration 0600): every third-party credential the platform holds,
 * whatever it is for (OAuth sign-in, calendar sync, ATS import, LMS export,
 * paid media, social publishing, connected inboxes, YouTube, workforce
 * accounting connectors, pasted vendor API keys).
 *
 * The CHECK constraints on the table are generated from these arrays
 * (api/src/db/schema/providerConnections.ts), so the backend and any client
 * that renders a connection can never drift.
 */

/** Who owns the connection:
 *   - user      — one person (owner_id = users.id, company_id NULL)
 *   - workspace — a member acting inside a company workspace
 *                 (owner_id = company id, user_id = the member)
 *   - company   — the company itself (owner_id = company id, no member)
 *   - platform  — hired.video's own accounts (owner_id NULL) */
export const PROVIDER_CONNECTION_OWNER_KINDS = ["user", "company", "workspace", "platform"] as const;
export type ProviderConnectionOwnerKind = (typeof PROVIDER_CONNECTION_OWNER_KINDS)[number];

/** What the connection is used for (the lane). */
export const PROVIDER_CONNECTION_PURPOSES = [
  "login",          // OAuth sign-in identity (was oauth_accounts)
  "calendar",       // calendar sync (was calendar_connections)
  "ats",            // ATS candidate import + webhooks (was ats_connections)
  "lms",            // course export to an external LMS (was lms_connectors)
  "ads",            // paid-media ad platforms (was paid_media_connections)
  "social_publish", // a user's own social account, Lane B (was social_connections)
  "managed_social", // hired.video's brand account, Lane A (was managed_accounts)
  "email_inbox",    // connected Gmail / Outlook mailbox (was external_email_accounts)
  "youtube",        // YouTube channel publishing (was youtube_accounts)
  "workforce",      // accounting / e-sign / Slack connectors (was company_integrations)
  "api_key",        // pasted vendor credential (was tenant_integrations)
] as const;
export type ProviderConnectionPurpose = (typeof PROVIDER_CONNECTION_PURPOSES)[number];

/** One status vocabulary for every connection. A user-paused connection
 *  stays `active` with `enabled = false`. */
export const PROVIDER_CONNECTION_STATUSES = ["active", "expired", "revoked", "error"] as const;
export type ProviderConnectionStatus = (typeof PROVIDER_CONNECTION_STATUSES)[number];

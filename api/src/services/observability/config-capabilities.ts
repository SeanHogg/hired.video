/**
 * Config capability manifest — which secrets each production capability
 * needs, as DATA. `evaluateCapabilities()` reports, per capability, whether
 * it is ready and which names are missing. Values are never read beyond a
 * presence check and never logged.
 *
 * This is what lets a log query settle "are the secrets there?" (the
 * question behind gap #2306) instead of a roadmap row going stale. Only list
 * names the API actually reads — a name nothing reads is noise, not a gap.
 * A nested array means "any one of these".
 */
import { getEnv } from "../../utils/env.js";

type Requirement = string | readonly string[];

export interface CapabilitySpec {
  capability: string;
  requires: readonly Requirement[];
}

export const CONFIG_CAPABILITIES: readonly CapabilitySpec[] = [
  { capability: "db", requires: [["DATABASE_URL", "NEON_DATABASE_URL", "NEON_DB_URL"]] },
  { capability: "auth.sessions", requires: ["JWT_SECRET"] },
  { capability: "auth.captcha", requires: ["TURNSTILE_SECRET_KEY"] },
  { capability: "oauth.google", requires: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] },
  { capability: "oauth.linkedin", requires: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"] },
  { capability: "oauth.github", requires: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] },
  { capability: "oauth.microsoft", requires: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"] },
  { capability: "oauth.callbacks", requires: ["API_URL"] },
  { capability: "payments.helcim", requires: ["HELCIM_API_TOKEN", "HELCIM_WEBHOOK_TOKEN"] },
  { capability: "payments.stripe", requires: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SIGNING_KEY"] },
  { capability: "email.transactional", requires: ["EMAIL_CLIENTID", "EMAIL_SECRET"] },
  { capability: "email.external-mailbox", requires: ["EXTERNAL_EMAIL_TOKEN_KEY"] },
  { capability: "llm.gateway", requires: ["BUILDERFORCE_API_KEY"] },
  { capability: "ai.transcription", requires: ["OPENAI_API_KEY"] },
  { capability: "maps.geocoding", requires: [["MAPBOX_TOKEN", "MAPBOX_ACCESS_TOKEN"]] },
  { capability: "media.stock", requires: ["UNSPLASH_ACCESS_KEY", "PEXELS_API_KEY", "PIXABAY_API_KEY"] },
  { capability: "social.encryption", requires: [["SOCIAL_KMS_KEY", "PAID_MEDIA_KMS_KEY"]] },
  { capability: "social.meta", requires: ["META_APP_ID", "META_APP_SECRET"] },
  { capability: "social.x", requires: ["X_CLIENT_ID", "X_CLIENT_SECRET"] },
  { capability: "social.tiktok", requires: ["TIKTOK_CONTENT_CLIENT_KEY", "TIKTOK_CONTENT_CLIENT_SECRET"] },
  { capability: "payouts.tremendous", requires: ["TREMENDOUS_API_KEY"] },
];

export interface CapabilityStatus {
  ready: boolean;
  missing: string[];
}

export type CapabilityReport = Record<string, CapabilityStatus>;

const isSet = (name: string, read: (name: string) => string): boolean => read(name).trim().length > 0;

export function evaluateCapabilities(
  specs: readonly CapabilitySpec[] = CONFIG_CAPABILITIES,
  read: (name: string) => string = getEnv,
): CapabilityReport {
  const report: CapabilityReport = {};
  for (const { capability, requires } of specs) {
    const missing: string[] = [];
    for (const req of requires) {
      const names = typeof req === "string" ? [req] : req;
      if (!names.some((n) => isSet(n, read))) missing.push(names.join("|"));
    }
    report[capability] = { ready: missing.length === 0, missing };
  }
  return report;
}

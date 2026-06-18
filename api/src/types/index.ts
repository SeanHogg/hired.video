import { captureCallerSource } from "../handlers/shared.js";

// ── Cloudflare Worker Bindings ───────────────────────────────────────────────
export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;
  // Builderforce gateway — single transport for every LLM call. The
  // gateway proxies to OpenRouter / Cerebras / Ollama / Anthropic /
  // OpenAI internally; we route by sending vendor-prefixed model
  // strings (`openrouter/...`, `cerebras/...`, `ollama/...`). Per the
  // SDK 0.4.0 contract, model is a hint not a hard pin — the gateway
  // may substitute on cooldown / outage. Substitution is surfaced via
  // `_builderforce.resolvedModel` on the response.
  BUILDERFORCE_API_KEY?: string;
  // Optional gateway URL override; defaults to https://api.builderforce.ai.
  // Lets SA point at a staging gateway without redeploying.
  BUILDERFORCE_GATEWAY_URL?: string;
  YOUTUBE_CLIENT_ID?: string;
  YOUTUBE_CLIENT_SECRET?: string;
  YOUTUBE_REFRESH_TOKEN?: string;
  VIDEO_BUCKET: R2Bucket;
  // Edge cache binding consumed by utils/edge-cache.ts. Optional because
  // local dev / preview deploys may run without a KV namespace attached;
  // helpers fall through to the in-memory tier when this is missing.
  KV_CACHE?: KVNamespace;
  AI?: { run: (model: string, inputs: Record<string, unknown>) => Promise<unknown> };
  // Cloudflare Vectorize index for semantic help search (#2004). Optional:
  // when the binding (+ Workers AI above) is absent, help search degrades
  // to the keyword ILIKE path. Neon is intentionally NOT used for vectors
  // (storage capped) — vectors live in Vectorize, embeddings come from AI.
  VECTORIZE?: VectorizeIndex;
  // YouTube company OAuth
  YOUTUBE_COMPANY_CLIENT_ID?: string;
  YOUTUBE_COMPANY_CLIENT_SECRET?: string;
  // Payment provider selection (defaults to "stripe")
  PAYMENT_PROVIDER?: string;
  // Stripe
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SIGNING_KEY?: string;
  // Helcim (alternative provider)
  HELCIM_ACCOUNT_ID?: string;
  HELCIM_API_TOKEN?: string;
  HELCIM_WEBHOOK_TOKEN?: string;
  // LinkedIn OAuth (video publishing)
  LINKEDIN_CLIENT_ID?: string;
  LINKEDIN_CLIENT_SECRET?: string;
  // Whisper / transcription
  OPENAI_API_KEY?: string;
  // Stock media providers (gap #128 — content-addressed, deduplicated cache)
  UNSPLASH_ACCESS_KEY?: string;
  PEXELS_API_KEY?: string;
  PIXABAY_API_KEY?: string;
  // Google AdSense
  ADSENSE_PUBLISHER_ID?: string;        // ca-pub-XXXXXXXXXXXXXXXX
  AD_SLOT_DASHBOARD_BANNER?: string;
  AD_SLOT_DASHBOARD_SIDEBAR?: string;
  AD_SLOT_JOBS_BANNER?: string;
  AD_SLOT_JOBS_SIDEBAR?: string;
  AD_SLOT_PEOPLE_BANNER?: string;
  AD_SLOT_PROFILE_SIDEBAR?: string;
  AD_SLOT_RESUME_BANNER?: string;
  // ─── Paid Media (external ad-platform integration) ──────────────────────
  // Meta Marketing API + Conversions API
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  // Google Ads (OAuth client may be shared with YouTube; developer token
  // separate, requires Google Ads Standard Access).
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  // TikTok For Business — Marketing API.
  TIKTOK_APP_ID?: string;
  TIKTOK_APP_SECRET?: string;
  // Microsoft Advertising (Bing) — REST API + developer token.
  MICROSOFT_ADS_CLIENT_ID?: string;
  MICROSOFT_ADS_CLIENT_SECRET?: string;
  MICROSOFT_ADS_DEVELOPER_TOKEN?: string;
  // Envelope encryption key for paid_media credential columns. AES-GCM
  // via HKDF-SHA-256 derivation. See services/paid-media/secrets.ts.
  PAID_MEDIA_KMS_KEY?: string;
  // Base URL of the API (used to build OAuth redirect URIs).
  BASE_URL?: string;
  // House workspace user id (#986). A reserved, real hired.video user
  // (users.is_system = true) that owns the platform's OWN paid-media ad
  // connections used for internal growth marketing. The /superadmin/ads
  // page binds this subject via a delegated workspace_grants row so a
  // SuperAdmin acts ON BEHALF OF the house account instead of falling
  // through to their PERSONAL ad connections. Seeded idempotently by
  // api/scripts/seedHouseWorkspace.mjs. No new workspace kind is
  // introduced — the existing `delegated` kind + canActFor() SSoT is reused.
  HOUSE_USER_ID?: string;
  // ─── Social publishing connection layer (PRD §5.0) ──────────────────────
  // Layer-1 developer-app credentials, one pair per platform. YouTube +
  // LinkedIn + Meta reuse the keys declared above. TikTok's *organic*
  // Content Posting API uses a DISTINCT app from the ads TIKTOK_APP_ID above
  // (open.tiktokapis.com, not business-api) — hence its own keys.
  TIKTOK_CONTENT_CLIENT_KEY?: string;
  TIKTOK_CONTENT_CLIENT_SECRET?: string;
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  // Envelope-encryption key for social_connections / managed_accounts token
  // columns. Falls back to PAID_MEDIA_KMS_KEY when unset (services/social/secrets.ts).
  SOCIAL_KMS_KEY?: string;
  // Absolute API origin used to build social OAuth redirect URIs.
  API_URL?: string;
}

// ── Hono context variables ───────────────────────────────────────────────────
import type { Context } from "hono";

export interface Variables {
  user: JwtPayload;
}

export type AppEnv = { Bindings: Env; Variables: Variables };

export type AppContext = Context<AppEnv>;

// ── JWT payload ──────────────────────────────────────────────────────────────
export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  emailVerified: boolean;
  mustChangePassword: boolean;
  companyId?: string;
  isSuperAdmin?: boolean;
  // Session id — points at sessions.id. Tokens issued before migration
  // 0060 lack this claim; the auth middleware accepts them as legacy
  // until they expire naturally (≤ 7 days).
  sid?: string;
  // Emulation claims (present only on impersonation tokens)
  emu?: boolean;         // true = this is an impersonation token
  emuBy?: string;        // superadmin userId
  emuSid?: string;       // impersonation session id
  emuReadonly?: boolean; // true = block all mutating verbs
  jti?: string;          // token id (for revocation lookup)
  iat?: number;
  exp?: number;
}

// ── Pagination ───────────────────────────────────────────────────────────────
export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

// ── API response helpers ─────────────────────────────────────────────────────
// Canonical envelope for every /api route. Includes an ISO `timestamp` so
// callers can drop their local `ok()` helpers and import `success` instead.
// The frontend's `ApiResponseSchema` in shared/api.ts already treats
// `timestamp` as optional, so adding it here is backward-compatible for
// every call site that previously used the no-timestamp shape.
export function success<T>(data: T): { success: true; data: T; timestamp: string };
export function success<T>(data: T, message: string): { success: true; data: T; message: string; timestamp: string };
export function success<T>(data: T, meta: PaginationMeta): { success: true; data: T; meta: PaginationMeta; timestamp: string };
export function success<T>(data: T, messageOrMeta?: string | PaginationMeta) {
  const timestamp = new Date().toISOString();
  if (typeof messageOrMeta === "string") {
    return { success: true as const, data, message: messageOrMeta, timestamp };
  }
  if (messageOrMeta) {
    return { success: true as const, data, meta: messageOrMeta, timestamp };
  }
  return { success: true as const, data, timestamp };
}

export function apiError(code: string, message: string, details?: unknown) {
  // Every error response carries a `_source: { file, line, function }`
  // pointer — when a user pastes the JSON envelope into a chat or
  // devtools, the source location tells you which line produced it
  // without grep-spelunking. The errorSourceFilter middleware strips it
  // for non-SuperAdmin viewers.
  const _source = captureCallerSource(1);
  return {
    success: false as const,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(_source ? { _source } : {}),
    },
    timestamp: new Date().toISOString(),
  };
}

// Legacy export for common error response shape
export const error = apiError;

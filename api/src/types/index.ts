// ── Cloudflare Worker Bindings ───────────────────────────────────────────────
export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;
  OPENROUTER_API_KEY?: string;
  YOUTUBE_CLIENT_ID?: string;
  YOUTUBE_CLIENT_SECRET?: string;
  YOUTUBE_REFRESH_TOKEN?: string;
  VIDEO_BUCKET: R2Bucket;
  AI?: { run: (model: string, inputs: Record<string, unknown>) => Promise<unknown> };
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
  // ElevenLabs (TTS + voice cloning)
  ELEVENLABS_API_KEY?: string;
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
export function success<T>(data: T): { success: true; data: T };
export function success<T>(data: T, message: string): { success: true; data: T; message: string };
export function success<T>(data: T, meta: PaginationMeta): { success: true; data: T; meta: PaginationMeta };
export function success<T>(data: T, messageOrMeta?: string | PaginationMeta) {
  if (typeof messageOrMeta === "string") {
    return { success: true as const, data, message: messageOrMeta };
  }
  if (messageOrMeta) {
    return { success: true as const, data, meta: messageOrMeta };
  }
  return { success: true as const, data };
}

export function apiError(code: string, message: string, details?: unknown) {
  return { success: false as const, error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

// Legacy export for common error response shape
export const error = apiError;

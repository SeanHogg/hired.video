/**
 * ApiDeps — the canonical Dependency Injection bundle for every
 * service. One source of truth for "what can a service call out to."
 *
 *   Routes  → buildApiDeps(env)  → pass into service
 *   Tests   → buildMockApiDeps() → pass a mock Partial<ApiDeps>
 *   Services depend on ApiDeps (or a Pick<ApiDeps, …> slice) — never
 *   on `getDb()`, `process.env`, or adapter constructors directly.
 *
 * This enforces:
 *   • DIP (Dependency Inversion) — services depend on interfaces, not
 *     on concrete DB clients or third-party SDKs.
 *   • DRY — one place constructs all the plumbing; every service takes
 *     the same shape.
 *   • ISP — services declare the slice they actually use:
 *       `type JobDeps = Pick<ApiDeps, "repos" | "llm" | "now">`
 *     so tests only mock what the function touches.
 *   • SRP — ApiDeps is the SINGLE concern of "how do I reach
 *     infrastructure." Services stay pure of wiring.
 *
 * Adding a new adapter:
 *   1. Export its port interface from `services/adapters/<name>.ts`.
 *   2. Add to `ApiDeps` below.
 *   3. Wire in `buildApiDeps`.
 */

import type { Repos } from "../repositories/index.js";
import { buildRepos } from "../repositories/index.js";
import { getDb } from "../db/index.js";

// ─── Adapter ports ────────────────────────────────────────────────────────────
// Lightweight interfaces for the third-party integrations services call.
// Actual implementations live in `services/adapters/` and implement these ports.

export interface LLMUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMPort {
  /** Send a completion request and return the text body + token usage. */
  call(opts: {
    systemPrompt: string;
    userMessage: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: "json_object" | "text";
  }): Promise<{ text: string; usage: LLMUsage | null }>;
  /** Return the provider's API key from env, or null if unavailable. */
  getApiKey(): string | null;
}

export interface EmailPort {
  sendVerification(to: string, name: string, token: string): Promise<void>;
  sendPasswordReset(to: string, name: string, token: string): Promise<void>;
  /** 2FA code email. `expiryMinutes` defaults to 10 per the adapter. */
  sendTwoFactor(to: string, name: string, code: string, expiryMinutes?: number): Promise<void>;
  sendConnectionRequest(
    to: string,
    name: string,
    fromName: string,
    senderProfileId: string,
    requestMessage?: string | null,
  ): Promise<void>;
}

export interface StripePort {
  createCustomer(email: string, name?: string): Promise<{ id: string }>;
  createCheckoutSession(opts: Record<string, unknown>): Promise<{ url: string }>;
  retrieveSubscription(id: string): Promise<unknown>;
  // Additional Stripe ops get added here as services need them.
}

export interface SignalWirePort {
  sendSms(to: string, body: string): Promise<void>;
  placeCall(to: string, from: string): Promise<{ callSid: string }>;
}

export interface TranscriptionPort {
  transcribe(audioUrl: string, language?: string): Promise<{ text: string; durationSec: number }>;
}

/** Audit sink — every state-changing admin / system operation writes one.
 *  Fire-and-forget by contract: implementations MUST swallow errors so a
 *  failed audit write never blocks the originating operation. */
export interface AuditPort {
  log(entry: {
    actorId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    impersonationSessionId?: string;
  }): Promise<void>;
}

// ─── The canonical Deps bundle ──────────────────────────────────────────────

/** Every service accepts this (or a `Pick<>` slice). Route wiring builds one
 *  per request and threads it through; tests construct a partial mock. */
export interface ApiDeps {
  repos: Repos;
  /** Always-injected clock so tests can freeze time. */
  now: () => Date;
  /** Deterministic randomness for tokens, ids, etc. Prod uses crypto.randomUUID. */
  randomHex: (bytes: number) => string;
  /** Structured env snapshot. Never read process.env / c.env directly from a service. */
  env: Readonly<Record<string, string | undefined>>;
  // Adapters — all behind ports so tests mock just the methods they exercise.
  llm: LLMPort;
  email: EmailPort;
  stripe: StripePort | null;
  signalwire: SignalWirePort | null;
  transcription: TranscriptionPort | null;
  /** Audit log — every state-changing admin/system op writes here. */
  audit: AuditPort;
}

// ─── Production wiring ───────────────────────────────────────────────────────

/** Build the real `ApiDeps` for a request. Takes the Cloudflare Worker env
 *  bag so the adapter ports can read their secrets. Adapters are constructed
 *  lazily via thin wrappers around the existing adapter modules so no
 *  third-party code runs at module-load time. */
export function buildApiDeps(env: Record<string, string | undefined> = {}): ApiDeps {
  return {
    repos: buildRepos(getDb()),
    now: () => new Date(),
    randomHex: (bytes) =>
      Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    env: Object.freeze({ ...env }),
    llm: buildLlmPort(env),
    email: buildEmailPort(env),
    stripe: null,         // wired lazily by services that need Stripe (checkout)
    signalwire: null,     // wired lazily by phone-using services
    transcription: null,  // wired lazily by the transcription route
    audit: buildAuditPort(),
  };
}

function buildAuditPort(): AuditPort {
  return {
    async log(entry) {
      const { auditLog } = await import("../utils/audit.js");
      await auditLog(entry as any);
    },
  };
}

// ─── Default deps singleton (for services that want a zero-arg fallback) ───
//
// A cached singleton so services can default-initialise their Deps without
// rebuilding the repo bundle on every call. Tests that need to substitute
// a mock should either (a) pass Deps explicitly, or (b) call
// `__setDefaultApiDepsForTests()` before running the unit.
let _defaultDeps: ApiDeps | null = null;

export function defaultApiDeps(env?: Record<string, string | undefined>): ApiDeps {
  if (!_defaultDeps) _defaultDeps = buildApiDeps(env ?? {});
  return _defaultDeps;
}

export function __setDefaultApiDepsForTests(deps: ApiDeps | null): void {
  _defaultDeps = deps;
}

// ─── Adapter-port factories ─────────────────────────────────────────────────
// These wrap the existing loose-function adapters in `services/adapters/*`
// with the port interface shape, so services depend only on the interface.

function buildLlmPort(env: Record<string, string | undefined>): LLMPort {
  return {
    async call(opts) {
      const { callLLM } = await import("./adapters/ai.js");
      const apiKey = env.OPENROUTER_API_KEY;
      if (!apiKey) return { text: "", usage: null };
      const text = await callLLM(apiKey, opts);
      // The concrete adapter returns the raw string only; usage data is
      // captured by a parallel import path that tracks tokens elsewhere.
      // Services that need exact usage should use the ai-call adapter
      // directly via a specialized port.
      return { text, usage: null };
    },
    getApiKey() {
      return env.OPENROUTER_API_KEY ?? null;
    },
  };
}

function buildEmailPort(env: Record<string, string | undefined>): EmailPort {
  return {
    async sendVerification(to, name, token) {
      const { sendVerificationEmail } = await import("./adapters/email.js");
      await sendVerificationEmail(to, name, token);
      void env;
    },
    async sendPasswordReset(to, name, token) {
      const { sendPasswordResetEmail } = await import("./adapters/email.js");
      await sendPasswordResetEmail(to, name, token);
    },
    async sendTwoFactor(to, name, code, expiryMinutes) {
      const { sendTwoFactorEmail } = await import("./adapters/email.js");
      await sendTwoFactorEmail(to, name, code, expiryMinutes);
    },
    async sendConnectionRequest(to, name, fromName, senderProfileId, requestMessage) {
      const { sendConnectionRequestEmail } = await import("./adapters/email.js");
      await sendConnectionRequestEmail(to, name, fromName, senderProfileId, requestMessage);
    },
  };
}

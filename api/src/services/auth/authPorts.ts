// Auth ports — the abstractions the auth use cases depend on (see the
// AuthService.ts header for the DI rationale).

// ---------------------------------------------------------------------------
// Ports — the abstractions handlers depend on. Each is a minimal surface
// (Interface Segregation) so tests don't have to mock more than they use.
// ---------------------------------------------------------------------------

export interface EmailerPort {
  sendVerification(to: string, name: string, token: string): Promise<void>;
  sendResendVerification(to: string, name: string, token: string): Promise<void>;
  sendPasswordReset(to: string, name: string, token: string): Promise<void>;
  sendTwoFactor(to: string, name: string, code: string, approveToken?: string): Promise<void>;
  sendMagicLink(to: string, name: string, token: string): Promise<void>;
}

/** The db port is Drizzle's inferred shape. We widen to `any` at the
 *  edge because the query chain types aren't round-trip stable across
 *  Drizzle minor versions — the tests assert on the stub's recorded
 *  calls, not on the chain types. */
export type DbPort = any;

export interface OnboardingPort {
  seedTasks(userId: string, role: string): Promise<void>;
  triggerDrip(userId: string, email: string, name: string, role: string): Promise<void>;
}

/** Captcha verification port. Concrete impl is Cloudflare Turnstile in
 *  production; tests pass a stub. The no-op variant (used when no secret
 *  is configured) reports `enforced=false` so the handler skips the
 *  check entirely — keeps local dev frictionless. */
export interface CaptchaPort {
  /** True iff a token must be supplied + verified for this environment. */
  enforced: boolean;
  /** Verify a token. Implementations should treat null/empty as failure
   *  unless `enforced` is false (handler short-circuits before calling). */
  verify(token: string | null, clientIp: string | null): Promise<boolean>;
}

export interface AuthDeps {
  db: DbPort;
  email: EmailerPort;
  onboarding: OnboardingPort;
  captcha: CaptchaPort;
  jwtSecret: string;
  /** Injected so tests can freeze time (token expiry checks). */
  now: () => Date;
  /** Injected so tests can produce predictable tokens. Returns a hex string. */
  randomHex: (bytes: number) => string;
  /** If true (dev), include the plaintext verification/reset token in
   *  the response for easier local testing. */
  isDev: boolean;
  /** Caller IP for abuse / captcha attribution. Null when the request
   *  arrives without recognised proxy headers. */
  clientIp: string | null;
  /** User-Agent string from the request, for spam attribution +
   *  login-event telemetry. Null when not provided. */
  userAgent: string | null;
  /** ISO-3166-1 alpha-2 from cf-ipcountry (if available). Used by the
   *  geo-gate, sanctions check, and risk scoring. */
  ipCountry: string | null;
  /** True when the caller presented a valid trusted-device signal.
   *  Phase 3 wires this from a HMAC-signed cookie. Drives adaptive MFA. */
  trustedDevicePresent: boolean;
  /** Optional injection points for the network-dependent signup
   *  gates. Tests pass no-op ports to skip MX + HIBP without faking
   *  DoH / HIBP transports. Production omits these and the composer
   *  uses the real implementations. */
  mxCheck?: import("./signupGuard.js").MxCheckPort;
  breachCheck?: import("./signupGuard.js").BreachCheckPort;
}

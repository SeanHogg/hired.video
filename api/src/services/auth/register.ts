// handleRegister — password signup use case (signup gates, user row,
// verification token, onboarding side effects, referral attribution).

import { eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { RegisterSchema } from "./schemas.js";
import { hashPassword } from "./password.js";
import { validateSignupRequest } from "./signupGuard.js";
import { checkEmailRateLimit } from "./emailRateLimit.js";
import { recordReferralAttribution } from "./attribution.js";
import { createAffiliateProfileForUser } from "./affiliate.js";
import { getDefaultProfileSections } from "../../../../shared/profile-sections.js";
import { isLocale, type Locale } from "../../../../shared/i18n.js";
import { logger } from "../../lib/logger.js";
import { DomainError } from "../../domains/errors.js";
import type { AuthDeps } from "./authPorts.js";
import { recordLoginEvent } from "./loginEvents.js";

const { users, userProfiles, accountPreferences, emailVerificationTokens } = schema;

// ═══════════════════════════════════════════════════════════════════════════
// handleRegister
// ═══════════════════════════════════════════════════════════════════════════

export async function handleRegister(deps: AuthDeps, body: unknown) {
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request body", { issues: parsed.error.flatten() });
  }

  const { email, password, role, enableAffiliate } = parsed.data;
  const referralCodeInput = (parsed.data as { referralCode?: string }).referralCode?.trim() || null;
  // Pre-auth UI locale forwarded from the signup form. Validated against
  // the shared whitelist so non-PUBLIC values silently drop to null —
  // matches the existing settings sanitizer posture (the visitor lands
  // on the default "en" instead of getting a 400).
  const requestedLocale = (parsed.data as { language?: string }).language?.trim() || null;
  const localePref: Locale | null = requestedLocale && isLocale(requestedLocale) && requestedLocale !== "w"
    ? requestedLocale
    : null;
  const attribution = {
    utmSource:       (parsed.data as { utmSource?: string }).utmSource       || null,
    utmMedium:       (parsed.data as { utmMedium?: string }).utmMedium       || null,
    utmCampaign:     (parsed.data as { utmCampaign?: string }).utmCampaign   || null,
    utmTerm:         (parsed.data as { utmTerm?: string }).utmTerm           || null,
    utmContent:      (parsed.data as { utmContent?: string }).utmContent     || null,
    landingReferrer: (parsed.data as { landingReferrer?: string }).landingReferrer || null,
  };
  const name = parsed.data.name
    || [parsed.data.firstName, parsed.data.lastName].filter(Boolean).join(" ")
    || email;

  // Per-email rate limit — closes the IP-rotation gap that the
  // existing per-IP limiter leaves open. Same fn used by login,
  // forgot-password, and magic-link.
  if (
    await checkEmailRateLimit(deps.db, email, "register", {
      countryCode: deps.ipCountry,
      ipAddress: deps.clientIp,
    })
  ) {
    throw new DomainError(429, "RATE_LIMIT", "Too many signup attempts for this email. Try again later.");
  }

  // Single composer for every signup gate (OFAC → geo → honeypot →
  // disposable → captcha → MX → breach). Each block writes its own
  // bot_block_events row; we just convert the result into an HTTP
  // failure shape.
  const guard = await validateSignupRequest(
    {
      db: deps.db,
      captcha: deps.captcha,
      endpoint: "register",
      mxCheck: deps.mxCheck,
      breachCheck: deps.breachCheck,
    },
    {
      email,
      password,
      honeypot: (parsed.data as { website?: string | null }).website ?? null,
      cfTurnstileToken: parsed.data.cfTurnstileToken ?? null,
      countryCode: deps.ipCountry,
      ipAddress: deps.clientIp,
    },
  );
  if (!guard.ok) {
    await recordLoginEvent(deps, {
      userId: null,
      email,
      kind: "register",
      provider: "password",
      success: false,
      failureReason: guard.reason ?? "signup_blocked",
    });
    const status = guard.reason === "OFAC_BLOCKED"
      ? 403
      : guard.reason === "GEO_BLOCKED"
      ? 403
      : 400;
    throw new DomainError(status, guard.reason ?? "SIGNUP_BLOCKED", guard.message ?? "Signup blocked");
  }
  // Soft signals fired during validation (today: TURNSTILE_FAIL on
  // missing/invalid token — #1122). The signup still proceeds, but we
  // log the signal on the register event so postmortems can correlate
  // the bot_block_events row to a specific account creation. Email
  // verification is required (line below) — bots without inbox access
  // never activate the account.
  if (guard.softSignals && guard.softSignals.length > 0) {
    await recordLoginEvent(deps, {
      userId: null,
      email,
      kind: "register",
      provider: "password",
      success: true,
      failureReason: `soft:${guard.softSignals.join(",")}`,
    });
  }

  const existing = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    await recordLoginEvent(deps, {
      userId: existing[0]?.id ?? null,
      email,
      kind: "register",
      provider: "password",
      success: false,
      failureReason: "email_exists",
    });
    throw new DomainError(409, "CONFLICT", "An account with this email already exists");
  }

  const passwordHash = await hashPassword(password);
  const [user] = await deps.db
    .insert(users)
    .values({
      email,
      name,
      passwordHash,
      role,
      // Creator signups land in channel-mode immediately so their /people
      // profile renders as a channel rather than a résumé from day one
      // (resolveProfileMode honours the explicit setting over auto-flip).
      // Every other role keeps the `auto` default.
      ...(role === "creator" ? { profileMode: "channel" } : {}),
      // Pin the signup network attribution to the user row so spam
      // investigation works without scanning request_logs.
      signupIp: deps.clientIp,
      signupUserAgent: deps.userAgent,
      // Inbound campaign attribution snapshot — first-touch values
      // forwarded by the signup form (#1195). Nullable: organic signups
      // arrive with `null` across the board, which is the correct read
      // for downstream LTV-by-campaign queries.
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      utmTerm: attribution.utmTerm,
      utmContent: attribution.utmContent,
      landingReferrer: attribution.landingReferrer,
    } as any)
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

  if (!user) {
    throw new DomainError(500, "INTERNAL_SERVER_ERROR", "Failed to create user");
  }

  await recordLoginEvent(deps, {
    userId: user.id,
    email: user.email,
    kind: "register",
    provider: "password",
    success: true,
  });

  const verificationToken = deps.randomHex(32);
  const expiresAt = new Date(deps.now().getTime() + 24 * 60 * 60 * 1000);
  await deps.db.insert(emailVerificationTokens).values({
    userId: user.id,
    token: verificationToken,
    expiresAt,
  });

  // Side effects — errors are logged but never fail the request. The
  // caller (Hono route) wraps these in c.executionCtx.waitUntil(). Tests
  // assert they were called with the expected args.
  try {
    await deps.email.sendVerification(user.email, user.name, verificationToken);
  } catch (err) {
    logger.error("[register] Failed to send verification email", err);
  }
  // Seed a user_profiles row with role-based section visibility defaults
  // so /people/[id] hides resume sections for recruiters/employers from
  // the moment they sign up. Existing accounts (no profile row, or row
  // with `{}`) get the same defaults via the resolver fall-through, so
  // there's no backfill to write. Per-key overrides ship later through
  // PUT /api/users/me { profileSections: ... }.
  try {
    await deps.db
      .insert(userProfiles)
      .values({
        userId: user.id,
        profileSections: getDefaultProfileSections(user.role ?? "job_seeker"),
      } as any)
      .onConflictDoNothing({ target: userProfiles.userId });
  } catch (err) {
    logger.error("[register] Failed to seed profile section defaults", err);
  }
  // Seed account_preferences.language with the visitor's pre-auth pick
  // so LocaleSync resolves to their chosen locale on the very first
  // authed render. Skipped when the form didn't forward a valid Locale
  // (organic flows, OAuth, anything pre-#1408 client) — those keep the
  // DB default "en" via the settings handler's fall-through.
  if (localePref) {
    try {
      await deps.db
        .insert(accountPreferences)
        .values({ userId: user.id, language: localePref } as any)
        .onConflictDoUpdate({
          target: accountPreferences.userId,
          set: { language: localePref },
        });
    } catch (err) {
      logger.error("[register] Failed to seed account preferences language", err);
    }
  }
  try {
    await deps.onboarding.seedTasks(user.id, user.role ?? "job_seeker");
  } catch (err) {
    logger.error("[register] Failed to seed onboarding tasks", err);
  }
  try {
    await deps.onboarding.triggerDrip(user.id, user.email, user.name, user.role ?? "job_seeker");
  } catch (err) {
    logger.error("[register] Failed to trigger onboarding drip", err);
  }

  if (enableAffiliate) {
    try {
      await createAffiliateProfileForUser(deps.db as any, {
        userId: user.id,
        name,
        randomHex: deps.randomHex, // deterministic in tests
      });
    } catch (err) {
      logger.error("[register] Failed to create affiliate profile", err);
    }
  }

  // Inbound referral attribution (#1194). If the visitor arrived via an
  // affiliate's `?ref=CODE` link, the frontend forwards that code here.
  // Shared with the OAuth callback (gap #1683) via recordReferralAttribution,
  // which also owns the self-referral guards (gap #1684).
  await recordReferralAttribution(
    {
      referralCode: referralCodeInput,
      userId: user.id,
      ipAddress: deps.clientIp,
      userAgent: deps.userAgent,
    },
    deps.db,
  );

  // The route answers 201 Created.
  return {
    requiresEmailVerification: true,
    email: user.email,
    sentAt: deps.now().toISOString(),
    ...(deps.isDev ? { verificationToken } : {}),
  };
}

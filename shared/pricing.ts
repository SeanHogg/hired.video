// Shared pricing/constants. Single source of truth for plan prices,
// token allowances, and pack SKUs — imported by both the frontend
// (Pricing.tsx, cart-context.tsx, AITokenPill) and the API
// (tierEnforcement, billing service).

// ── Plan prices ─────────────────────────────────────────────────────────────
// Pro = $1.99/mo (job-seeker focus, 2026-10-03): ONE offer — no watermark,
// unlimited social posting, and an AI agent that keeps posting for you — plus
// a monthly AI-token allowance (PRO_AI_MONTHLY_TOKENS). Heavy users buy top-up packs instead of
// overflowing the subscription. Workforce / creator SEATS stay at
// SEAT_PRICE_CENTS ($9.95) and are deliberately decoupled from this price.
export const PRO_MONTHLY_PRICE = 1.99;
/** Fractional discount applied to annual (yearly) billing vs paying 12× the
 *  monthly price. SSoT for the "20% off" claim across pricing copy, the
 *  subscribe route, and PRO_YEARLY_PRICE. */
export const ANNUAL_DISCOUNT_RATE = 0.2;
/** Canonical yearly price for any monthly price: 12 months at the annual
 *  discount, rounded to cents. Every "what's the yearly price?" path should
 *  call this instead of re-deriving the factor (e.g. the old `monthly × 10`
 *  fallback in routes/billing.ts that silently meant only ~16.7% off, not the
 *  advertised 20%). */
export function yearlyPriceFromMonthly(monthly: number): number {
  return +(monthly * 12 * (1 - ANNUAL_DISCOUNT_RATE)).toFixed(2);
}
/** 20% annual discount: 1.99 × 12 × 0.8 = 19.10 */
export const PRO_YEARLY_PRICE = yearlyPriceFromMonthly(PRO_MONTHLY_PRICE);

/** Canonical per-seat monthly price in cents. Every workforce seat / creator
 *  seat is $9.95 (see project_pricing_seats). Single source of truth for the
 *  workforce seat-billing reconciliation AND the seat soft-cap confirm prompt
 *  (#1678) — replaces the stale 4900¢ default + the private 995 const that
 *  used to live in services/workforce/index.ts. */
export const SEAT_PRICE_CENTS = 995;

// ── Token allowances (true token metering, not request counts) ──────────────
/** Free tier: monthly token allowance from the platform-paid LLM budget. */
export const FREE_AI_MONTHLY_TOKENS = 50_000;
/** Pro tier: monthly token allowance included in the Pro subscription.
 *  Heavy users buy top-up packs (TOKEN_PACKS) once they exceed this.
 *
 *  Sized so a $1.99 Pro user stays profitable even if every token runs on
 *  the most expensive model we route to (Claude Opus 5.5, ~$8.80/M blended
 *  at 70/30 input/output — see shared/ai-model-rates.ts):
 *    150K × $8.80/M = $1.32 cost + ~$0.36 card fee < $1.99 revenue.
 *  Real traffic mixes in Sonnet 5.5 and $0 free-pool models, so the typical
 *  margin is well above that worst case. Was 1M until 2026-10-08, which lost
 *  ~$7 per Pro user at the cap once the core job-seeker tools moved to Opus. */
export const PRO_AI_MONTHLY_TOKENS = 150_000;

/** Workforce: monthly tokens each paid company SEAT ($9.95, SEAT_PRICE_CENTS)
 *  adds to the employer's shared pool. Decoupled from the $1.99 Pro allowance
 *  on 2026-10-08 so resizing Pro didn't silently shrink employer pools. */
export const WORKFORCE_SEAT_AI_MONTHLY_TOKENS = 1_000_000;

/** Minimum tokens a caller must have left to START an AI call. The gate checks
 *  before the call and the ledger debits the real count after, so a user with
 *  a handful of tokens left could otherwise launch a full Opus résumé tailor
 *  and run thousands of tokens into deficit. This bounds that overage. */
export const AI_CALL_MIN_TOKENS = 2_000;

/** The one "can this caller start another AI call?" rule — used by the
 *  server gate (token-ledger) AND the client's exhausted state, so the pill
 *  never says "tokens left" while the server refuses the call. */
export function hasTokensForAiCall(totalAvailable: number): boolean {
  return totalAvailable >= AI_CALL_MIN_TOKENS;
}

/**
 * @deprecated Phase-1 token-metering rework will remove this.
 * Legacy request-count gate — kept until `checkAIUsage` is replaced
 * by `checkTokenBudget`. Importers should switch to `FREE_AI_MONTHLY_TOKENS`.
 */
export const FREE_AI_MONTHLY_LIMIT = 10;

// ── Other free-tier hard limits ─────────────────────────────────────────────
export const FREE_TEAM_MEMBER_LIMIT = 2;       // max team members (inviter + 1)
/** Free tier: max published video resumes (drafts unlimited). */
export const FREE_PUBLISHED_VIDEOS_LIMIT = 1;
/** Free tier: max AI interview practice sessions per calendar month. Pro is unlimited. */
export const FREE_INTERVIEW_SESSIONS_PER_MONTH = 3;

// ── Posting a video (Post dock) ─────────────────────────────────────────────
/** Destinations one post may go to without Pro — the same for a silent guest
 *  session and a free account: promoting is never behind a sign-up (an
 *  account is offered to SAVE the work, not to post it). Pro is unlimited. */
export const FREE_POST_CHANNEL_LIMIT = 2;

/** How many destinations one post may go to — the single rule the Post dock
 *  and the server gate enforce (free / guest 2 → Pro unlimited). */
export function postChannelLimit({ isPro }: { isPro: boolean }): number {
  return isPro ? Number.POSITIVE_INFINITY : FREE_POST_CHANNEL_LIMIT;
}

// ── Inbox Sync (Gmail / Outlook connected mailboxes) ────────────────────────
// Inbox Sync is a Pro-only feature. Pro plans include `INBOX_SYNC_INCLUDED_ACCOUNTS`
// connected mailboxes; beyond that, extra mailbox slots are sold as an add-on
// at `INBOX_SYNC_EXTRA_ACCOUNT_PRICE`/month per slot. The cap is hard:
// connect-time gating in [api/src/routes/email-integration.ts] returns 402
// with a CTA pointing at the add-on SKU on the Pricing page.
/** Pro tier: max connected inboxes included in the base subscription. */
export const INBOX_SYNC_INCLUDED_ACCOUNTS = 3;
/** Add-on monthly price per extra connected inbox beyond the included 3. */
export const INBOX_SYNC_EXTRA_ACCOUNT_PRICE = 5;

// ── Token pack SKUs (one-off top-ups for Pro) ──────────────────────────────
// Priced against the WORST-CASE cost basis: every token on Claude Opus 5.5
// (~$8.80/M blended, shared/ai-model-rates.ts) plus the card fee, with each
// pack still netting ≥25% margin. Larger packs are cheaper per token.
//   250K  $3.99  → cost $2.20 + fee $0.42 → ~34% margin
//   1M    $14.99 → cost $8.80 + fee $0.73 → ~36% margin
//   3M    $39.99 → cost $26.40 + fee $1.46 → ~30% margin
// Pack tokens never expire and are spent after the monthly allowance.
// Repriced 2026-10-08: the old $4–$8/M packs were all below Opus cost.
export interface TokenPack {
  id: string;
  /** i18n key for the pack's display name. */
  labelKey: string;
  tokens: number;
  /** USD price (decimal dollars). */
  price: number;
}

export const TOKEN_PACKS: readonly TokenPack[] = [
  { id: "tokens_250k", labelKey: "billing.tokenPacks.pack.small", tokens: 250_000, price: 3.99 },
  { id: "tokens_1m", labelKey: "billing.tokenPacks.pack.medium", tokens: 1_000_000, price: 14.99 },
  { id: "tokens_3m", labelKey: "billing.tokenPacks.pack.large", tokens: 3_000_000, price: 39.99 },
];

export function findTokenPack(id: string): TokenPack | undefined {
  return TOKEN_PACKS.find((p) => p.id === id);
}

/** Effective $ per million tokens — derived, never stored. */
export function tokenPackDollarsPerMillion(pack: TokenPack): number {
  return +(pack.price / (pack.tokens / 1_000_000)).toFixed(2);
}

/** Pack price in integer cents — what payment verification compares against. */
export function tokenPackPriceCents(pack: TokenPack): number {
  return Math.round(pack.price * 100);
}

/** A USD amount as a localized currency label (e.g. 9.95 → "$9.95"). */
export function formatUsdPrice(amount: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(amount);
}

/** Pro monthly list price label — the ONE formatter for it; copy passes the
 *  result as {{price}}, never a literal number. */
export function formatProMonthlyPrice(locale = "en-US"): string {
  return formatUsdPrice(PRO_MONTHLY_PRICE, locale);
}

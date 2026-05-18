// Shared pricing/constants. Single source of truth for plan prices,
// token allowances, and pack SKUs — imported by both the frontend
// (Pricing.tsx, cart-context.tsx, AITokenPill) and the API
// (tierEnforcement, billing service).

// ── Plan prices ─────────────────────────────────────────────────────────────
// Pro = $9.95/mo for 1M included tokens. Margin works because the 1M cap is
// tight: 1M × $3/M cost basis = $3 raw, leaving ~$6 gross before Stripe
// (~60% net margin). Heavy users buy top-up packs instead of overflowing the
// subscription. Pro is bundled with branded features (watermark removal,
// 1080p, voice cloning, brand kits, unlimited published videos) — the
// per-token rate alone is intentionally not the cheapest option.
export const PRO_MONTHLY_PRICE = 9.95;
/** 20% annual discount: 9.95 × 12 × 0.8 = 95.52 */
export const PRO_YEARLY_PRICE = +(PRO_MONTHLY_PRICE * 12 * 0.8).toFixed(2);

// ── Token allowances (true token metering, not request counts) ──────────────
/** Free tier: monthly token allowance from the platform-paid LLM budget. */
export const FREE_AI_MONTHLY_TOKENS = 50_000;
/** Pro tier: monthly token allowance included in the $9.95 subscription.
 *  Heavy users buy top-up packs once they exceed this. */
export const PRO_AI_MONTHLY_TOKENS = 1_000_000;

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

// ── Token pack SKUs (one-off top-ups) ───────────────────────────────────────
// Pricing model: TRUE cost basis ~$3/M tokens (LLM ~$1.50 + hosting/storage/
// bandwidth/Stripe/ops ~$1.50). Margin tiers tuned so every pack still nets
// ≥25% after Stripe fees. Doubled from original LLM-only basis on 2026-04-11.
// See ROI worksheet in memory/project_token_pricing.md.
export interface TokenPack {
  id: string;
  name: string;
  tokens: number;
  /** USD price (decimal dollars). */
  price: number;
  /** Marketing tagline shown in cart / sidebar. */
  blurb: string;
  /** Effective $/million tokens — display only. */
  effectiveDollarsPerMillion: number;
}

export const TOKEN_PACKS: TokenPack[] = [
  {
    id: "tokens_bite_500k",
    name: "Bite",
    tokens: 500_000,
    price: 3.99,
    blurb: "~250 quick AI requests",
    effectiveDollarsPerMillion: 7.98,
  },
  {
    id: "tokens_standard_2m",
    name: "Standard",
    tokens: 2_000_000,
    price: 11.99,
    blurb: "~1,000 AI requests · most popular",
    effectiveDollarsPerMillion: 6.0,
  },
  {
    id: "tokens_power_10m",
    name: "Power",
    tokens: 10_000_000,
    price: 49.99,
    blurb: "~5,000 AI requests · best $/token under Pro",
    effectiveDollarsPerMillion: 5.0,
  },
  {
    id: "tokens_mega_50m",
    name: "Mega",
    tokens: 50_000_000,
    price: 199.99,
    blurb: "~25,000 AI requests · power-user discount",
    effectiveDollarsPerMillion: 4.0,
  },
];


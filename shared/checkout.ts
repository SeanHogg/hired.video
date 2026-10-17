/**
 * One-off checkout contract — the ONE start → pay → confirm surface for every
 * server-priced purchase (API: routes/checkout.ts → services/billing/checkout;
 * frontend: lib/services/checkout-service.ts).
 *
 *   POST /api/checkout               { kind, ...kind input }  → CheckoutDTO
 *   GET  /api/checkout/mine[?kind=]                           → CheckoutReceiptDTO[]
 *   GET  /api/checkout/:id                                    → CheckoutDTO
 *   POST /api/checkout/:id/pay       { successUrl?, cancelUrl? } → CheckoutPayDTO
 *   POST /api/checkout/:id/confirm   { transactionId }        → CheckoutConfirmDTO
 *
 * The server prices every kind itself (the client never sends an amount),
 * `pay` opens the provider widget for exactly the amount due, and `confirm`
 * re-reads the transaction from the provider (OneOffPaymentsPort) and
 * fulfils only an approved, exact, single-use payment on this user's
 * customer record. Confirm is idempotent; `pending: true` means the provider
 * couldn't answer yet and nothing was lost.
 *
 * A checkout id is opaque to clients: `<kind>:<key>` (boost → boost id,
 * course → course_checkouts id, token_pack → pack id).
 */
import { z } from "zod";
import { UuidLikeSchema } from "./validation.js";
import type { TokenBudgetDTO } from "./billing.js";

export const CHECKOUT_KINDS = ["boost", "course", "token_pack"] as const;
export type CheckoutKind = (typeof CHECKOUT_KINDS)[number];

export function isCheckoutKind(v: unknown): v is CheckoutKind {
  return typeof v === "string" && (CHECKOUT_KINDS as readonly string[]).includes(v);
}

const CHECKOUT_ID_SEPARATOR = ":";

/** The opaque checkout id for a kind's key. */
export function checkoutIdFor(kind: CheckoutKind, key: string): string {
  return `${kind}${CHECKOUT_ID_SEPARATOR}${key}`;
}

/** Split an opaque checkout id, or null when it isn't one of ours. */
export function parseCheckoutId(id: string): { kind: CheckoutKind; key: string } | null {
  const at = id.indexOf(CHECKOUT_ID_SEPARATOR);
  if (at <= 0) return null;
  const kind = id.slice(0, at);
  const key = id.slice(at + 1);
  if (!isCheckoutKind(kind) || key.length === 0 || key.length > 100) return null;
  return { kind, key };
}

// ── start ──────────────────────────────────────────────────────────────────

/** Subjects an owner may promote with a paid boost. */
export const BOOSTABLE_SUBJECT_TYPES = [
  "review",
  "feed_post",
  "company",
  "promo_project",
  "video",
  "resume",
  "voice_clone",
  "service",
] as const;
export type BoostableSubject = (typeof BOOSTABLE_SUBJECT_TYPES)[number];

export const StartBoostCheckoutSchema = z.object({
  kind: z.literal("boost"),
  subjectType: z.enum(BOOSTABLE_SUBJECT_TYPES),
  subjectId: UuidLikeSchema,
  budgetCents: z.number().int().min(100).max(1_000_000),
  durationDays: z.number().int().min(1).max(90),
  placementType: z.string().max(32).default("feed_top"),
  pricingModel: z.enum(["flat", "cpm", "cpc"]).default("flat"),
  /** Cap on how much Campaign $ to draw — defaults to "all of it". */
  maxCampaignDollarsCents: z.number().int().min(0).optional(),
});

export const StartCourseCheckoutSchema = z.object({
  kind: z.literal("course"),
  courseId: UuidLikeSchema,
});

export const StartTokenPackCheckoutSchema = z.object({
  kind: z.literal("token_pack"),
  packId: z.string().min(1).max(50),
});

export const StartCheckoutSchema = z.discriminatedUnion("kind", [
  StartBoostCheckoutSchema,
  StartCourseCheckoutSchema,
  StartTokenPackCheckoutSchema,
]);
export type StartCheckoutInput = z.infer<typeof StartCheckoutSchema>;
export type StartCheckoutInputOf<K extends CheckoutKind> = Extract<StartCheckoutInput, { kind: K }>;
/** What a client sends (defaults not yet applied). */
export type StartCheckoutRequest = z.input<typeof StartCheckoutSchema>;
export type StartCheckoutRequestOf<K extends CheckoutKind> = Extract<StartCheckoutRequest, { kind: K }>;

// ── pay / confirm ──────────────────────────────────────────────────────────

export const PayCheckoutSchema = z.object({
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});
export type PayCheckoutInput = z.infer<typeof PayCheckoutSchema>;

export const ConfirmCheckoutSchema = z.object({
  /** The provider transaction id the payment widget reported. */
  transactionId: z.string().min(1).max(100),
});
export type ConfirmCheckoutInput = z.infer<typeof ConfirmCheckoutSchema>;

// ── DTOs ───────────────────────────────────────────────────────────────────

export type CheckoutStatus = "pending" | "paid" | "expired" | "refunded";

export interface BoostCheckoutDetails {
  boostId: string;
  /** Campaign $ drawn toward the total (known on start). */
  campaignDollarsCents?: number;
  /** The boost row as created (present on start). */
  boost?: Record<string, unknown>;
}

export interface CourseCheckoutDetails {
  courseId: string;
  platformFeeCents: number;
  creatorCutCents: number;
  enrollmentId: string | null;
  expiresAt: string | null;
}

export interface TokenPackCheckoutDetails {
  packId: string;
  tokens: number;
}

export interface CheckoutDetailsByKind {
  boost: BoostCheckoutDetails;
  course: CourseCheckoutDetails;
  token_pack: TokenPackCheckoutDetails;
}

export type CheckoutDTO<K extends CheckoutKind = CheckoutKind> = {
  [P in K]: {
    /** Opaque `<kind>:<key>` id for the pay / confirm / get calls. */
    id: string;
    kind: P;
    status: CheckoutStatus;
    totalCents: number;
    /** USD still owed — 0 once paid (or fully covered by Campaign $). */
    amountDueCents: number;
    currency: string;
    details: CheckoutDetailsByKind[P];
  };
}[K];

/** `collection` is the provider widget init (frontend: InitCollectionResult). */
export interface CheckoutPayDTO<C = unknown> {
  id: string;
  amountDueCents: number;
  collection: C;
}

export interface CheckoutOutcomeByKind {
  boost: { activated: boolean };
  course: { enrollmentId: string | null };
  token_pack: { granted: boolean; tokensGranted: number; tokenBudget: TokenBudgetDTO };
}

export type CheckoutConfirmDTO<K extends CheckoutKind = CheckoutKind> = {
  [P in K]: {
    id: string;
    kind: P;
    /** True when the provider couldn't confirm yet — retry later (or, for
     *  token packs, the reconcile cron finishes it). Nothing was charged twice. */
    pending: boolean;
    outcome: CheckoutOutcomeByKind[P];
  };
}[K];

/** A completed purchase for receipts views (GET /api/checkout/mine). */
export interface CourseCheckoutReceipt {
  id: string;
  kind: "course";
  courseId: string;
  courseTitle: string;
  courseSlug: string | null;
  totalCents: number;
  status: CheckoutStatus;
  paidAt: string | null;
  enrollmentId: string | null;
  createdAt: string;
}
export type CheckoutReceiptDTO = CourseCheckoutReceipt;

// ── errors ─────────────────────────────────────────────────────────────────

export const CHECKOUT_ERROR_KINDS = [
  "NOT_FOUND",
  "FORBIDDEN",
  "NOTHING_DUE",
  "PAYMENTS_UNAVAILABLE",
  "PAYMENT_NOT_VERIFIED",
  "PAYMENT_ALREADY_USED",
  "UNKNOWN_PACK",
  "PRO_REQUIRED",
  "FREE_COURSE",
  "ALREADY_ENROLLED",
  "CHECKOUT_REFUNDED",
] as const;
export type CheckoutErrorKind = (typeof CHECKOUT_ERROR_KINDS)[number];

export function isCheckoutErrorKind(v: unknown): v is CheckoutErrorKind {
  return typeof v === "string" && (CHECKOUT_ERROR_KINDS as readonly string[]).includes(v);
}

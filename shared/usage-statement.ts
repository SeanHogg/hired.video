// Shared contract between [api/src/routes/billing.ts] usage-statement
// endpoints and the [frontend/components/billing/UsageStatementPanel.tsx] +
// [frontend/lib/services/billing-service.ts] consumer.
//
// One row per metered dimension defined in
// [api/src/domains/services-processing/entitlement-catalog.ts]. The current
// month is rendered live from the ledger; closed months are read from
// `usage_statements.lines` verbatim.

/**
 * The event types ServicesProcessor knows how to meter and gate.
 * Names match `usage_ledger.event_type` strings exactly. Adding a new
 * event_type requires:
 *   1. extending this union,
 *   2. adding a catalog entry in entitlement-catalog.ts,
 *   3. invoking `servicesProcessor.meter(eventType, …)` from the site that
 *      performs the action.
 * No migration is needed — the ledger schema is event-type-agnostic.
 */
export type UsageEventType =
  | "ai_tokens"
  | "video_publish"
  | "team_invite"
  | "interview_session"
  | "saved_search"
  | "company_db_write"
  | "resume_tailor"
  | "resume_roast"
  | "resume_summary"
  | "value_prop_pitch"
  | "resume_parse"
  | "career_coach_msg"
  | "export_4k"
  | "export_1080p"
  | "bulk_score_run";

export type PlanTier = "free" | "pro" | "trial";

export interface UsageStatementLine {
  eventType: UsageEventType;
  /** Human-readable label rendered in the Usage Statement panel. */
  label: string;
  /** "tokens" | "videos" | "invites" | "sessions" | "searches" | "calls" | … */
  unit: string;
  /** Plan allowance for this dimension in the current period. 0 = unlimited. */
  includedQuantity: number;
  /** Sum of `usage_ledger.quantity` for the period. */
  consumedQuantity: number;
  /** max(0, consumed - included) when included > 0; 0 otherwise. */
  overageQuantity: number;
  /** Overage rate × overageQuantity. Zero when the user is within allowance
   *  or the dimension is not money-priced (most are entitlement-only today). */
  overageCents: number;
}

export interface UsageStatement {
  id: string | null;
  userId: string;
  /** ISO 8601 UTC. */
  periodStart: string;
  /** ISO 8601 UTC. */
  periodEnd: string;
  plan: PlanTier;
  lines: UsageStatementLine[];
  totalCents: number;
  currency: string;
  /** 'open' for the live preview, 'closed' once the cron has rolled the
   *  month over and emitted the invoice. */
  status: "open" | "closed" | "voided";
}

export interface UsageInvoice {
  id: string;
  statementId: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  plan: PlanTier;
  invoiceNumber: string;
  totalCents: number;
  currency: string;
  status: "free_zero" | "pending" | "paid" | "failed" | "refunded";
  emailSentAt: string | null;
  createdAt: string;
}

/**
 * SuperAdmin AI spend report — what AI consumption costs us, per user and per
 * model family, against what those users pay. Contract shared by
 * GET /api/admin/impersonate/ai-spend and the admin AiSpendPanel.
 *
 * Cost = `ai_usage_records.cost` (priced per call from shared/ai-model-rates.ts).
 * Revenue is an ESTIMATE for the window: the Pro list price pro-rated over the
 * window for users on Pro today, plus token packs they paid for in the window.
 */
export const AI_SPEND_WINDOWS = [7, 30, 90] as const;
export type AiSpendWindow = (typeof AI_SPEND_WINDOWS)[number];
export const AI_SPEND_DEFAULT_WINDOW: AiSpendWindow = 30;
/** Max user rows returned (highest cost first). */
export const AI_SPEND_USER_LIMIT = 100;

export function parseAiSpendWindow(raw: unknown): AiSpendWindow {
  const n = Number(raw);
  return (AI_SPEND_WINDOWS as readonly number[]).includes(n) ? (n as AiSpendWindow) : AI_SPEND_DEFAULT_WINDOW;
}

export interface AiSpendUserRow {
  userId: string;
  email: string | null;
  name: string | null;
  isPro: boolean;
  calls: number;
  tokens: number;
  costUsd: number;
  revenueUsd: number;
  marginUsd: number;
}

export interface AiSpendModelRow {
  /** Rate-card family id (shared/ai-model-rates.ts), e.g. "claude-opus-5-5". */
  rateId: string;
  calls: number;
  tokens: number;
  costUsd: number;
}

export interface AiSpendReportDTO {
  days: AiSpendWindow;
  since: string;
  totals: { calls: number; tokens: number; costUsd: number };
  users: AiSpendUserRow[];
  models: AiSpendModelRow[];
  /** Listed users whose AI cost exceeded their estimated revenue. */
  unprofitableUsers: number;
}

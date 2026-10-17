/**
 * Gateway-vs-ledger AI cost drift report (#508). Cross-checks the gateway's
 * aggregated cost (builderforce-sdk `client.usage.get({days})`) against our
 * row-level `ai_usage_records` for the same window. Drift flags either a
 * charge-drop bug on our ledger or double-billing on the gateway side.
 *
 * Until the gateway exposes per-call usage records the report compares
 * TOTALS only — the payload says so explicitly.
 */
import { ledgerTotalsSince, type LedgerTotals } from "../../repositories/admin/aiLedgerRepository.js";

interface GatewayTotals {
  totalTokens: number | null;
  estCostCents: number | null;
  note: string;
}

interface UsageClient {
  usage: { get(input: { days: number }): Promise<{ totals?: { totalTokens?: number; totalCostCents?: number } }> };
}

async function gatewayTotals(days: number): Promise<GatewayTotals> {
  const unavailable: GatewayTotals = {
    totalTokens: null,
    estCostCents: null,
    note: "Gateway SDK not configured in this deploy; gateway side unavailable.",
  };
  try {
    const sdk = (await import("@seanhogg/builderforce-sdk").catch(() => null)) as unknown as {
      createClient?: (opts: { apiKey: string }) => UsageClient;
    } | null;
    const env = ((globalThis as { __ENV?: Record<string, string | undefined> }).__ENV ?? process.env ?? {}) as Record<
      string,
      string | undefined
    >;
    const apiKey = env.BUILDERFORCE_API_KEY;
    if (!sdk?.createClient || !apiKey) return unavailable;
    const usage = await sdk.createClient({ apiKey }).usage.get({ days });
    return {
      totalTokens: Number(usage?.totals?.totalTokens) || 0,
      estCostCents: Number(usage?.totals?.totalCostCents) || 0,
      note: "Gateway totals are aggregated; per-call rows pending GET /llm/v1/usage/records (#508).",
    };
  } catch (err) {
    return {
      totalTokens: null,
      estCostCents: null,
      note: `Gateway SDK call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function getAiCostReconciliation(days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  let ledger: LedgerTotals = { totalTokens: 0, rows: 0, estCostCents: 0 };
  try {
    ledger = await ledgerTotalsSince(since);
  } catch {
    // ledger table missing in this deploy — report zeros
  }
  const gateway = await gatewayTotals(days);
  const driftTokens = gateway.totalTokens === null ? null : Math.abs(ledger.totalTokens - gateway.totalTokens);
  const driftCostCents = gateway.estCostCents === null ? null : Math.abs(ledger.estCostCents - gateway.estCostCents);
  return {
    days,
    since: since.toISOString(),
    ledger,
    gateway,
    drift: {
      tokens: driftTokens,
      costCents: driftCostCents,
      note:
        driftTokens === null
          ? "Drift unknown — gateway side unavailable."
          : driftTokens === 0
          ? "Aggregated totals match."
          : "Aggregated totals differ. Investigate per-feature-key spend in the AI use-case admin panel.",
    },
  };
}

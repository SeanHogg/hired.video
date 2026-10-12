/**
 * UsageReportService — the admin read side of usage tracking: traffic over
 * time, where visitors come from, and funnel conversion. Funnels are DATA
 * (shared/usage.ts USAGE_FUNNELS); this service never branches per funnel.
 *
 * Cached 5 minutes per (report, window). The keyspace is bounded — three
 * windows × the registered funnels — and a few minutes of lag is fine for
 * trend views, so writes don't invalidate (they would thrash on every beacon).
 */
import type { IUsageTrackingRepository } from "../../repositories/usageTrackingRepository.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
import {
  findFunnel,
  type FunnelReportDto,
  type TrafficReportDto,
  type TrafficWindowDays,
} from "../../../../shared/usage.js";

const REPORT_TTL_SECONDS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

export class UsageReportService {
  constructor(
    private readonly repo: Pick<IUsageTrackingRepository, "trafficSeries" | "trafficSources" | "funnelCounts">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private since(days: TrafficWindowDays): Date {
    return new Date(this.now().getTime() - days * DAY_MS);
  }

  async getTraffic(days: TrafficWindowDays): Promise<TrafficReportDto> {
    return getOrSetCached<TrafficReportDto>({
      key: `usage:traffic:${days}`,
      ttlSeconds: REPORT_TTL_SECONDS,
      loader: async () => {
        const since = this.since(days);
        const [series, sources] = await Promise.all([
          this.repo.trafficSeries(since),
          this.repo.trafficSources(since),
        ]);
        return { days, series, ...sources };
      },
    });
  }

  /** Null when `funnelId` is not registered. */
  async getFunnel(funnelId: string, days: TrafficWindowDays): Promise<FunnelReportDto | null> {
    const funnel = findFunnel(funnelId);
    if (!funnel) return null;
    return getOrSetCached<FunnelReportDto>({
      key: `usage:funnel:${funnel.id}:${days}`,
      ttlSeconds: REPORT_TTL_SECONDS,
      loader: async () => {
        const counts = await this.repo.funnelCounts(
          funnel.steps.map((s) => s.match),
          this.since(days),
        );
        return {
          funnelId: funnel.id,
          labelKey: funnel.labelKey,
          days,
          steps: funnel.steps.map((s, i) => ({ id: s.id, labelKey: s.labelKey, visitors: counts[i] ?? 0 })),
        };
      },
    });
  }
}

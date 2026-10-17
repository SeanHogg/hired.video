/**
 * AdminMetricsService — the SuperAdmin product dashboard read model
 * (`/api/admin/metrics/*`). Every aggregate lands through a repository;
 * this layer only composes them into the dashboard / SaaS / series shapes.
 */
import { getDb } from "../../db/index.js";
import { buildRepos, type Repos } from "../../repositories/index.js";
import {
  AdminMetricsRepository,
  isAdminTimeSeriesMetric,
} from "../../repositories/adminMetricsRepository.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}

function toCountMap(rows: Array<{ role: string; n: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.role] = r.n;
  return out;
}

/** Affiliate admin rollup. The affiliate program has no platform-wide
 *  aggregate yet, so this is the zero shape the dashboard tab renders. */
const EMPTY_AFFILIATE_STATS = {
  totalAffiliates: 0,
  activeAffiliates: 0,
  newAffiliatesThisMonth: 0,
  totalCommissionsPaidCents: 0,
  pendingPayoutsCents: 0,
  totalReferrals: 0,
  totalConversions: 0,
  conversionRate: 0,
  pendingPayouts: 0,
  completedPayouts: 0,
  topPerformers: [],
  recentPayouts: [],
};

export class AdminMetricsService {
  constructor(
    private readonly repos: Repos,
    private readonly metrics: AdminMetricsRepository,
  ) {}

  static create(): AdminMetricsService {
    const db = getDb();
    return new AdminMetricsService(buildRepos(db), new AdminMetricsRepository(db));
  }

  async dashboard() {
    const { repos } = this;
    const now = new Date();
    const thirtyDaysAgo = daysAgo(30);
    const [
      totalUsers,
      activeUsers,
      newUsers30,
      totalJobs,
      activeJobs,
      newJobs30,
      totalResumes,
      newResumes30,
      totalCompanies,
      newCompanies30,
      activeSubs,
      totalSubs,
      mrr,
      prevMrr,
      usersByRole,
      newUsersByRole30,
    ] = await Promise.all([
      repos.users.countAll(),
      repos.users.countActive(),
      repos.users.countCreatedSince(thirtyDaysAgo),
      repos.jobs.countJobs(),
      repos.jobs.countActiveJobs(),
      repos.jobs.countJobsCreatedSince(thirtyDaysAgo),
      repos.resumes.countAll(),
      repos.resumes.countCreatedSince(thirtyDaysAgo),
      this.metrics.countCompanies(),
      this.metrics.countCompanies(thirtyDaysAgo),
      repos.subscriptions.countActive(),
      repos.subscriptions.countAll(),
      repos.subscriptions.activeMrr(),
      repos.subscriptions.activeMrrBefore(thirtyDaysAgo),
      repos.users.countByRole(),
      repos.users.countByRoleCreatedSince(thirtyDaysAgo),
    ]);

    const growthRate = prevMrr > 0 ? Math.round(((mrr - prevMrr) / prevMrr) * 100 * 10) / 10 : 0;
    const conversionRate = totalUsers > 0 ? Math.round((activeSubs / totalUsers) * 1000) / 10 : 0;
    const arpu = activeSubs > 0 ? Math.round((mrr / activeSubs) * 100) / 100 : 0;

    // 90-day growth series (weekly buckets) — ONE grouped query; bucket
    // k = w + 1 covers [now - (w+1)*7d, now - w*7d).
    const weekly = await this.metrics.countByRelativeBuckets("users", now, WEEK_MS, 1, 13);
    const growthSeries: Array<{ date: string; count: number }> = [];
    for (let w = 12; w >= 0; w--) {
      const to = new Date(now.getTime() - w * WEEK_MS);
      growthSeries.push({ date: to.toISOString().slice(0, 10), count: weekly.get(w + 1) ?? 0 });
    }

    return {
      userMetrics: {
        totalUsers,
        activeUsers,
        newUsersLast30Days: newUsers30,
        usersByRole: toCountMap(usersByRole),
        newUsersByRole: toCountMap(newUsersByRole30),
        usersByStatus: { active: activeUsers, inactive: totalUsers - activeUsers },
      },
      jobMetrics: { totalJobs, activeJobs, newJobsLast30Days: newJobs30 },
      resumeMetrics: { totalResumes, newResumesLast30Days: newResumes30 },
      companyMetrics: { totalCompanies, newCompaniesLast30Days: newCompanies30 },
      saasMetrics: {
        monthlyRecurringRevenue: mrr,
        annualRecurringRevenue: mrr * 12,
        averageRevenuePerUser: arpu,
        growthRate,
        conversionRate,
        totalSubscriptions: totalSubs,
        activeSubscriptions: activeSubs,
        churnRate: 0, // requires historical cancellation data
        // CLV = ARPU / churn_rate (estimated 5%)
        customerLifetimeValue: arpu > 0 ? Math.round((arpu / 0.05) * 100) / 100 : 0,
      },
      userGrowthLast90Days: growthSeries,
    };
  }

  async saas() {
    const { repos } = this;
    const [mrr, prevMrr, activeSubs, totalUsers] = await Promise.all([
      repos.subscriptions.activeMrr(),
      repos.subscriptions.activeMrrBefore(daysAgo(30)),
      repos.subscriptions.countActive(),
      repos.users.countAll(),
    ]);

    // Monthly time-series (last 6 months) — cumulative "active & created
    // on/before month cutoff", computed in ONE grouped query.
    const months: Array<{ label: string; cutoff: Date }> = [];
    for (let m = 5; m >= 0; m--) {
      const d = new Date();
      d.setMonth(d.getMonth() - m, 1);
      d.setHours(0, 0, 0, 0);
      months.push({ label: d.toISOString().slice(0, 7), cutoff: new Date(d.getFullYear(), d.getMonth() + 1, 0) });
    }
    const cumulative = await this.metrics.activeSubscriptionsAtCutoffs(months.map((m) => m.cutoff));

    return {
      mrr,
      arr: mrr * 12,
      growthRate: prevMrr > 0 ? Math.round(((mrr - prevMrr) / prevMrr) * 1000) / 10 : 0,
      activeSubscriptions: activeSubs,
      conversionRate: totalUsers > 0 ? Math.round((activeSubs / totalUsers) * 1000) / 10 : 0,
      arpu: activeSubs > 0 ? Math.round((mrr / activeSubs) * 100) / 100 : 0,
      timeSeries: months.map((m, i) => ({
        month: m.label,
        mrr: cumulative[i]?.mrr ?? 0,
        subscribers: cumulative[i]?.subscribers ?? 0,
      })),
    };
  }

  /** 30 daily points; unknown metrics / query failures read as zeros. */
  async timeSeries(metric: string) {
    const now = new Date();
    let byDay = new Map<number, number>();
    if (isAdminTimeSeriesMetric(metric)) {
      try {
        byDay = await this.metrics.countByRelativeBuckets(metric, now, DAY_MS, 0, 29);
      } catch {
        byDay = new Map();
      }
    }
    const points: Array<{ date: string; value: number }> = [];
    for (let d = 29; d >= 0; d--) {
      const day = new Date(now.getTime() - d * DAY_MS);
      points.push({ date: day.toISOString().slice(0, 10), value: byDay.get(d) ?? 0 });
    }
    return { metric, points };
  }

  static affiliateStats() {
    return EMPTY_AFFILIATE_STATS;
  }

  /** Headline metrics as CSV text for the dashboard export button. */
  async exportCsv(): Promise<string> {
    const [users, jobs, mrr] = await Promise.all([
      this.repos.users.countAll(),
      this.repos.jobs.countJobs(),
      this.repos.subscriptions.activeMrr(),
    ]);
    return `metric,value\ntotalUsers,${users}\ntotalJobs,${jobs}\nmrr,${mrr}\narr,${mrr * 12}\nexportedAt,${new Date().toISOString()}`;
  }
}

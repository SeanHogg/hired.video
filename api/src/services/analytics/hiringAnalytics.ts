/**
 * hiringAnalytics.ts — the metric registry behind
 * `GET /api/analytics/hiring?metric=`.
 *
 *   time-to-hire — avg days creation→start across the recruiter's
 *                  placements, per-job breakdown + monthly trend (#17, Pro)
 *   funnel       — per-role application→hire conversion, stage totals and
 *                  monthly hire trend (#16, Pro)
 *   insights     — org-level pipeline funnel, time-to-hire avg/median and
 *                  source mix across every job the user posted (DEI panel
 *                  on EmployerDashboard; any signed-in user)
 *
 * Each metric keeps the exact response shape its retired endpoint returned
 * (/api/analytics/time-to-hire, /api/analytics/hiring-metrics,
 * /api/recruiter/hiring-insights).
 */
import { getDb } from "../../db/index.js";
import { HiringAnalyticsRepository } from "../../repositories/hiringAnalyticsRepository.js";

export const HIRING_METRICS = ["time-to-hire", "funnel", "insights"] as const;
export type HiringMetric = (typeof HIRING_METRICS)[number];

export function isHiringMetric(v: string | undefined): v is HiringMetric {
  return (HIRING_METRICS as readonly string[]).includes(v ?? "");
}

/** Pro feature name per metric (null = any signed-in user). */
export const HIRING_METRIC_PRO_FEATURE: Record<HiringMetric, string | null> = {
  "time-to-hire": "Time-to-Hire Analytics",
  funnel: "Hiring Metrics",
  insights: null,
};

/** Default look-back window per metric, in days. */
const DEFAULT_WINDOW_DAYS: Record<HiringMetric, number> = {
  "time-to-hire": 180,
  funnel: 90,
  insights: 0,
};

export interface HiringWindow {
  from?: string;
  to?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function resolveWindow(metric: HiringMetric, q: HiringWindow): { from: Date; to: Date } {
  const from = q.from ? new Date(q.from) : new Date(Date.now() - DEFAULT_WINDOW_DAYS[metric] * MS_PER_DAY);
  const to = q.to ? new Date(q.to) : new Date();
  return { from, to };
}

function repo(): HiringAnalyticsRepository {
  return new HiringAnalyticsRepository(getDb());
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function timeToHire(userId: string, q: HiringWindow) {
  const { from, to } = resolveWindow("time-to-hire", q);
  const rows = await repo().placementsForRecruiter(userId, from, to);
  const withDays = rows
    .filter((r) => r.startDate)
    .map((r) => ({
      ...r,
      days: Math.round((new Date(r.startDate!).getTime() - new Date(r.createdAt).getTime()) / MS_PER_DAY),
    }));

  const avgDays = withDays.length > 0
    ? Math.round(withDays.reduce((s, r) => s + r.days, 0) / withDays.length)
    : null;

  const byJob = Object.values(
    withDays.reduce<Record<string, { jobId: string | null; jobTitle: string | null; count: number; totalDays: number }>>((acc, r) => {
      const key = r.jobId ?? "unknown";
      if (!acc[key]) acc[key] = { jobId: r.jobId, jobTitle: r.jobTitle, count: 0, totalDays: 0 };
      acc[key].count++;
      acc[key].totalDays += r.days;
      return acc;
    }, {}),
  ).map((j) => ({ ...j, avgDays: Math.round(j.totalDays / j.count) }));

  const monthly: Record<string, { count: number; totalDays: number }> = {};
  for (const r of withDays) {
    const month = new Date(r.createdAt).toISOString().slice(0, 7);
    if (!monthly[month]) monthly[month] = { count: 0, totalDays: 0 };
    monthly[month].count++;
    monthly[month].totalDays += r.days;
  }
  const trend = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({ month, avgDays: Math.round(d.totalDays / d.count), count: d.count }));

  return { avgDays, totalPlacements: withDays.length, byJob, trend };
}

type RoleFunnel = {
  jobId: string | null;
  jobTitle: string | null;
  applied: number;
  reviewing: number;
  interviewed: number;
  offered: number;
  hired: number;
  rejected: number;
};

const emptyRole = (jobId: string | null, jobTitle: string | null): RoleFunnel => ({
  jobId, jobTitle: jobTitle ?? "Unknown Role", applied: 0, reviewing: 0, interviewed: 0, offered: 0, hired: 0, rejected: 0,
});

async function funnel(userId: string, q: HiringWindow) {
  const { from, to } = resolveWindow("funnel", q);
  const r = repo();
  const [applications, hirePlacements] = await Promise.all([
    r.applicationsForPoster(userId, from, to),
    r.placementsForRecruiter(userId, from, to),
  ]);

  const byRole: Record<string, RoleFunnel> = {};
  for (const app of applications) {
    const key = app.jobId ?? "unknown";
    if (!byRole[key]) byRole[key] = emptyRole(app.jobId, app.jobTitle);
    const status = (app.status ?? "applied").toLowerCase();
    byRole[key].applied++;
    if (status === "reviewing") byRole[key].reviewing++;
    else if (status === "interviewed" || status === "interview") byRole[key].interviewed++;
    else if (status === "offered") byRole[key].offered++;
    else if (status === "hired" || status === "accepted") byRole[key].hired++;
    else if (status === "rejected" || status === "declined") byRole[key].rejected++;
  }
  // Supplement hired counts from placements.
  for (const p of hirePlacements) {
    const key = p.jobId ?? "unknown";
    if (!byRole[key]) byRole[key] = emptyRole(p.jobId, p.jobTitle);
    byRole[key].hired = Math.max(byRole[key].hired, (byRole[key].hired || 0) + 1);
  }

  const roles = Object.values(byRole).map((role) => ({
    ...role,
    conversionRate: role.applied > 0 ? Math.round((role.hired / role.applied) * 1000) / 10 : 0,
  }));

  const totals = roles.reduce(
    (acc, role) => {
      acc.applied += role.applied;
      acc.reviewing += role.reviewing;
      acc.interviewed += role.interviewed;
      acc.offered += role.offered;
      acc.hired += role.hired;
      acc.rejected += role.rejected;
      return acc;
    },
    { applied: 0, reviewing: 0, interviewed: 0, offered: 0, hired: 0, rejected: 0 },
  );

  const monthlyHires: Record<string, number> = {};
  for (const p of hirePlacements) {
    const month = new Date(p.createdAt).toISOString().slice(0, 7);
    monthlyHires[month] = (monthlyHires[month] ?? 0) + 1;
  }
  const hireTrend = Object.entries(monthlyHires)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, hires]) => ({ month, hires }));

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    funnel: totals,
    byRole: roles.sort((a, b) => b.applied - a.applied),
    hireTrend,
  };
}

const DEMOGRAPHICS_UNSUPPORTED = {
  supported: false,
  reason: "Demographic capture not yet enabled — see gap register entry #1231.",
} as const;

async function insights(userId: string) {
  const r = repo();
  const jobIds = await r.jobIdsPostedBy(userId);
  const rows = await r.pipelineEntriesForJobs(jobIds);

  const pipelineFunnel: Record<string, number> = {};
  const sourceMix: Record<string, number> = {};
  const hireDurationsDays: number[] = [];
  for (const row of rows) {
    pipelineFunnel[row.stage] = (pipelineFunnel[row.stage] ?? 0) + 1;
    if (row.addedFrom) sourceMix[row.addedFrom] = (sourceMix[row.addedFrom] ?? 0) + 1;
    if (row.stage === "hired" && row.createdAt && row.stageChangedAt) {
      const days = (new Date(row.stageChangedAt).getTime() - new Date(row.createdAt).getTime()) / MS_PER_DAY;
      if (days >= 0) hireDurationsDays.push(days);
    }
  }
  hireDurationsDays.sort((a, b) => a - b);
  const avg = hireDurationsDays.length
    ? hireDurationsDays.reduce((a, b) => a + b, 0) / hireDurationsDays.length
    : null;

  return {
    jobIds,
    pipelineFunnel,
    totalCandidates: rows.length,
    totalHires: pipelineFunnel["hired"] ?? 0,
    avgTimeToHireDays: avg != null ? Number(avg.toFixed(1)) : null,
    medianTimeToHireDays: hireDurationsDays.length ? Number(median(hireDurationsDays).toFixed(1)) : null,
    sourceMix,
    demographics: DEMOGRAPHICS_UNSUPPORTED,
  };
}

/** Compute one hiring metric for the signed-in user. */
export function computeHiringMetric(metric: HiringMetric, userId: string, q: HiringWindow): Promise<unknown> {
  switch (metric) {
    case "time-to-hire":
      return timeToHire(userId, q);
    case "funnel":
      return funnel(userId, q);
    case "insights":
      return insights(userId);
  }
}

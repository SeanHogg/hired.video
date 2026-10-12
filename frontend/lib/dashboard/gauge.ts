/**
 * Dashboard speedometer model + scoring.
 *
 * One gauge visual is reused across every role (job seeker, creator,
 * employer, recruiter) and for gamification. Presentation lives in
 * <SpeedometerGauge> / <GaugeCard>; this module is the *pure*, testable
 * seam that turns each role's already-fetched data into a normalized
 * 0–100 `GaugeModel` with named levels and a benchmark needle.
 *
 * Localization: builders take an injected `t` (the i18next translator)
 * so every user-facing string resolves through the `dashboard.gauge.*`
 * catalog — the builders stay pure (no React/useTranslation) and the
 * presentation components stay dumb (they just render resolved strings).
 */

import type { JobSeekerDashboard } from "@/lib/services/dashboard-service";
import type { CreatorRollup } from "@/lib/services/artifact-view-service";
import type {
  PointsSummary,
  PointsCatalog,
} from "@/lib/services/points-service";
import { studioNewEntityHref } from "@/lib/studio/studio-authoring";

/** The slice of i18next's `t` the builders need (key + interpolation). */
export type GaugeT = (key: string, params?: Record<string, string | number>) => string;

/** A named tier on the 0–100 dial. `min` is the inclusive lower bound. */
export interface GaugeLevel {
  name: string;
  min: number;
}

export interface GaugeAction {
  label: string;
  href: string;
}

export interface GaugeModel {
  title: string;
  score: number;
  benchmark?: number;
  benchmarkLabel?: string;
  levels: GaugeLevel[];
  caption?: string;
  hint?: string;
  action?: GaugeAction;
}

/** Clamp + round an arbitrary weighted sum into a 0–100 integer score. */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Highest tier whose threshold the score has reached. */
export function currentLevel(score: number, levels: GaugeLevel[]): GaugeLevel {
  let cur = levels[0];
  for (const l of levels) if (score >= l.min) cur = l;
  return cur;
}

/** Next tier above the current score, or null at the top. */
export function nextLevel(score: number, levels: GaugeLevel[]): GaugeLevel | null {
  for (const l of levels) if (l.min > score) return l;
  return null;
}

/** Resolve a [key, min] tier table against the translator. */
type LevelDef = readonly [key: string, min: number];
function levels(t: GaugeT, defs: readonly LevelDef[]): GaugeLevel[] {
  return defs.map(([key, min]) => ({ name: t(key), min }));
}

// ── Role builders ───────────────────────────────────────────────────
//
// Each returns a GaugeModel (never throws) from data the role dashboard
// already holds. A `null` return means "no gauge for this state".

const SEEKER_LEVELS: readonly LevelDef[] = [
  ["dashboard.gauge.level.gettingStarted", 0],
  ["dashboard.gauge.level.jobReady", 40],
  ["dashboard.gauge.level.standoutCandidate", 70],
  ["dashboard.gauge.level.topTalent", 90],
];

/**
 * Job-readiness — explicitly rewards the two actions the dashboard
 * nudges: post a résumé (`publishedResumes`) and publish a video résumé
 * (`videoResumes`), on top of profile completion, applications, views
 * and interview interest. The CTA points at whichever step is missing.
 */
export function buildJobSeekerGauge(d: JobSeekerDashboard, t: GaugeT): GaugeModel {
  const onboarding = d.onboardingCompletionPercentage ?? 0; // 0–100
  const apps = d.applicationStats?.totalApplications ?? 0;
  const views = d.profileStats?.totalViews ?? 0;
  const interviews = d.applicationStats?.interviewRequests ?? 0;
  const hasResume = (d.resumeStats?.publishedResumes ?? 0) > 0;
  const hasVideoResume = (d.resumeStats?.videoResumes ?? 0) > 0;

  const score = clampScore(
    0.25 * onboarding +
      (hasResume ? 20 : 0) +
      (hasVideoResume ? 15 : 0) +
      20 * (Math.min(apps, 10) / 10) +
      10 * (Math.min(views, 50) / 50) +
      10 * (Math.min(interviews, 5) / 5),
  );

  let action: GaugeAction;
  let hintKey: string;
  if (!hasResume) {
    action = { label: t("dashboard.gauge.action.publishResume"), href: "/studio" };
    hintKey = "dashboard.gauge.jobseeker.hint.publishResume";
  } else if (!hasVideoResume) {
    action = { label: t("dashboard.gauge.action.recordVideoResume"), href: "/studio" };
    hintKey = "dashboard.gauge.jobseeker.hint.videoResume";
  } else if (onboarding < 100) {
    action = { label: t("dashboard.gauge.action.finishProfile"), href: "/profile" };
    hintKey = "dashboard.gauge.jobseeker.hint.profile";
  } else if (apps === 0) {
    action = { label: t("dashboard.gauge.action.applyToJobs"), href: "/jobs" };
    hintKey = "dashboard.gauge.jobseeker.hint.apply";
  } else {
    action = { label: t("dashboard.gauge.action.applyToJobs"), href: "/jobs" };
    hintKey = "dashboard.gauge.jobseeker.hint.refine";
  }

  return {
    title: t("dashboard.gauge.jobseeker.title"),
    score,
    benchmark: 70,
    benchmarkLabel: t("dashboard.gauge.benchmark.jobReady"),
    levels: levels(t, SEEKER_LEVELS),
    caption: t("dashboard.gauge.jobseeker.caption"),
    hint: t(hintKey),
    action,
  };
}

const CREATOR_LEVELS: readonly LevelDef[] = [
  ["dashboard.gauge.level.newcomer", 0],
  ["dashboard.gauge.level.risingCreator", 35],
  ["dashboard.gauge.level.established", 65],
  ["dashboard.gauge.level.influencer", 90],
];

/**
 * Creator momentum — content volume (toward ~12 pieces) plus the reach
 * it earns (views, viewers, countries). Pushes creators to keep
 * publishing; shows a zero Newcomer dial before the first piece.
 */
export function buildCreatorGauge(r: CreatorRollup | null, t: GaugeT): GaugeModel {
  const count = r?.totals.artifactCount ?? 0;
  const views = r?.totals.totalViews ?? 0;
  const viewers = r?.totals.uniqueViewers ?? 0;
  const countries = r?.totals.countriesReached ?? 0;

  const score = clampScore(
    0.4 * (Math.min(count, 12) / 12) * 100 +
      0.3 * (Math.min(views, 1000) / 1000) * 100 +
      0.15 * (Math.min(viewers, 200) / 200) * 100 +
      0.15 * (Math.min(countries, 10) / 10) * 100,
  );

  return {
    title: t("dashboard.gauge.creator.title"),
    score,
    benchmark: 65,
    benchmarkLabel: t("dashboard.gauge.benchmark.established"),
    levels: levels(t, CREATOR_LEVELS),
    caption: t("dashboard.gauge.creator.caption"),
    hint: t(count === 0 ? "dashboard.gauge.creator.hint.first" : "dashboard.gauge.creator.hint.keep"),
    action: { label: t("dashboard.gauge.action.createContent"), href: "/studio" },
  };
}

const HIRING_LEVELS: readonly LevelDef[] = [
  ["dashboard.gauge.level.cold", 0],
  ["dashboard.gauge.level.warmingUp", 35],
  ["dashboard.gauge.level.healthy", 65],
  ["dashboard.gauge.level.thriving", 90],
];

interface HiringInputs {
  jobPostingStats?: {
    activeJobs: number;
    totalApplications: number;
    filledPositions: number;
    averageTimeToFill: number;
  };
  candidateStats?: {
    totalCandidates: number;
    newCandidates: number;
    qualifiedCandidates: number;
    interviewedCandidates: number;
  };
}

/**
 * Employer hiring-pipeline health — inbound application volume, the
 * qualified ratio, and how many roles are filled. As applicants arrive
 * the dial fills; an empty pipeline reads "Cold" and nudges to post.
 */
export function buildHiringGauge(d: HiringInputs, t: GaugeT): GaugeModel {
  const jp = d.jobPostingStats;
  const cs = d.candidateStats;

  if (!jp && !cs) {
    return {
      title: t("dashboard.gauge.hiring.title"),
      score: 0,
      benchmark: 65,
      benchmarkLabel: t("dashboard.gauge.benchmark.healthy"),
      levels: levels(t, HIRING_LEVELS),
      caption: t("dashboard.gauge.hiring.caption"),
      hint: t("dashboard.gauge.hiring.hint.noJobs"),
      action: { label: t("dashboard.gauge.action.postJob"), href: studioNewEntityHref("job") },
    };
  }

  const totalApps = jp?.totalApplications ?? 0;
  const activeJobs = jp?.activeJobs ?? 0;
  const filled = jp?.filledPositions ?? 0;
  const qualified = cs?.qualifiedCandidates ?? 0;
  const totalCand = cs?.totalCandidates ?? 0;

  const appsScore = (Math.min(totalApps, 50) / 50) * 100;
  const qualScore = totalCand > 0 ? (qualified / totalCand) * 100 : 0;
  const fillScore = filled + activeJobs > 0 ? (filled / (filled + activeJobs)) * 100 : 0;

  const score = clampScore(0.4 * appsScore + 0.3 * qualScore + 0.3 * fillScore);

  const action: GaugeAction =
    activeJobs === 0
      ? { label: t("dashboard.gauge.action.postJob"), href: studioNewEntityHref("job") }
      : { label: t("dashboard.gauge.action.reviewPipeline"), href: "/recruiter/pipeline" };

  const hintKey =
    activeJobs === 0
      ? "dashboard.gauge.hiring.hint.noJobs"
      : totalApps === 0
        ? "dashboard.gauge.hiring.hint.noApps"
        : "dashboard.gauge.hiring.hint.move";

  return {
    title: t("dashboard.gauge.hiring.title"),
    score,
    benchmark: 65,
    benchmarkLabel: t("dashboard.gauge.benchmark.healthy"),
    levels: levels(t, HIRING_LEVELS),
    caption: t("dashboard.gauge.hiring.caption"),
    hint: t(hintKey),
    action,
  };
}

interface RecruiterInputs {
  submissionStats?: {
    total: number;
    submitted: number;
    interviewing: number;
    offered: number;
    placed: number;
    withdrawn: number;
  };
  placementStats?: {
    totalPlacements: number;
    placementRate: number;
    totalCommissionEarned: number;
  };
  candidateStats?: {
    totalCandidates: number;
    newCandidatesThisMonth: number;
    activeCandidates: number;
  };
}

/**
 * Recruiter sourcing-pipeline health — recruiters work a submission →
 * placement funnel rather than owned job postings, so this scores
 * submission volume, how far candidates advance, and the realized
 * placement rate. Distinct from {@link buildHiringGauge} because the
 * underlying data model is different (gap #2072).
 */
export function buildRecruiterGauge(d: RecruiterInputs, t: GaugeT): GaugeModel {
  const sub = d.submissionStats;
  const pl = d.placementStats;

  const total = sub?.total ?? 0;
  const advancing = (sub?.interviewing ?? 0) + (sub?.offered ?? 0) + (sub?.placed ?? 0);
  const volScore = (Math.min(total, 30) / 30) * 100;
  const advScore = total > 0 ? (advancing / total) * 100 : 0;
  const placeScore = pl?.placementRate ?? 0;

  const score = clampScore(0.4 * volScore + 0.3 * advScore + 0.3 * placeScore);

  const action: GaugeAction =
    total === 0
      ? { label: t("dashboard.gauge.action.sourceCandidates"), href: "/recruiter/pipeline" }
      : { label: t("dashboard.gauge.action.reviewPipeline"), href: "/recruiter/pipeline" };

  const hintKey =
    total === 0
      ? "dashboard.gauge.recruiter.hint.empty"
      : "dashboard.gauge.recruiter.hint.advance";

  return {
    title: t("dashboard.gauge.recruiter.title"),
    score,
    benchmark: 65,
    benchmarkLabel: t("dashboard.gauge.benchmark.healthy"),
    levels: levels(t, HIRING_LEVELS),
    caption: t("dashboard.gauge.recruiter.caption"),
    hint: t(hintKey),
    action,
  };
}

const PLATFORM_LEVELS: readonly LevelDef[] = [
  ["dashboard.gauge.level.critical", 0],
  ["dashboard.gauge.level.stabilizing", 35],
  ["dashboard.gauge.level.healthy", 65],
  ["dashboard.gauge.level.thriving", 90],
];

/** Normalized platform-health inputs — each surface (ProductDashboard /
 *  AdminDashboard) maps its own payload shape to these primitives, so the
 *  scoring lives here once rather than in each admin component. */
export interface PlatformInputs {
  totalUsers?: number;
  activeUsers?: number;
  /** Monthly churn, percent. */
  churnRate?: number;
  /** Paid/trial-to-paid conversion, percent. */
  conversionRate?: number;
  /** Uptime, percent. */
  uptimePercentage?: number;
}

/**
 * Platform-health dial for admins / the owner — the "Your Score / Org
 * Avg"-style overview the reference design shows. Blends active-user
 * engagement, paid conversion, retention (inverse churn) and uptime,
 * renormalized over whichever signals the surface actually provides so a
 * missing metric doesn't unfairly tank the score.
 */
export function buildPlatformGauge(d: PlatformInputs, t: GaugeT): GaugeModel {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const parts: { w: number; v: number }[] = [];
  if (typeof d.totalUsers === "number" && d.totalUsers > 0 && typeof d.activeUsers === "number") {
    parts.push({ w: 0.35, v: clamp((d.activeUsers / d.totalUsers) * 100) });
  }
  if (typeof d.conversionRate === "number") parts.push({ w: 0.25, v: clamp(d.conversionRate) });
  if (typeof d.churnRate === "number") parts.push({ w: 0.2, v: clamp(100 - d.churnRate) });
  if (typeof d.uptimePercentage === "number") parts.push({ w: 0.2, v: clamp(d.uptimePercentage) });

  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const score = totalW > 0 ? clampScore(parts.reduce((s, p) => s + p.w * p.v, 0) / totalW) : 0;

  const engagement =
    typeof d.totalUsers === "number" && d.totalUsers > 0 && typeof d.activeUsers === "number"
      ? d.activeUsers / d.totalUsers
      : 1;
  const hintKey =
    typeof d.churnRate === "number" && d.churnRate > 5
      ? "dashboard.gauge.platform.hint.churn"
      : engagement < 0.3
        ? "dashboard.gauge.platform.hint.engage"
        : "dashboard.gauge.platform.hint.healthy";

  return {
    title: t("dashboard.gauge.platform.title"),
    score,
    benchmark: 75,
    benchmarkLabel: t("dashboard.gauge.benchmark.healthy"),
    levels: levels(t, PLATFORM_LEVELS),
    caption: t("dashboard.gauge.platform.caption"),
    hint: t(hintKey),
    action: { label: t("dashboard.gauge.action.viewActiveUsers"), href: "/admin/active-users" },
  };
}

const REWARDS_LEVELS: readonly LevelDef[] = [
  ["dashboard.gauge.level.savingUp", 0],
  ["dashboard.gauge.level.halfway", 50],
  ["dashboard.gauge.level.almostThere", 80],
  ["dashboard.gauge.level.cashoutReady", 100],
];

const UNLOCK_LEVELS: readonly LevelDef[] = [
  ["dashboard.gauge.level.locked", 0],
  ["dashboard.gauge.level.unlocked", 100],
];

/**
 * Gamification — "when do I hit my next badge / cash out?". Before the
 * user-task gate unlocks, the dial tracks progress to unlock. After
 * that it tracks the points balance toward the cheapest redemption so
 * the goal is always a concrete cash-out. Returns null when there's
 * nothing motivating to show (suspended, or no redemption catalog).
 */
export function buildGamificationGauge(
  summary: PointsSummary,
  catalog: PointsCatalog | undefined,
  t: GaugeT,
): GaugeModel | null {
  if (summary.isSuspended) return null;

  const gate = summary.userTaskGate;
  if (!gate.unlocked) {
    const remaining = Math.max(0, gate.threshold - gate.completed);
    const score = gate.threshold > 0 ? clampScore((gate.completed / gate.threshold) * 100) : 0;
    return {
      title: t("dashboard.gauge.unlock.title"),
      score,
      benchmark: 100,
      benchmarkLabel: t("dashboard.gauge.benchmark.unlocked"),
      levels: levels(t, UNLOCK_LEVELS),
      caption: t("dashboard.gauge.unlock.caption", {
        completed: gate.completed,
        threshold: gate.threshold,
      }),
      hint: t("dashboard.gauge.unlock.hint", { remaining }),
      action: { label: t("dashboard.gauge.action.seeUnlock"), href: "/points" },
    };
  }

  const cheapest = (catalog?.redemptions ?? [])
    .map((r) => ({ cost: r.pointsCost, label: r.label }))
    .filter((r) => r.cost > 0)
    .sort((a, b) => a.cost - b.cost)[0];

  if (!cheapest) return null;

  const score = clampScore((summary.balance / cheapest.cost) * 100);
  const remaining = Math.max(0, cheapest.cost - summary.balance);
  const streak =
    summary.streak.current > 0
      ? t("dashboard.gauge.rewards.streakNote", { n: summary.streak.current })
      : "";

  const hint =
    remaining === 0
      ? t("dashboard.gauge.rewards.hint.ready", { label: cheapest.label, streak })
      : t("dashboard.gauge.rewards.hint.progress", {
          remaining: remaining.toLocaleString(),
          label: cheapest.label,
          streak,
        });

  return {
    title: t("dashboard.gauge.rewards.title"),
    score,
    benchmark: 100,
    benchmarkLabel: t("dashboard.gauge.benchmark.cashOut"),
    levels: levels(t, REWARDS_LEVELS),
    caption: t("dashboard.gauge.rewards.caption", { pts: summary.balance.toLocaleString() }),
    hint,
    action: { label: t("dashboard.gauge.action.redeemPoints"), href: "/points" },
  };
}

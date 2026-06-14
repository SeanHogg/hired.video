/**
 * Tests for the dashboard speedometer scoring (lib/dashboard/gauge.ts).
 *
 * Covers the pure model builders — the "what counts as progress" seam
 * each role dashboard renders. Fixtures mirror the real service shapes
 * (JobSeekerDashboard, CreatorRollup, recruiter payload, PointsSummary,
 * PointsCatalog) so a field rename upstream trips these rather than
 * silently zeroing a dial. Strings resolve through an injected `t`, so
 * the assertions check i18n KEYS (+ interpolation params), not English.
 */

import { describe, it, expect } from "vitest";

import {
  clampScore,
  currentLevel,
  nextLevel,
  buildJobSeekerGauge,
  buildCreatorGauge,
  buildHiringGauge,
  buildRecruiterGauge,
  buildGamificationGauge,
  type GaugeLevel,
  type GaugeT,
} from "../gauge";
import type { JobSeekerDashboard } from "@/lib/services/dashboard-service";
import type { CreatorRollup } from "@/lib/services/artifact-view-service";
import type {
  PointsSummary,
  PointsCatalog,
} from "@/lib/services/points-service";

// Stub translator — echoes the key, appending interpolation params so we
// can assert both the chosen key and the values fed into it.
const t: GaugeT = (key, params) =>
  params
    ? `${key}|${Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join(",")}`
    : key;

const LEVELS: GaugeLevel[] = [
  { name: "A", min: 0 },
  { name: "B", min: 40 },
  { name: "C", min: 80 },
];

describe("clampScore", () => {
  it("rounds and clamps into 0–100", () => {
    expect(clampScore(42.4)).toBe(42);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(Number.NaN)).toBe(0);
  });
});

describe("level helpers", () => {
  it("resolves current and next tiers around boundaries", () => {
    expect(currentLevel(0, LEVELS).name).toBe("A");
    expect(currentLevel(40, LEVELS).name).toBe("B"); // inclusive lower bound
    expect(currentLevel(79, LEVELS).name).toBe("B");
    expect(currentLevel(80, LEVELS).name).toBe("C");
    expect(nextLevel(39, LEVELS)?.name).toBe("B");
    expect(nextLevel(80, LEVELS)).toBeNull(); // top tier → no next
  });
});

// Minimal helper — only the fields the builder reads need to be real.
function seeker(partial: Partial<JobSeekerDashboard>): JobSeekerDashboard {
  return {
    title: "t",
    description: "d",
    metrics: [],
    recentActivity: [],
    recommendations: [],
    onboardingTasks: [],
    onboardingCompletionPercentage: 0,
    lastUpdated: new Date(),
    jobMatches: [],
    upcomingInterviews: [],
    messageStats: { unreadCount: 0, totalConversations: 0, recentMessages: [] },
    ...partial,
  } as JobSeekerDashboard;
}

describe("buildJobSeekerGauge", () => {
  it("scores a brand-new seeker at zero and tells them to publish a resume", () => {
    const g = buildJobSeekerGauge(seeker({}), t);
    expect(g.score).toBe(0);
    expect(g.action).toEqual({
      label: "dashboard.gauge.action.publishResume",
      href: "/studio",
    });
    expect(currentLevel(g.score, g.levels).name).toBe("dashboard.gauge.level.gettingStarted");
    expect(g.hint).toBe("dashboard.gauge.jobseeker.hint.publishResume");
  });

  it("credits a published resume (20pts) and nudges the video resume next", () => {
    const g = buildJobSeekerGauge(
      seeker({ resumeStats: { publishedResumes: 1, videoResumes: 0 } }),
      t,
    );
    expect(g.score).toBe(20);
    expect(g.action?.label).toBe("dashboard.gauge.action.recordVideoResume");
  });

  it("credits resume + video resume (35pts) then points at the profile", () => {
    const g = buildJobSeekerGauge(
      seeker({ resumeStats: { publishedResumes: 2, videoResumes: 1 } }),
      t,
    );
    expect(g.score).toBe(35);
    expect(g.action?.label).toBe("dashboard.gauge.action.finishProfile");
  });

  it("caps every input so a fully-active seeker reads 100 and is Top Talent", () => {
    const g = buildJobSeekerGauge(
      seeker({
        onboardingCompletionPercentage: 100,
        resumeStats: { publishedResumes: 1, videoResumes: 1 },
        applicationStats: {
          totalApplications: 25, // > cap of 10
          pendingApplications: 0,
          interviewRequests: 9, // > cap of 5
          rejectedApplications: 0,
          successRate: 50,
          recentApplications: [],
        },
        profileStats: {
          totalViews: 120, // > cap of 50
          viewsThisWeek: 1,
          viewsThisMonth: 1,
          viewsChangePercentage: 0,
          recentViewers: [],
        },
      }),
      t,
    );
    expect(g.score).toBe(100);
    expect(currentLevel(g.score, g.levels).name).toBe("dashboard.gauge.level.topTalent");
    // Everything done → nudge back to applying.
    expect(g.action).toEqual({ label: "dashboard.gauge.action.applyToJobs", href: "/jobs" });
  });
});

describe("buildCreatorGauge", () => {
  it("returns a zero Newcomer dial for null/empty rollups", () => {
    const g = buildCreatorGauge(null, t);
    expect(g.score).toBe(0);
    expect(currentLevel(g.score, g.levels).name).toBe("dashboard.gauge.level.newcomer");
    expect(g.hint).toBe("dashboard.gauge.creator.hint.first");
  });

  it("rewards volume + reach toward Influencer", () => {
    const rollup: CreatorRollup = {
      totals: {
        totalViews: 1000,
        uniqueViewers: 200,
        countriesReached: 10,
        artifactCount: 12,
      },
      countries: [],
      referrers: [],
      artifacts: [],
    };
    const g = buildCreatorGauge(rollup, t);
    expect(g.score).toBe(100);
    expect(currentLevel(g.score, g.levels).name).toBe("dashboard.gauge.level.influencer");
  });
});

describe("buildHiringGauge", () => {
  it("empty-states to a Post-a-job CTA when there are no stats", () => {
    const g = buildHiringGauge({}, t);
    expect(g.score).toBe(0);
    expect(g.action).toEqual({ label: "dashboard.gauge.action.postJob", href: "/jobs/create" });
  });

  it("blends applications, qualified ratio and fill rate", () => {
    const g = buildHiringGauge(
      {
        jobPostingStats: {
          activeJobs: 0,
          totalApplications: 50, // appsScore = 100 (weight .4)
          filledPositions: 3, // fillScore = 100 (weight .3)
          averageTimeToFill: 10,
        },
        candidateStats: {
          totalCandidates: 10,
          newCandidates: 2,
          qualifiedCandidates: 10, // qualScore = 100 (weight .3)
          interviewedCandidates: 4,
        },
      },
      t,
    );
    expect(g.score).toBe(100);
    expect(currentLevel(g.score, g.levels).name).toBe("dashboard.gauge.level.thriving");
    expect(g.action?.label).toBe("dashboard.gauge.action.postJob"); // no active roles
  });

  it("routes to the pipeline once roles are active", () => {
    const g = buildHiringGauge(
      {
        jobPostingStats: { activeJobs: 2, totalApplications: 5, filledPositions: 0, averageTimeToFill: 0 },
      },
      t,
    );
    expect(g.action).toEqual({
      label: "dashboard.gauge.action.reviewPipeline",
      href: "/recruiter/pipeline",
    });
  });
});

describe("buildRecruiterGauge", () => {
  it("empty-states to Source-candidates when the funnel is empty", () => {
    const g = buildRecruiterGauge({}, t);
    expect(g.score).toBe(0);
    expect(g.action).toEqual({
      label: "dashboard.gauge.action.sourceCandidates",
      href: "/recruiter/pipeline",
    });
    expect(g.hint).toBe("dashboard.gauge.recruiter.hint.empty");
  });

  it("blends submission volume, advancement and placement rate", () => {
    const g = buildRecruiterGauge(
      {
        submissionStats: {
          total: 30, // volScore = 100 (weight .4)
          submitted: 0,
          interviewing: 10,
          offered: 10,
          placed: 10, // advancing = 30 → advScore = 100 (weight .3)
          withdrawn: 0,
        },
        placementStats: { totalPlacements: 10, placementRate: 100, totalCommissionEarned: 5000 }, // .3
      },
      t,
    );
    expect(g.score).toBe(100);
    expect(currentLevel(g.score, g.levels).name).toBe("dashboard.gauge.level.thriving");
    expect(g.action?.label).toBe("dashboard.gauge.action.reviewPipeline");
  });
});

function summary(partial: Partial<PointsSummary>): PointsSummary {
  return {
    balance: 0,
    lifetimeEarned: 0,
    lifetimeRedeemed: 0,
    isSuspended: false,
    suspendedReason: null,
    streak: { current: 0, longest: 0, lastActivityDate: null },
    userTaskGate: { completed: 0, threshold: 3, unlocked: true },
    badges: [],
    recentActivity: [],
    ...partial,
  };
}

const catalog: PointsCatalog = {
  actions: [],
  redemptions: [
    { id: "a", kind: "ai_credits", label: "100 AI credits", pointsCost: 500 },
    { id: "b", kind: "gift_card", label: "$25 gift card", pointsCost: 2500 },
  ],
};

describe("buildGamificationGauge", () => {
  it("hides itself for suspended accounts", () => {
    expect(buildGamificationGauge(summary({ isSuspended: true }), catalog, t)).toBeNull();
  });

  it("tracks the unlock gate before rewards are available", () => {
    const g = buildGamificationGauge(
      summary({ userTaskGate: { completed: 1, threshold: 3, unlocked: false } }),
      catalog,
      t,
    );
    expect(g?.title).toBe("dashboard.gauge.unlock.title");
    expect(g?.score).toBe(33); // 1/3
    expect(g?.hint).toBe("dashboard.gauge.unlock.hint|remaining=2");
  });

  it("tracks balance toward the cheapest cash-out once unlocked", () => {
    const g = buildGamificationGauge(summary({ balance: 250 }), catalog, t);
    expect(g?.title).toBe("dashboard.gauge.rewards.title");
    expect(g?.score).toBe(50); // 250 / cheapest(500)
    expect(g?.hint).toContain("dashboard.gauge.rewards.hint.progress");
    expect(g?.hint).toContain("remaining=250");
    expect(g?.hint).toContain("label=100 AI credits");
  });

  it("celebrates + notes the streak when the balance covers a redemption", () => {
    const g = buildGamificationGauge(
      summary({ balance: 600, streak: { current: 4, longest: 4, lastActivityDate: null } }),
      catalog,
      t,
    );
    expect(g?.score).toBe(100);
    expect(g?.hint).toContain("dashboard.gauge.rewards.hint.ready");
    // streak param itself resolves through t with n=4
    expect(g?.hint).toContain("dashboard.gauge.rewards.streakNote|n=4");
  });

  it("returns null when unlocked but no redemptions exist", () => {
    expect(
      buildGamificationGauge(summary({ balance: 100 }), { actions: [], redemptions: [] }, t),
    ).toBeNull();
  });
});

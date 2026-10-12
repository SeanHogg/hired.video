import { describe, it, expect } from "vitest";
import {
  earnGroupFor,
  groupJobSeekerRules,
  isJobSeekerAudience,
  isJobSeekerRule,
} from "@/lib/rewards/earning-rules";
import { STREAK_MILESTONES, streakTrackPosition } from "@/lib/rewards/streak-track";

// Shapes mirror real /api/points/catalog rows (api/src/domains/gamification/rules.ts).
const GENERAL = ["job_seeker", "recruiter", "employer", "creator"];
const catalog = [
  { key: "task.complete.system", label: "Completed an onboarding / system task", roles: ["job_seeker"], points: 15, dailyCapPoints: null, requiresUserTaskGate: false },
  { key: "application.submitted", label: "Submitted a job application", roles: ["job_seeker"], points: 50, dailyCapPoints: 500, requiresUserTaskGate: false },
  { key: "feed.post.created", label: "Posted to the social feed", roles: GENERAL, points: 10, dailyCapPoints: 50, requiresUserTaskGate: false },
  { key: "lesson.completed", label: "Completed a lesson", roles: GENERAL, points: 10, requiresUserTaskGate: false },
  { key: "course.published", label: "Published a course", roles: GENERAL, points: 100, requiresUserTaskGate: false },
  { key: "streak.bonus", label: "Streak bonus", roles: ["job_seeker"], points: 0, requiresUserTaskGate: false },
  { key: "badge.unlocked", label: "Badge unlocked", roles: GENERAL, points: 0, requiresUserTaskGate: false },
  { key: "admin.adjust", label: "Manual adjustment", roles: [], points: 0, requiresUserTaskGate: false },
  { key: "recruiter.candidate.placed", label: "Placed a candidate", roles: ["recruiter"], points: 500, requiresUserTaskGate: false },
  { key: "employer.job.posted", label: "Posted a job", roles: ["employer"], points: 20, requiresUserTaskGate: false },
  { key: "purchase.any", label: "Made a purchase", roles: ["job_seeker"], points: 25, requiresUserTaskGate: false },
  { key: "brand_new.thing", label: "Something new", roles: [], points: 5, requiresUserTaskGate: false },
];

describe("isJobSeekerAudience", () => {
  it("accepts everyone (empty roles) and job-seeker lists", () => {
    expect(isJobSeekerAudience({ roles: [] })).toBe(true);
    expect(isJobSeekerAudience({ roles: GENERAL })).toBe(true);
  });
  it("rejects recruiter / employer only", () => {
    expect(isJobSeekerAudience({ roles: ["recruiter"] })).toBe(false);
    expect(isJobSeekerAudience({ roles: ["employer", "recruiter"] })).toBe(false);
  });
});

describe("isJobSeekerRule", () => {
  it("drops streak./badge./admin. bookkeeping keys even when the role matches", () => {
    expect(isJobSeekerRule({ key: "streak.bonus", roles: ["job_seeker"] })).toBe(false);
    expect(isJobSeekerRule({ key: "badge.unlocked", roles: GENERAL })).toBe(false);
    expect(isJobSeekerRule({ key: "admin.adjust", roles: [] })).toBe(false);
  });
  it("keeps job-seeker and everyone rules, drops role-specific others", () => {
    expect(isJobSeekerRule({ key: "application.submitted", roles: ["job_seeker"] })).toBe(true);
    expect(isJobSeekerRule({ key: "brand_new.thing", roles: [] })).toBe(true);
    expect(isJobSeekerRule({ key: "recruiter.bid.won", roles: ["recruiter"] })).toBe(false);
  });
});

describe("earnGroupFor", () => {
  it("maps known prefixes", () => {
    expect(earnGroupFor("application.submitted")).toBe("jobHunt");
    expect(earnGroupFor("cover_letter.generated")).toBe("jobHunt");
    expect(earnGroupFor("feed.post.created")).toBe("getSeen");
    expect(earnGroupFor("lesson.completed")).toBe("learn");
  });
  it("lets exact keys override a prefix", () => {
    expect(earnGroupFor("course.passed")).toBe("learn");
    expect(earnGroupFor("course.published")).toBe("getSeen");
  });
  it("sends unknown keys to 'other' instead of dropping them", () => {
    expect(earnGroupFor("purchase.any")).toBe("other");
    expect(earnGroupFor("")).toBe("other");
  });
});

describe("groupJobSeekerRules", () => {
  it("filters, buckets and orders groups; keeps catalog order inside a group", () => {
    const groups = groupJobSeekerRules(catalog);
    expect(groups.map((g) => g.group)).toEqual(["jobHunt", "getSeen", "learn", "other"]);
    expect(groups[0].rules.map((r) => r.key)).toEqual(["task.complete.system", "application.submitted"]);
    expect(groups[1].rules.map((r) => r.key)).toEqual(["feed.post.created", "course.published"]);
    expect(groups[3].rules.map((r) => r.key)).toEqual(["purchase.any", "brand_new.thing"]);
    const all = groups.flatMap((g) => g.rules.map((r) => r.key));
    expect(all).not.toContain("recruiter.candidate.placed");
    expect(all).not.toContain("streak.bonus");
  });
  it("returns no groups for an empty or recruiter-only catalog", () => {
    expect(groupJobSeekerRules([])).toEqual([]);
    expect(groupJobSeekerRules([{ key: "recruiter.bid.won", roles: ["recruiter"] }])).toEqual([]);
  });
});

describe("streakTrackPosition", () => {
  it("starts at zero with the first milestone next", () => {
    const p = streakTrackPosition(0);
    expect(p).toEqual({ percent: 0, reached: 0, next: STREAK_MILESTONES[0] });
  });
  it("treats negative / NaN as zero", () => {
    expect(streakTrackPosition(-4).percent).toBe(0);
    expect(streakTrackPosition(Number.NaN).percent).toBe(0);
  });
  it("sits exactly on a milestone when reached", () => {
    const p = streakTrackPosition(14);
    expect(p.reached).toBe(2);
    expect(p.percent).toBeCloseTo(40);
    expect(p.next?.day).toBe(30);
  });
  it("interpolates between milestones", () => {
    // halfway between 30 (60%) and 60 (80%)
    expect(streakTrackPosition(45).percent).toBeCloseTo(70);
  });
  it("caps at 100 past the top tier", () => {
    expect(streakTrackPosition(400)).toEqual({ percent: 100, reached: 5, next: null });
  });
});

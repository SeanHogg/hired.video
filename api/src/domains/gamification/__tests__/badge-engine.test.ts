/**
 * Badge engine — pure evaluator tests (threshold unlock + no double-unlock).
 *
 * Run: node --import tsx --test src/domains/gamification/__tests__/badge-engine.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { evaluateBadges, type BadgeEvaluationInput } from "../badge-engine.js";
import type { PointsCountersRow } from "../../../repositories/pointsRepository.js";

const counters = (over: Partial<PointsCountersRow> = {}): PointsCountersRow =>
  ({
    userId: "u-1",
    userTaskCompletions: 0,
    systemTaskCompletions: 0,
    updatedAt: new Date(),
    ...over,
  }) as PointsCountersRow;

const input = (over: Partial<BadgeEvaluationInput>): BadgeEvaluationInput => ({
  action: "application.submitted",
  counters: counters(),
  totalEarnsForAction: 1,
  alreadyEarnedSlugs: new Set<string>(),
  ...over,
});

describe("badge-engine — threshold unlock", () => {
  it("unlocks first_application on the first submission", () => {
    const out = evaluateBadges(input({ action: "application.submitted", totalEarnsForAction: 1 }));
    assert.deepEqual(out, ["first_application"]);
  });

  it("unlocks applications_10 (and only it) on the 10th, when the first is held", () => {
    const out = evaluateBadges(
      input({
        action: "application.submitted",
        totalEarnsForAction: 10,
        alreadyEarnedSlugs: new Set(["first_application"]),
      }),
    );
    assert.deepEqual(out, ["applications_10"]);
  });

  it("unlocks both lower + higher tier when neither is held yet", () => {
    const out = evaluateBadges(input({ action: "application.submitted", totalEarnsForAction: 50 }));
    // Lower tiers evaluated first → order preserved.
    assert.deepEqual(out, ["first_application", "applications_10", "applications_50"]);
  });

  it("unlocks get_it_done from the combined task counter", () => {
    const out = evaluateBadges(
      input({ action: "task.complete.system", counters: counters({ systemTaskCompletions: 1 }) }),
    );
    assert.ok(out.includes("get_it_done"));
  });

  it("unlocks hundred_tasks at 100 user-task completions", () => {
    const out = evaluateBadges(
      input({
        action: "task.complete.user",
        counters: counters({ userTaskCompletions: 100 }),
        alreadyEarnedSlugs: new Set(["get_it_done"]),
      }),
    );
    assert.deepEqual(out, ["hundred_tasks"]);
  });
});

describe("badge-engine — no double-unlock", () => {
  it("returns nothing when the badge is already earned", () => {
    const out = evaluateBadges(
      input({
        action: "application.submitted",
        totalEarnsForAction: 1,
        alreadyEarnedSlugs: new Set(["first_application"]),
      }),
    );
    assert.deepEqual(out, []);
  });

  it("returns nothing for an action with no badge mapping", () => {
    const out = evaluateBadges(input({ action: "session.daily", totalEarnsForAction: 1 }));
    assert.deepEqual(out, []);
  });
});

describe("badge-engine — new surfaces (gap #1966)", () => {
  it("unlocks event_host_first on the first event created", () => {
    assert.deepEqual(evaluateBadges(input({ action: "event.created" })), ["event_host_first"]);
  });

  it("shares event_attendee_first across register + attend actions", () => {
    assert.deepEqual(evaluateBadges(input({ action: "event.registered" })), ["event_attendee_first"]);
    assert.deepEqual(evaluateBadges(input({ action: "event.attended" })), ["event_attendee_first"]);
  });

  it("unlocks session host tiers (first + 10th)", () => {
    assert.deepEqual(evaluateBadges(input({ action: "booking.session.completed", totalEarnsForAction: 1 })), [
      "session_host_first",
    ]);
    assert.deepEqual(
      evaluateBadges(
        input({
          action: "booking.session.completed",
          totalEarnsForAction: 10,
          alreadyEarnedSlugs: new Set(["session_host_first"]),
        }),
      ),
      ["session_host_10"],
    );
  });

  it("unlocks first_article + articles_10 tiers", () => {
    assert.deepEqual(evaluateBadges(input({ action: "article.published", totalEarnsForAction: 1 })), [
      "first_article",
    ]);
    assert.deepEqual(evaluateBadges(input({ action: "article.published", totalEarnsForAction: 10 })), [
      "first_article",
      "articles_10",
    ]);
  });

  it("maps reference given vs received to distinct badges", () => {
    assert.deepEqual(evaluateBadges(input({ action: "reference.given" })), ["reference_given_first"]);
    assert.deepEqual(evaluateBadges(input({ action: "reference.received" })), ["reference_received_first"]);
  });

  it("unlocks first_company_review", () => {
    assert.deepEqual(evaluateBadges(input({ action: "company_review.posted" })), ["first_company_review"]);
  });

  it("maps cohort educator / student / assignment to distinct badges", () => {
    assert.deepEqual(evaluateBadges(input({ action: "cohort.created" })), ["educator_first_cohort"]);
    assert.deepEqual(evaluateBadges(input({ action: "cohort.student.joined" })), ["student_enrolled"]);
    assert.deepEqual(evaluateBadges(input({ action: "cohort.assignment.completed" })), [
      "first_assignment_completed",
    ]);
  });

  it("awards one studio_creator_first badge across game / comic / podcast publishes", () => {
    for (const action of ["studio.game.published", "studio.comic.published", "studio.podcast.published"]) {
      assert.deepEqual(evaluateBadges(input({ action })), ["studio_creator_first"]);
    }
    // Already held → no re-award regardless of which create kind fires.
    assert.deepEqual(
      evaluateBadges(input({ action: "studio.comic.published", alreadyEarnedSlugs: new Set(["studio_creator_first"]) })),
      [],
    );
  });
});

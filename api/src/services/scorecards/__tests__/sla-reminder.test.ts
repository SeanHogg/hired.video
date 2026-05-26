import { describe, expect, it } from "vitest";
import {
  planScorecardReminderSweep,
  type ReminderPlanInput,
} from "../sla-reminder.js";

const HOUR = 60 * 60 * 1000;

const sub = (overrides: Partial<ReminderPlanInput> = {}): ReminderPlanInput => ({
  id: "s1",
  evaluatorUserId: "u1",
  applicationId: "app1",
  dueAt: new Date("2026-05-25T12:00:00Z"),
  remindedAt: null,
  escalatedAt: null,
  ...overrides,
});

describe("planScorecardReminderSweep", () => {
  it("emits a remind when now is within the 4h horizon and no remind sent yet", () => {
    const plan = planScorecardReminderSweep({
      now: new Date("2026-05-25T09:00:00Z"), // 3h before due
      horizonMs: 4 * HOUR,
      escalateAfterMs: 24 * HOUR,
      candidates: [sub()],
    });
    expect(plan.reminders).toHaveLength(1);
    expect(plan.escalations).toHaveLength(0);
  });

  it("does NOT emit a remind when one was already sent inside the cycle", () => {
    const plan = planScorecardReminderSweep({
      now: new Date("2026-05-25T09:30:00Z"),
      horizonMs: 4 * HOUR,
      escalateAfterMs: 24 * HOUR,
      candidates: [sub({ remindedAt: new Date("2026-05-25T09:00:00Z") })],
    });
    expect(plan.reminders).toHaveLength(0);
  });

  it("emits a remind when previous remind was BEFORE the current cycle started", () => {
    // dueAt 12:00, horizon 4h, cycle starts at 08:00. A remind at 06:00
    // is from a previous cycle (e.g. an earlier due_at that got pushed
    // back), so we re-remind.
    const plan = planScorecardReminderSweep({
      now: new Date("2026-05-25T09:00:00Z"),
      horizonMs: 4 * HOUR,
      escalateAfterMs: 24 * HOUR,
      candidates: [sub({ remindedAt: new Date("2026-05-25T06:00:00Z") })],
    });
    expect(plan.reminders).toHaveLength(1);
  });

  it("emits an escalation 24h past due with no prior escalation", () => {
    const plan = planScorecardReminderSweep({
      now: new Date("2026-05-26T13:00:00Z"), // 25h past due
      horizonMs: 4 * HOUR,
      escalateAfterMs: 24 * HOUR,
      candidates: [sub()],
    });
    expect(plan.escalations).toHaveLength(1);
  });

  it("does NOT escalate twice", () => {
    const plan = planScorecardReminderSweep({
      now: new Date("2026-05-26T13:00:00Z"),
      horizonMs: 4 * HOUR,
      escalateAfterMs: 24 * HOUR,
      candidates: [sub({ escalatedAt: new Date("2026-05-26T12:30:00Z") })],
    });
    expect(plan.escalations).toHaveLength(0);
  });

  it("emits BOTH a remind and an escalation in the same sweep when warranted", () => {
    // Past due 25h. Horizon-based remind eligibility started 4h before
    // dueAt — long since elapsed. No prior reminders. Both fire.
    const plan = planScorecardReminderSweep({
      now: new Date("2026-05-26T13:00:00Z"),
      horizonMs: 4 * HOUR,
      escalateAfterMs: 24 * HOUR,
      candidates: [sub()],
    });
    expect(plan.reminders).toHaveLength(1);
    expect(plan.escalations).toHaveLength(1);
  });

  it("is a no-op when now is before the reminder horizon", () => {
    const plan = planScorecardReminderSweep({
      now: new Date("2026-05-25T06:00:00Z"), // 6h before due, horizon 4h
      horizonMs: 4 * HOUR,
      escalateAfterMs: 24 * HOUR,
      candidates: [sub()],
    });
    expect(plan.reminders).toHaveLength(0);
    expect(plan.escalations).toHaveLength(0);
  });
});

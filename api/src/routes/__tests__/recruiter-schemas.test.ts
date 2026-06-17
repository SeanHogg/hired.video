/**
 * Tests for the Zod schemas in `recruiter.ts` — schema-test backfill for the
 * PRIORITY slice of gap #1528.
 *
 * Every validator in recruiter.ts is an un-exported route-local `const`, so to
 * keep all edits inside `__tests__/` (the route file is intentionally NOT
 * modified to add exports) the schemas are reconstructed here VERBATIM from
 * `api/src/routes/recruiter.ts`:
 *
 *   IntakeSchema                = z.object({...})   (line 1131)
 *   ScheduleFollowupSchema      = z.object({...})   (line 1182)
 *   ExtractProfileSchema        = z.object({...})   (line 1287)
 *   ProfileExtractionResponse   = z.object({...})   (line 1293)
 *   ExtractProfilesBatchSchema  = z.object({...})   (line 1544)
 *   RecruiterListSchema         = z.object({...})   (line 1789)
 *   OutreachStepSchema          = z.object({...})   (line 1907)
 *   OutreachSequenceSchema      = z.object({...})   (line 1916)
 *
 * `UuidLikeSchema` (shared/validation.ts) IS exported and imported from the
 * real source of truth. `jobId` / `runId` / `candidateId` are DB-row ids, so
 * the #1522 seed-derived-UUID regression is exercised where they appear.
 *
 * Run: node --import tsx --test src/routes/__tests__/recruiter-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { UuidLikeSchema } from "../../../../shared/validation.js";
import {
  SEED_DERIVED_UUID,
  V4_UUID,
} from "../../../../shared/__tests__/uuid-fixtures.js";

// Verbatim mirrors of the un-exported schemas in `recruiter.ts`. See the file
// header for why they are reconstructed rather than imported.
const IntakeSchema = z.object({
  briefText: z.string().optional(),
  jobId: UuidLikeSchema.optional(),
});

const ScheduleFollowupSchema = z.object({
  runId: UuidLikeSchema,
  candidateId: UuidLikeSchema,
  followupKind: z.string().min(1).max(32).optional().default("first_followup"),
  sequenceIndex: z.number().int().min(1).max(10).optional().default(1),
  scheduledFor: z.string().datetime().optional(),
  dayOffset: z.number().int().min(0).max(180).optional(),
  body: z.string().min(1).max(8000),
});

const ExtractProfileSchema = z.object({
  html: z.string().min(50),
  sourceUrl: z.string().min(1),
  force: z.boolean().optional(),
});

const ProfileExtractionResponseSchema = z.object({
  name: z.string(),
  title: z.string().optional().default(""),
  company: z.string().optional().default(""),
  location: z.string().optional().default(""),
  skills: z.array(z.string()).optional().default([]),
  experience: z
    .array(
      z.object({
        title: z.string().optional().default(""),
        company: z.string().optional().default(""),
        duration: z.string().optional().default(""),
        description: z.string().optional().default(""),
      }),
    )
    .optional()
    .default([]),
  education: z
    .array(
      z.object({
        degree: z.string().optional().default(""),
        institution: z.string().optional().default(""),
        year: z.string().optional().default(""),
      }),
    )
    .optional()
    .default([]),
  summary: z.string().optional().default(""),
  contactInfo: z
    .object({
      email: z.string().optional().default(""),
      phone: z.string().optional().default(""),
      linkedin: z.string().optional().default(""),
      github: z.string().optional().default(""),
      twitter: z.string().optional().default(""),
      website: z.string().optional().default(""),
    })
    .optional()
    .default({ email: "", phone: "", linkedin: "", github: "", twitter: "", website: "" }),
});

const ExtractProfilesBatchSchema = z.object({
  sourceUrl: z.string().min(1),
  cards: z.array(z.string().min(50)).min(1).max(25),
  force: z.boolean().optional(),
});

const RecruiterListSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  kind: z.enum(["list", "call_queue"]).default("list"),
});

const OutreachStepSchema = z.object({
  channel: z.enum(["email", "message", "sms"]),
  delayDays: z.number().int().min(0).max(365),
  subject: z.string().optional(),
  body: z.string().min(1),
  aiPersonalize: z.boolean().optional(),
});

const OutreachSequenceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  steps: z.array(OutreachStepSchema).min(1).max(10),
  isActive: z.boolean().optional(),
});

const CARD = "c".repeat(50);

describe("IntakeSchema", () => {
  it("accepts a briefText-only payload", () => {
    assert.equal(IntakeSchema.safeParse({ briefText: "Need a dev" }).success, true);
  });
  it("accepts a jobId-only payload", () => {
    assert.equal(IntakeSchema.safeParse({ jobId: V4_UUID }).success, true);
  });
  it("accepts a seed-derived jobId (gap #1522 regression)", () => {
    assert.equal(IntakeSchema.safeParse({ jobId: SEED_DERIVED_UUID }).success, true);
  });
  it("accepts an empty payload (both fields optional — handler enforces XOR)", () => {
    assert.equal(IntakeSchema.safeParse({}).success, true);
  });
  it("rejects a malformed jobId", () => {
    assert.equal(IntakeSchema.safeParse({ jobId: "bad" }).success, false);
  });
  it("rejects a non-string briefText (wrong type)", () => {
    assert.equal(IntakeSchema.safeParse({ briefText: 7 }).success, false);
  });
});

describe("ScheduleFollowupSchema", () => {
  const valid = {
    runId: V4_UUID,
    candidateId: V4_UUID,
    body: "Following up",
  } as const;

  it("accepts a minimal payload and applies defaults", () => {
    const r = ScheduleFollowupSchema.safeParse(valid);
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.followupKind, "first_followup");
      assert.equal(r.data.sequenceIndex, 1);
    }
  });
  it("accepts seed-derived runId + candidateId (gap #1522 regression)", () => {
    assert.equal(
      ScheduleFollowupSchema.safeParse({
        ...valid,
        runId: SEED_DERIVED_UUID,
        candidateId: SEED_DERIVED_UUID,
      }).success,
      true,
    );
  });
  it("accepts sequenceIndex=10 (max boundary)", () => {
    assert.equal(
      ScheduleFollowupSchema.safeParse({ ...valid, sequenceIndex: 10 }).success,
      true,
    );
  });
  it("rejects sequenceIndex=11 (above max)", () => {
    assert.equal(
      ScheduleFollowupSchema.safeParse({ ...valid, sequenceIndex: 11 }).success,
      false,
    );
  });
  it("rejects sequenceIndex=0 (below min)", () => {
    assert.equal(
      ScheduleFollowupSchema.safeParse({ ...valid, sequenceIndex: 0 }).success,
      false,
    );
  });
  it("accepts dayOffset=0 and dayOffset=180 (boundaries)", () => {
    assert.equal(
      ScheduleFollowupSchema.safeParse({ ...valid, dayOffset: 0 }).success,
      true,
    );
    assert.equal(
      ScheduleFollowupSchema.safeParse({ ...valid, dayOffset: 180 }).success,
      true,
    );
  });
  it("rejects dayOffset=181 (above max)", () => {
    assert.equal(
      ScheduleFollowupSchema.safeParse({ ...valid, dayOffset: 181 }).success,
      false,
    );
  });
  it("accepts an 8000-char body (max boundary)", () => {
    assert.equal(
      ScheduleFollowupSchema.safeParse({ ...valid, body: "b".repeat(8000) }).success,
      true,
    );
  });
  it("rejects an 8001-char body (above max)", () => {
    assert.equal(
      ScheduleFollowupSchema.safeParse({ ...valid, body: "b".repeat(8001) }).success,
      false,
    );
  });
  it("rejects an empty followupKind when present (min(1))", () => {
    assert.equal(
      ScheduleFollowupSchema.safeParse({ ...valid, followupKind: "" }).success,
      false,
    );
  });
  it("rejects a missing runId (required field)", () => {
    const { runId, ...rest } = valid;
    assert.equal(ScheduleFollowupSchema.safeParse(rest).success, false);
  });
  it("rejects a missing body (required field)", () => {
    const { body, ...rest } = valid;
    assert.equal(ScheduleFollowupSchema.safeParse(rest).success, false);
  });
});

describe("ExtractProfileSchema", () => {
  const html = "h".repeat(50);
  it("accepts a valid payload", () => {
    assert.equal(
      ExtractProfileSchema.safeParse({ html, sourceUrl: "https://x.com" }).success,
      true,
    );
  });
  it("accepts a 50-char html (min boundary)", () => {
    assert.equal(
      ExtractProfileSchema.safeParse({ html: "h".repeat(50), sourceUrl: "x" }).success,
      true,
    );
  });
  it("rejects a 49-char html (below min)", () => {
    assert.equal(
      ExtractProfileSchema.safeParse({ html: "h".repeat(49), sourceUrl: "x" }).success,
      false,
    );
  });
  it("rejects an empty sourceUrl (below min)", () => {
    assert.equal(
      ExtractProfileSchema.safeParse({ html, sourceUrl: "" }).success,
      false,
    );
  });
  it("rejects a missing html (required field)", () => {
    assert.equal(ExtractProfileSchema.safeParse({ sourceUrl: "x" }).success, false);
  });
});

describe("ProfileExtractionResponseSchema", () => {
  it("accepts a name-only payload and applies all defaults", () => {
    const r = ProfileExtractionResponseSchema.safeParse({ name: "Ada" });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.title, "");
      assert.deepEqual(r.data.skills, []);
      assert.deepEqual(r.data.experience, []);
      assert.equal(r.data.contactInfo.email, "");
    }
  });
  it("accepts a fully-populated payload", () => {
    assert.equal(
      ProfileExtractionResponseSchema.safeParse({
        name: "Ada",
        title: "Engineer",
        company: "Acme",
        skills: ["go", "ts"],
        experience: [{ title: "Dev", company: "Acme" }],
        education: [{ degree: "BS", institution: "MIT" }],
        contactInfo: { email: "a@b.com" },
      }).success,
      true,
    );
  });
  it("rejects a missing name (required field)", () => {
    assert.equal(ProfileExtractionResponseSchema.safeParse({}).success, false);
  });
  it("rejects a non-string name (wrong type)", () => {
    assert.equal(ProfileExtractionResponseSchema.safeParse({ name: 5 }).success, false);
  });
  it("rejects a non-array skills (wrong type)", () => {
    assert.equal(
      ProfileExtractionResponseSchema.safeParse({ name: "Ada", skills: "go" }).success,
      false,
    );
  });
});

describe("ExtractProfilesBatchSchema", () => {
  it("accepts a single-card payload", () => {
    assert.equal(
      ExtractProfilesBatchSchema.safeParse({ sourceUrl: "x", cards: [CARD] }).success,
      true,
    );
  });
  it("accepts 25 cards (max boundary)", () => {
    assert.equal(
      ExtractProfilesBatchSchema.safeParse({ sourceUrl: "x", cards: Array(25).fill(CARD) }).success,
      true,
    );
  });
  it("rejects 26 cards (above max)", () => {
    assert.equal(
      ExtractProfilesBatchSchema.safeParse({ sourceUrl: "x", cards: Array(26).fill(CARD) }).success,
      false,
    );
  });
  it("rejects an empty cards array (below min)", () => {
    assert.equal(
      ExtractProfilesBatchSchema.safeParse({ sourceUrl: "x", cards: [] }).success,
      false,
    );
  });
  it("rejects a card under 50 chars (per-item min)", () => {
    assert.equal(
      ExtractProfilesBatchSchema.safeParse({ sourceUrl: "x", cards: ["short"] }).success,
      false,
    );
  });
  it("rejects a missing sourceUrl (required field)", () => {
    assert.equal(
      ExtractProfilesBatchSchema.safeParse({ cards: [CARD] }).success,
      false,
    );
  });
});

describe("RecruiterListSchema", () => {
  it("accepts a name-only payload and defaults kind to 'list'", () => {
    const r = RecruiterListSchema.safeParse({ name: "Hot leads" });
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data.kind, "list");
  });
  it("accepts kind='call_queue'", () => {
    assert.equal(
      RecruiterListSchema.safeParse({ name: "Q", kind: "call_queue" }).success,
      true,
    );
  });
  it("accepts a 255-char name (max boundary)", () => {
    assert.equal(
      RecruiterListSchema.safeParse({ name: "n".repeat(255) }).success,
      true,
    );
  });
  it("rejects a 256-char name (above max)", () => {
    assert.equal(
      RecruiterListSchema.safeParse({ name: "n".repeat(256) }).success,
      false,
    );
  });
  it("rejects an empty name (below min)", () => {
    assert.equal(RecruiterListSchema.safeParse({ name: "" }).success, false);
  });
  it("rejects a missing name (required field)", () => {
    assert.equal(RecruiterListSchema.safeParse({}).success, false);
  });
  it("rejects an unknown kind (enum edge)", () => {
    assert.equal(
      RecruiterListSchema.safeParse({ name: "Q", kind: "queue" }).success,
      false,
    );
  });
});

describe("OutreachStepSchema", () => {
  const valid = { channel: "email", delayDays: 0, body: "hi" } as const;
  it("accepts a valid step", () => {
    assert.equal(OutreachStepSchema.safeParse(valid).success, true);
  });
  it("accepts each valid channel", () => {
    for (const channel of ["email", "message", "sms"]) {
      assert.equal(
        OutreachStepSchema.safeParse({ ...valid, channel }).success,
        true,
        channel,
      );
    }
  });
  it("accepts delayDays=0 and delayDays=365 (boundaries)", () => {
    assert.equal(OutreachStepSchema.safeParse({ ...valid, delayDays: 0 }).success, true);
    assert.equal(OutreachStepSchema.safeParse({ ...valid, delayDays: 365 }).success, true);
  });
  it("rejects delayDays=366 (above max)", () => {
    assert.equal(OutreachStepSchema.safeParse({ ...valid, delayDays: 366 }).success, false);
  });
  it("rejects delayDays=-1 (below min)", () => {
    assert.equal(OutreachStepSchema.safeParse({ ...valid, delayDays: -1 }).success, false);
  });
  it("rejects an empty body (below min)", () => {
    assert.equal(OutreachStepSchema.safeParse({ ...valid, body: "" }).success, false);
  });
  it("rejects an unknown channel (enum edge)", () => {
    assert.equal(
      OutreachStepSchema.safeParse({ ...valid, channel: "whatsapp" }).success,
      false,
    );
  });
});

describe("OutreachSequenceSchema", () => {
  const step = { channel: "email", delayDays: 0, body: "hi" } as const;
  it("accepts a valid sequence with one step", () => {
    assert.equal(
      OutreachSequenceSchema.safeParse({ name: "Seq", steps: [step] }).success,
      true,
    );
  });
  it("accepts 10 steps (max boundary)", () => {
    assert.equal(
      OutreachSequenceSchema.safeParse({ name: "Seq", steps: Array(10).fill(step) }).success,
      true,
    );
  });
  it("rejects 11 steps (above max)", () => {
    assert.equal(
      OutreachSequenceSchema.safeParse({ name: "Seq", steps: Array(11).fill(step) }).success,
      false,
    );
  });
  it("rejects an empty steps array (below min)", () => {
    assert.equal(
      OutreachSequenceSchema.safeParse({ name: "Seq", steps: [] }).success,
      false,
    );
  });
  it("rejects a missing name (required field)", () => {
    assert.equal(OutreachSequenceSchema.safeParse({ steps: [step] }).success, false);
  });
  it("rejects a step with an invalid channel (nested validation)", () => {
    assert.equal(
      OutreachSequenceSchema.safeParse({
        name: "Seq",
        steps: [{ channel: "fax", delayDays: 0, body: "hi" }],
      }).success,
      false,
    );
  });
});

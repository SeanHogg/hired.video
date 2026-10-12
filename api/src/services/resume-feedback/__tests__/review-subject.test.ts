/**
 * #2254 — the review aggregate's polymorphic subject (migration 0513).
 *
 *   1. The migration is safe to run as-is in production: additive,
 *      idempotent, a non-destructive backfill, NOT VALID checks gated on
 *      pg_constraint, its index declared in the schema under the same name,
 *      and `subject_id` left push-safe (nullable) so `drizzle-kit push
 *      --force` can never truncate the table to add it.
 *   2. Review rows — legacy (resume_id only, as they were before 0513) and
 *      new — resolve to the right subject, and the service reads, edits and
 *      writes through the subject's adapter; a kind with no adapter yet is
 *      refused.
 *
 * Run: node --import tsx --test src/services/resume-feedback/__tests__/review-subject.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REVIEW_SUBJECT_TYPES } from "../../../../../shared/resume-feedback.js";
import { subjectColumns, subjectOf } from "../review-subjects.js";
import { ResumeFeedbackService } from "../compose.js";
import { ResumeFeedbackServiceError } from "../review-errors.js";
import type {
  IResumeFeedbackRepository,
  ResumeReviewRow,
  ResumeReviewAnnotationRow,
} from "../../../repositories/resumeFeedbackRepository.js";

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const SQL = readFileSync(join(API_ROOT, "drizzle", "0513_review_polymorphic_subject.sql"), "utf8");
const SCHEMA = readFileSync(join(API_ROOT, "src", "db", "schema", "resumeFeedback.ts"), "utf8");
/** Statements only — the header comment talks about what it doesn't do. */
const STATEMENTS = SQL.replace(/^\s*--.*$/gm, "");

describe("0513 — safe to run in production", () => {
  it("adds columns idempotently", () => {
    assert.match(STATEMENTS, /ADD COLUMN IF NOT EXISTS subject_type varchar\(16\) NOT NULL DEFAULT 'resume'/);
    assert.match(STATEMENTS, /ADD COLUMN IF NOT EXISTS subject_id uuid;/);
  });

  it("backfills only rows still missing a subject, from their resume_id — never deletes", () => {
    assert.match(STATEMENTS, /UPDATE resume_reviews SET subject_id = resume_id WHERE subject_id IS NULL AND resume_id IS NOT NULL;/);
    assert.doesNotMatch(STATEMENTS, /\bDELETE\b|\bTRUNCATE\b|DROP COLUMN|DROP TABLE/i);
  });

  it("gates every constraint on pg_constraint and adds it NOT VALID", () => {
    const adds = STATEMENTS.match(/ADD CONSTRAINT (\w+)/g) ?? [];
    assert.equal(adds.length, 2);
    for (const add of adds) {
      const name = add.split(" ").pop();
      assert.match(STATEMENTS, new RegExp(`conname = '${name}'`));
    }
    assert.equal((STATEMENTS.match(/NOT VALID/g) ?? []).length, 2);
  });

  it("the CHECK lists exactly the shared subject types", () => {
    const listed = /subject_type IN \(([^)]*)\)/.exec(STATEMENTS)?.[1] ?? "";
    assert.deepEqual(listed.split(",").map((s) => s.trim().replace(/'/g, "")), [...REVIEW_SUBJECT_TYPES]);
  });

  it("declares its index in the schema under the same name (push drops undeclared ones)", () => {
    assert.match(STATEMENTS, /CREATE INDEX IF NOT EXISTS idx_resume_reviews_subject_created/);
    assert.match(SCHEMA, /index\("idx_resume_reviews_subject_created"\)\.on\(t\.subjectType, t\.subjectId, t\.createdAt\.desc\(\)\.nullsFirst\(\)\)/);
  });

  it("keeps subject_id push-safe: nullable in both the migration and the schema", () => {
    assert.doesNotMatch(STATEMENTS, /subject_id SET NOT NULL/);
    assert.match(SCHEMA, /subjectId: uuid\("subject_id"\),/);
    assert.match(SCHEMA, /resumeId: uuid\("resume_id"\)\.references/);
  });
});

// ── Review rows ──────────────────────────────────────────────────────────────

const OWNER = "11111111-1111-4111-8111-111111111111";
const REVIEWER = "22222222-2222-4222-8222-222222222222";
const RESUME = "33333333-3333-4333-8333-333333333333";
const JOB = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-10-10T12:00:00Z");

function reviewRow(over: Partial<ResumeReviewRow> = {}): ResumeReviewRow {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    subjectType: "resume",
    subjectId: RESUME,
    resumeId: RESUME,
    ownerId: OWNER,
    reviewerId: REVIEWER,
    reviewerEmail: "mentor@example.com",
    reviewerName: "Dana Mentor",
    shareToken: "a".repeat(64),
    source: "self_share",
    coachingInquiryId: null,
    title: "Director résumé",
    status: "active",
    message: null,
    expiresAt: null,
    submittedAt: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe("subjectOf / subjectColumns", () => {
  it("a row written before 0513 (no subject yet) reads as its résumé", () => {
    assert.deepEqual(subjectOf(reviewRow({ subjectType: "resume", subjectId: null })), { type: "resume", id: RESUME });
  });

  it("a backfilled / new row reads its own subject", () => {
    assert.deepEqual(subjectOf(reviewRow()), { type: "resume", id: RESUME });
    assert.deepEqual(subjectOf(reviewRow({ subjectType: "job", subjectId: JOB, resumeId: null })), { type: "job", id: JOB });
  });

  it("only a résumé subject fills the résumé FK", () => {
    assert.deepEqual(subjectColumns({ type: "resume", id: RESUME }), { subjectType: "resume", subjectId: RESUME, resumeId: RESUME });
    assert.deepEqual(subjectColumns({ type: "job", id: JOB }), { subjectType: "job", subjectId: JOB, resumeId: null });
  });
});

/** An in-memory repo holding one résumé, a review and its annotations. */
function fakeRepo(review: ResumeReviewRow, annotations: ResumeReviewAnnotationRow[] = []) {
  const content = {
    basics: { name: "Ana Ruiz", summary: "Results-driven professional with 15 years of experience." },
    work: [{ id: "w1", name: "Acme Health", position: "Director of IT", highlights: ["Responsible for vendor management"] }],
  };
  const state = { content: content as unknown, inserted: [] as unknown[], saved: [] as Array<{ id: string; content: unknown }> };
  const repo: Partial<IResumeFeedbackRepository> = {
    findReviewById: async (id) => (id === review.id ? review : null),
    findResumeContentSlice: async (id) => (id === RESUME ? { id: RESUME, userId: OWNER, title: "Director résumé", content: state.content } : null),
    updateResumeContent: async (id, next) => {
      state.saved.push({ id, content: next });
      state.content = next;
    },
    insertReview: async (input) => {
      state.inserted.push(input);
      return reviewRow({ ...(input as Partial<ResumeReviewRow>) });
    },
    listAnnotations: async () => annotations,
    listProposalsForReview: async () => [],
    findUserContacts: async () => [],
    findAnnotationById: async (id) => annotations.find((a) => a.id === id) ?? null,
    updateAnnotation: async (id, patch) => ({ ...annotations.find((a) => a.id === id)!, ...(patch as object) }) as ResumeReviewAnnotationRow,
    updateReview: async (_id, patch) => ({ ...review, ...(patch as object) }) as ResumeReviewRow,
  };
  const service = new ResumeFeedbackService({
    repo: repo as IResumeFeedbackRepository,
    now: () => NOW,
    randomBytes: (n) => new Uint8Array(n).fill(7),
  });
  return { service, state };
}

describe("ResumeFeedbackService through the subject adapter", () => {
  it("a new review is written with its résumé subject", async () => {
    const { service, state } = fakeRepo(reviewRow());
    const dto = await service.createReview(OWNER, { resumeId: RESUME, source: "self_share" });
    assert.deepEqual(
      (state.inserted[0] as Record<string, unknown>).subjectType,
      "resume",
    );
    assert.equal((state.inserted[0] as Record<string, unknown>).subjectId, RESUME);
    assert.equal(dto.subjectType, "resume");
    assert.equal(dto.subjectId, RESUME);
    assert.equal(dto.resumeId, RESUME);
  });

  it("a legacy review row opens with the résumé it was about", async () => {
    const { service } = fakeRepo(reviewRow({ subjectId: null }));
    const detail = await service.getReviewDetail(reviewRow().id, OWNER);
    assert.equal(detail.resume.id, RESUME);
    assert.equal(detail.review.subjectId, RESUME);
  });

  it("accepting a structured suggested edit writes the field through the adapter (#2220)", async () => {
    const annotation: ResumeReviewAnnotationRow = {
      id: "66666666-6666-4666-8666-666666666666",
      reviewId: reviewRow().id,
      authorId: REVIEWER,
      kind: "highlight",
      body: "Lead with the outcome",
      color: null,
      status: "open",
      pageId: null,
      anchor: { type: "content", sectionKey: "work", referenceId: "w1", fieldPath: "highlights[0]", quote: "vendor management" },
      suggestedEdit: { sectionKey: "work", referenceId: "w1", fieldPath: "highlights[0]", before: "Responsible for vendor management", after: "Cut vendor spend 18% across 12 contracts" },
      parentAnnotationId: null,
      resolvedByUserId: null,
      resolvedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const { service, state } = fakeRepo(reviewRow(), [annotation]);
    const out = await service.acceptAnnotation(annotation.id, OWNER);
    assert.equal(out.appliedEdit, true);
    assert.equal(state.saved[0].id, RESUME);
    const saved = state.saved[0].content as { work: Array<{ highlights: string[] }> };
    assert.deepEqual(saved.work[0].highlights, ["Cut vendor spend 18% across 12 contracts"]);
  });

  it("a review of a kind with no adapter yet is refused, not mis-read as a résumé", async () => {
    const { service } = fakeRepo(reviewRow({ subjectType: "job", subjectId: JOB, resumeId: null }));
    await assert.rejects(
      () => service.getReviewDetail(reviewRow().id, OWNER),
      (e: unknown) => e instanceof ResumeFeedbackServiceError && e.code === "INVALID_STATE",
    );
  });
});

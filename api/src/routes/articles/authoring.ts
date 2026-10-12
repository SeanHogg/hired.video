/**
 * Owner endpoints: create, list mine, read / update / delete, and the
 * review lifecycle (submit-for-review with the moderation gate, withdraw,
 * unpublish). `/me` is registered before `/:id`.
 */
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import type { AppEnv } from "../../types/index.js";
import { success, error } from "../../types/index.js";
import { buildAIErrorEnvelope } from "../../services/adapters/llm-error.js";
import { getDb, schema } from "../../db/index.js";
import { slugify } from "../../../../shared/slugify.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import { gateForSeverity, toFindings } from "../../services/articles/moderation-classifier.js";
import { NotificationService } from "../../services/notifications/notificationService.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";
import { getArticlesEnrollment, uid, readMinutes, runArticleClassifier, CreateArticleSchema, UpdateArticleSchema } from "./shared.js";

const { articles, users } = schema;

export const articleAuthoringRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Owner endpoints
// ---------------------------------------------------------------------------

articleAuthoringRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = CreateArticleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const enrollment = await getArticlesEnrollment(db, userId);
  if (!enrollment) {
    return c.json(
      error(
        "PROGRAM_NOT_ENROLLED",
        "Articles publishing requires enrollment in the Articles Creator Program. Visit /services to enroll.",
      ),
      403,
    );
  }

  let baseSlug = slugify(parsed.data.title, { fallback: () => `article-${Date.now()}` });
  let slug = baseSlug;
  let n = 1;
  while (true) {
    const [exists] = await db.select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.userId, userId), eq(articles.slug, slug)))
      .limit(1);
    if (!exists) break;
    n += 1;
    slug = `${baseSlug}-${n}`;
    if (n > 50) { slug = `${baseSlug}-${Date.now()}`; break; }
  }

  const [created] = await db.insert(articles).values({
    userId,
    slug,
    title: parsed.data.title,
    bodyMd: parsed.data.bodyMd ?? "",
    bodyJson: (parsed.data.bodyJson ?? null) as any,
    summary: parsed.data.summary ?? null,
    coverImageUrl: parsed.data.coverImageUrl ?? null,
    category: parsed.data.category ?? null,
    tags: parsed.data.tags ?? [],
    sector: parsed.data.sector ?? null,
    audience: parsed.data.audience ?? null,
    kind: parsed.data.kind ?? "article",
    status: "draft",
    readMinutes: readMinutes(parsed.data.bodyMd ?? ""),
  }).returning();
  return c.json(success(created), 201);
});

articleAuthoringRoutes.get("/me", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db.select().from(articles)
    .where(eq(articles.userId, userId))
    .orderBy(desc(articles.updatedAt));
  return c.json(success(rows), 200);
});

articleAuthoringRoutes.get("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [row] = await db.select().from(articles)
    .where(and(eq(articles.id, c.req.param("id")), eq(articles.userId, userId)))
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Article not found"), 404);
  return c.json(success(row), 200);
});

articleAuthoringRoutes.patch("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = UpdateArticleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const db = getDb();
  const [existing] = await db.select().from(articles)
    .where(and(eq(articles.id, c.req.param("id")), eq(articles.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Article not found"), 404);
  // Editing is blocked while a submission is in the SA queue — creator must
  // withdraw first. Published articles can still be edited (changes don't go
  // live until a new submit-for-review + SA approval cycle).
  if (existing.status === "submitted") {
    return c.json(
      error("LOCKED_FOR_REVIEW", "Withdraw from review before editing."),
      409,
    );
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.bodyMd !== undefined) {
    patch.bodyMd = parsed.data.bodyMd;
    patch.readMinutes = readMinutes(parsed.data.bodyMd);
  }
  if (parsed.data.bodyJson !== undefined) patch.bodyJson = parsed.data.bodyJson;
  if (parsed.data.summary !== undefined) patch.summary = parsed.data.summary;
  if (parsed.data.coverImageUrl !== undefined) patch.coverImageUrl = parsed.data.coverImageUrl;
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.tags !== undefined) patch.tags = parsed.data.tags;
  if (parsed.data.slug !== undefined) patch.slug = parsed.data.slug;
  if (parsed.data.kind !== undefined) patch.kind = parsed.data.kind;
  if (parsed.data.sector !== undefined) patch.sector = parsed.data.sector || null;
  if (parsed.data.audience !== undefined) patch.audience = parsed.data.audience || null;

  // A rejected article being edited bumps back to draft so the creator
  // re-submits cleanly. Published edits leave status alone (they're a fresh
  // revision of an already-live article until the next submit cycle).
  if (existing.status === "rejected") {
    patch.status = "draft";
    patch.rejectionReason = null;
    patch.rejectedAt = null;
    patch.rejectedBy = null;
  }

  const [updated] = await db.update(articles).set(patch as any)
    .where(eq(articles.id, existing.id)).returning();
  // Title/summary edits surface in unified search for published articles.
  bumpSearchVersion();
  return c.json(success(updated), 200);
});

articleAuthoringRoutes.post("/:id/submit-for-review", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();

  const enrollment = await getArticlesEnrollment(db, userId);
  if (!enrollment) {
    return c.json(
      error(
        "PROGRAM_NOT_ENROLLED",
        "Re-enable the Articles Creator Program at /services to submit.",
      ),
      403,
    );
  }

  const [existing] = await db.select().from(articles)
    .where(and(eq(articles.id, c.req.param("id")), eq(articles.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Article not found"), 404);
  if (!existing.title.trim() || !existing.bodyMd.trim()) {
    return c.json(error("VALIDATION_ERROR", "Title and body are required to submit"), 400);
  }
  if (existing.status === "submitted") {
    return c.json(error("ALREADY_SUBMITTED", "Already in the review queue."), 409);
  }

  // Auto-run the article moderation/quality classifier inline (#1512). This is
  // the SAME classifier the author-triggered POST /:id/classify uses, so a
  // submission's quality_score + partner_program_eligible are set the moment it
  // enters review — no separate manual classify step, and the SA sees the
  // findings without burning a second LLM call.
  let classified: Awaited<ReturnType<typeof runArticleClassifier>>;
  try {
    classified = await runArticleClassifier(c, existing);
  } catch (e) {
    // #529: an exhausted AI plan during classification surfaces the upgrade
    // banner; genuine classifier faults keep the specific CLASSIFIER_FAILED code.
    const envelope = buildAIErrorEnvelope(e);
    if (envelope) return c.json(error(envelope.code, envelope.message, envelope.payload), envelope.status);
    return c.json(error("CLASSIFIER_FAILED", e instanceof Error ? e.message : String(e)), 502);
  }
  const { result, gate } = classified;
  const findings = toFindings(result);
  const now = new Date();
  const qualityFields = {
    qualityScore: result.qualityScore,
    qualityRationale: result.qualityRationale,
    qualityCheckedAt: now,
    moderationScore: result.qualityScore,
    moderationFindings: findings,
    moderationScannedAt: now,
    moderationScannedBy: userId,
  };

  // block | high (slurs / harassment / illegal) bounce straight back to the
  // author instead of entering the SA queue. Creator can revise and re-submit.
  if (result.findings.severity === "block" || result.findings.severity === "high") {
    const [rejected] = await db.update(articles).set({
      ...qualityFields,
      status: "rejected",
      rejectionReason:
        "Automatic rejection: content failed moderation. " +
        (findings.rationale ?? "Please revise and re-submit."),
      rejectedAt: now,
      partnerProgramEligible: false,
      updatedAt: now,
    } as any).where(eq(articles.id, existing.id)).returning();
    return c.json(success(rejected), 200);
  }

  // low | medium → enters the SA review queue and is marked partner-eligible
  // (gateForSeverity). Earning still requires status='published' downstream.
  const [updated] = await db.update(articles).set({
    ...qualityFields,
    status: "submitted",
    submittedForReviewAt: now,
    partnerProgramEligible: gate.partnerProgramEligible,
    updatedAt: now,
  } as any).where(eq(articles.id, existing.id)).returning();

  // Ping reviewers (SuperAdmins) that a new submission landed in the queue
  // (#898). Best-effort, non-blocking — never fail the submit on a notify hiccup.
  void (async () => {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, USER_ROLES.SUPER_ADMIN));
    for (const admin of admins) {
      await NotificationService.notify({
        userId: admin.id,
        type: "review",
        title: `New ${existing.kind} awaiting review`,
        message: existing.title,
        url: `/admin/articles`,
        refType: "article",
        refId: existing.id,
        push: false,
      });
    }
  })();

  return c.json(success(updated), 200);
});

articleAuthoringRoutes.post("/:id/withdraw", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [updated] = await db.update(articles)
    .set({
      status: "draft",
      submittedForReviewAt: null,
      updatedAt: new Date(),
    } as any)
    .where(and(
      eq(articles.id, c.req.param("id")),
      eq(articles.userId, userId),
      eq(articles.status, "submitted"),
    ))
    .returning();
  if (!updated) return c.json(error("NOT_FOUND", "Article not found or not in review"), 404);
  return c.json(success(updated), 200);
});

articleAuthoringRoutes.post("/:id/unpublish", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [updated] = await db.update(articles)
    .set({ status: "draft", publishedAt: null, updatedAt: new Date() } as any)
    .where(and(eq(articles.id, c.req.param("id")), eq(articles.userId, userId)))
    .returning();
  if (!updated) return c.json(error("NOT_FOUND", "Article not found"), 404);
  bumpSearchVersion();
  return c.json(success(updated), 200);
});

articleAuthoringRoutes.delete("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [deleted] = await db.delete(articles)
    .where(and(eq(articles.id, c.req.param("id")), eq(articles.userId, userId)))
    .returning({ id: articles.id });
  if (!deleted) return c.json(error("NOT_FOUND", "Article not found"), 404);
  bumpSearchVersion();
  return c.json(success({ deleted: deleted.id }), 200);
});

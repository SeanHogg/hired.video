/**
 * Pipeline share-link routes — separate aggregate from the pipeline entries
 * themselves. Owners create / revoke tokenised links; the public portal
 * reads the redacted snapshot via shareToken (no auth).
 *
 * Mounted in app.ts as:
 *   /api/jobs/:jobId/pipeline/share          (owner CRUD; share fragment of the kanban)
 *   /api/pipeline/public                      (public read of the kanban)
 */
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { randomHex } from "../utils/crypto.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requireJobOwner } from "../services/jobs/jobOwnership.js";
import { loadPortalStages } from "../services/pipeline/pipelinePortalSnapshot.js";

export const pipelineShareRoutes = new Hono<AppEnv>();
export const pipelinePublicRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// POST /share — create a link
// ---------------------------------------------------------------------------
pipelineShareRoutes.post("/", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const userId = c.var.user?.sub as string;
  const body = await c.req.json().catch(() => ({}));
  const label = typeof body?.label === "string" ? body.label.slice(0, 200) : null;
  const expiresAtRaw = typeof body?.expiresAt === "string" ? body.expiresAt : null;

  const token = randomHex(24);
  const db = getDb();
  const [link] = await db
    .insert(schema.pipelineShareLinks)
    .values({
      jobId,
      shareToken: token,
      label,
      expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : null,
      createdByUserId: userId,
    } as typeof schema.pipelineShareLinks.$inferInsert)
    .returning();

  return c.json(success(link), 201);
});

// ---------------------------------------------------------------------------
// GET /share — list owner's links
// ---------------------------------------------------------------------------
pipelineShareRoutes.get("/", async (c) => {
  const jobId = c.req.param("jobId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const db = getDb();
  const links = await db
    .select()
    .from(schema.pipelineShareLinks)
    .where(eq(schema.pipelineShareLinks.jobId, jobId))
    .orderBy(desc(schema.pipelineShareLinks.createdAt));

  return c.json(success({ links }), 200);
});

// ---------------------------------------------------------------------------
// DELETE /share/:linkId — revoke
// ---------------------------------------------------------------------------
pipelineShareRoutes.delete("/:linkId", async (c) => {
  const jobId = c.req.param("jobId");
  const linkId = c.req.param("linkId");
  const { denied } = await requireJobOwner(c, jobId);
  if (denied) return denied;

  const db = getDb();
  const [removed] = await db
    .delete(schema.pipelineShareLinks)
    .where(
      and(
        eq(schema.pipelineShareLinks.id, linkId),
        eq(schema.pipelineShareLinks.jobId, jobId),
      ),
    )
    .returning({ id: schema.pipelineShareLinks.id });

  if (!removed) return c.json(error("NOT_FOUND", "Share link not found"), 404);
  return c.json(success({ id: removed.id }), 200);
});

// ---------------------------------------------------------------------------
// Public read — no auth. Returns a redacted snapshot (no email/phone) so
// hiring managers see candidate progression (and revealed candidates' video
// pitches) without PII leaking.
// ---------------------------------------------------------------------------
pipelinePublicRoutes.get("/:shareToken", async (c) => {
  const shareToken = c.req.param("shareToken");
  const db = getDb();

  const [link] = await db
    .select()
    .from(schema.pipelineShareLinks)
    .where(eq(schema.pipelineShareLinks.shareToken, shareToken))
    .limit(1);
  if (!link) return c.json(error("NOT_FOUND", "Share link not found"), 404);
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return c.json(error("EXPIRED", "Share link has expired"), 410);
  }

  const [job] = await db
    .select({
      id: schema.jobItems.id,
      title: schema.jobItems.title,
      company: schema.jobItems.company,
    })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, link.jobId))
    .limit(1);
  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);

  // Same redaction as the recruiter kanban (#1679 / #2133): confidential
  // candidates — identity AND video pitch — stay hidden until shortlist.
  // Pitches are batch-loaded once for the page.
  const { stages, total } = await loadPortalStages(link.jobId);

  return c.json(
    success({
      job: { id: job.id, title: job.title, company: job.company },
      label: link.label,
      stages,
      total,
    }),
    200,
  );
});

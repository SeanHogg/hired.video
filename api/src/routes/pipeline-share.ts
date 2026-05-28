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
import { randomBytes } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { requireJobOwner } from "../services/jobs/jobOwnership.js";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  maskConfidentialCandidate,
} from "../../../shared/recruiter-pipeline.js";
import { confidentialCandidateIds } from "../services/pipeline/PipelineService.js";

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

  const token = randomBytes(24).toString("hex");
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
// hiring managers see candidate progression without PII leaking.
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

  const rawEntries = await db
    .select({
      id: schema.jobPipelineEntries.id,
      stage: schema.jobPipelineEntries.stage,
      candidateUserId: schema.jobPipelineEntries.candidateUserId,
      candidateName: schema.jobPipelineEntries.candidateName,
      candidateLocation: schema.jobPipelineEntries.candidateLocation,
      candidateAvatarUrl: schema.jobPipelineEntries.candidateAvatarUrl,
      tags: schema.jobPipelineEntries.tags,
      stageChangedAt: schema.jobPipelineEntries.stageChangedAt,
      addedFrom: schema.jobPipelineEntries.addedFrom,
    })
    .from(schema.jobPipelineEntries)
    .where(eq(schema.jobPipelineEntries.jobId, link.jobId))
    .orderBy(desc(schema.jobPipelineEntries.stageChangedAt));

  // Confidential-applicant masking (#1679) — same gate as the recruiter
  // kanban: hidden until shortlist. The hiring-manager portal is an
  // employer-facing surface, so it must honor it too.
  const confidential = await confidentialCandidateIds(
    rawEntries.map((e) => e.candidateUserId).filter(Boolean) as string[],
  );
  const entries = rawEntries.map((e) =>
    maskConfidentialCandidate(e, {
      isConfidential: !!e.candidateUserId && confidential.has(e.candidateUserId),
      stage: (e.stage as string) ?? "applied",
    }),
  );

  const grouped: Record<string, typeof entries> = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s, [] as typeof entries]),
  );
  for (const e of entries) {
    const s = (e.stage as string) ?? "applied";
    if (grouped[s]) grouped[s].push(e);
  }

  return c.json(
    success({
      job: { id: job.id, title: job.title, company: job.company },
      label: link.label,
      stages: PIPELINE_STAGES.map((stage) => ({
        stage,
        label: PIPELINE_STAGE_LABELS[stage],
        entries: grouped[stage] ?? [],
        count: (grouped[stage] ?? []).length,
      })),
      total: entries.length,
    }),
    200,
  );
});

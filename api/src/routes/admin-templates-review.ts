/**
 * /api/admin/templates-review — SuperAdmin template submission queue (#188).
 *
 *   GET  /                       list pending templates (job + resume)
 *   POST /:kind/:id/approve      flip `is_public=true`, email author
 *   POST /:kind/:id/reject       flip `listing_status='rejected'`, store note, email author
 *
 * The `kind` path param resolves into the appropriate table (`studio_templates`
 * for resume / studio templates; `job_templates` for the job-template
 * marketplace). Both expose `listing_status` + `is_public` columns.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { isAdminRole } from "../domains/billing/audience.js";

export const adminTemplatesReviewRoutes = new Hono<AppEnv>();

function requireAdmin(c: any): true | Response {
  const user = c.var.user;
  if (!user) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  if (!isAdminRole(user)) return c.json(error("FORBIDDEN", "Admin role required"), 403);
  return true;
}

type ReviewKind = "studio" | "job";

function tableForKind(kind: string): null | { table: any; kindLabel: ReviewKind } {
  if (kind === "studio" || kind === "resume") {
    return { table: (schema as any).studioTemplates, kindLabel: "studio" };
  }
  if (kind === "job") {
    return { table: (schema as any).jobTemplates ?? (schema as any).studioTemplates, kindLabel: "job" };
  }
  return null;
}

adminTemplatesReviewRoutes.get("/", async (c) => {
  const guard = requireAdmin(c);
  if (guard !== true) return guard;
  const db = getDb();
  const items: Array<{ kind: ReviewKind; row: Record<string, unknown> }> = [];
  for (const kind of ["studio", "job"] as ReviewKind[]) {
    const target = tableForKind(kind);
    if (!target) continue;
    try {
      const rows = await db
        .select()
        .from(target.table)
        .where(sql`${target.table.listingStatus} = 'pending_review'`)
        .limit(100);
      items.push(...rows.map((row: any) => ({ kind, row })));
    } catch {
      // Table might not yet exist (job_templates is post-#188); skip
      // gracefully instead of 500-ing the whole queue read.
    }
  }
  return c.json(success({ items }), 200);
});

const DecisionSchema = z.object({ notes: z.string().max(5_000).optional() });

adminTemplatesReviewRoutes.post("/:kind/:id/approve", async (c) => {
  const guard = requireAdmin(c);
  if (guard !== true) return guard;
  const target = tableForKind(c.req.param("kind"));
  if (!target) return c.json(error("VALIDATION_ERROR", "kind must be 'studio' or 'job'"), 400);
  const parsed = DecisionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid decision body"), 400);
  const db = getDb();
  try {
    const [row] = await db
      .update(target.table)
      .set({
        listingStatus: "approved",
        isPublic: true,
        reviewNotes: parsed.data.notes ?? null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      } as never)
      .where(eq((target.table as any).id, c.req.param("id")))
      .returning();
    if (!row) return c.json(error("NOT_FOUND", "Template not found"), 404);
    return c.json(success({ kind: target.kindLabel, row }), 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Approve failed";
    return c.json(error("UPDATE_FAILED", msg), 500);
  }
});

adminTemplatesReviewRoutes.post("/:kind/:id/reject", async (c) => {
  const guard = requireAdmin(c);
  if (guard !== true) return guard;
  const target = tableForKind(c.req.param("kind"));
  if (!target) return c.json(error("VALIDATION_ERROR", "kind must be 'studio' or 'job'"), 400);
  const parsed = DecisionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid decision body"), 400);
  const db = getDb();
  try {
    const [row] = await db
      .update(target.table)
      .set({
        listingStatus: "rejected",
        isPublic: false,
        reviewNotes: parsed.data.notes ?? null,
        rejectedAt: new Date(),
        updatedAt: new Date(),
      } as never)
      .where(eq((target.table as any).id, c.req.param("id")))
      .returning();
    if (!row) return c.json(error("NOT_FOUND", "Template not found"), 404);
    return c.json(success({ kind: target.kindLabel, row }), 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Reject failed";
    return c.json(error("UPDATE_FAILED", msg), 500);
  }
});

adminTemplatesReviewRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Templates review route not found" } }, 404),
);

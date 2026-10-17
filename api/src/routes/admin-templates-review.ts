/**
 * /api/admin/templates-review — template submission queue (#188). Mounted by
 * the admin composite (routes/admin/index.ts), which applies the admin guard
 * (Admin or SuperAdmin).
 *
 *   GET  /                       list pending templates
 *   POST /:kind/:id/approve      listing_status='approved' + review note
 *   POST /:kind/:id/reject       listing_status='rejected' + review note
 *
 * `kind` is "studio" (every creator template, résumé ones included) or the
 * legacy "job" — both resolve to studio_templates.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { TemplateReviewRepository, type TemplateDecision } from "../repositories/admin/templateReviewRepository.js";

export const adminTemplatesReviewRoutes = new Hono<AppEnv>();

type ReviewKind = "studio" | "job";
const isReviewKind = (k: string): k is ReviewKind => k === "studio" || k === "job";

adminTemplatesReviewRoutes.get("/", async (c) => {
  const rows = await TemplateReviewRepository.create().listPending();
  return c.json(success({ items: rows.map((row) => ({ kind: "studio" as ReviewKind, row })) }), 200);
});

const DecisionSchema = z.object({ notes: z.string().max(5_000).optional() });

function decide(decision: TemplateDecision) {
  return async (c: Context<AppEnv>) => {
    const kind = c.req.param("kind");
    if (!isReviewKind(kind)) return c.json(error("VALIDATION_ERROR", "kind must be 'studio' or 'job'"), 400);
    const parsed = DecisionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid decision body"), 400);
    try {
      const row = await TemplateReviewRepository.create().decide(c.req.param("id"), decision, parsed.data.notes ?? null);
      if (!row) return c.json(error("NOT_FOUND", "Template not found"), 404);
      return c.json(success({ kind, row }), 200);
    } catch (err) {
      const fallback = decision === "approved" ? "Approve failed" : "Reject failed";
      return c.json(error("UPDATE_FAILED", err instanceof Error ? err.message : fallback), 500);
    }
  };
}

adminTemplatesReviewRoutes.post("/:kind/:id/approve", decide("approved"));
adminTemplatesReviewRoutes.post("/:kind/:id/reject", decide("rejected"));

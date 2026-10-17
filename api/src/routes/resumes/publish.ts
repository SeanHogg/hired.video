/**
 * /api/resumes — the public / shared surface (optional-auth in app.ts).
 *
 *   GET /public               discovery feed (?page, ?limit, ?fields= projection #1370)
 *   GET /public/:slug         one public résumé by slug or id (records a view)
 *   GET /embedded/:identifier embed read — no view recorded; `?pt=` partner token
 *   GET /:id/export           ?format=json|md|pdf|docx (owner only)
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { RESUME_LIST_FIELDS, parseFields, projectRows } from "../../../../shared/projection.js";
import { requireActiveConnection } from "../../services/partner/connections.js";
import { verifyEmbedToken } from "../../services/partner/tokens.js";
import { exportResume, getResume, listPublicResumes } from "../../services/resume/queries.js";
import { parsePagination } from "../../utils/pagination.js";
import { ownerId, respond, resumeDeps, viewerContext } from "./shared.js";

export const resumePublishRoutes = new Hono<AppEnv>();

resumePublishRoutes.get("/public", (c) => {
  const fields = parseFields(c.req.query("fields"), RESUME_LIST_FIELDS);
  const page = listPublicResumes(
    resumeDeps(c),
    c.var.user?.sub ?? null,
    parsePagination(c, { defaultLimit: 20, maxLimit: 100 }),
  ).then((data) =>
    // Résumé `content` is a heavy JSONB blob; list views rarely need it.
    fields ? { ...data, items: projectRows(data.items as unknown as Array<Record<string, unknown>>, fields) } : data,
  );
  return respond(c, page);
});

resumePublishRoutes.get("/public/:slug", (c) => respond(c, getResume(resumeDeps(c), viewerContext(c), c.req.param("slug"))));

/** A partner embed token → the user it grants owner-level read for, or null
 *  when invalid/expired or the connection was revoked. */
async function partnerEmbedViewer(pt: string): Promise<string | null> {
  try {
    const payload = await verifyEmbedToken(pt);
    await requireActiveConnection(payload.p, payload.u);
    return payload.u;
  } catch {
    return null;
  }
}

// A job seeker who consented to a partner can have even a PRIVATE résumé
// embedded there: the signed token grants owner-level read for THAT user
// only (getResume still requires viewerId === owner), and the consent
// re-check means a revoke cuts off live embeds.
resumePublishRoutes.get("/embedded/:identifier", async (c) => {
  const pt = c.req.query("pt");
  const viewerId = (pt ? await partnerEmbedViewer(pt) : null) ?? c.var.user?.sub ?? null;
  return respond(
    c,
    getResume(resumeDeps(c), viewerContext(c, viewerId), c.req.param("identifier"), { recordView: false }),
  );
});

resumePublishRoutes.get("/:id/export", async (c) => {
  try {
    const file = await exportResume(resumeDeps(c), ownerId(c), c.req.param("id"), c.req.query("format") ?? "json");
    return new Response(file.body, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        ...(file.extraHeaders ?? {}),
      },
    });
  } catch (err) {
    return respond(c, Promise.reject(err));
  }
});

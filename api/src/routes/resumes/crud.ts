/**
 * /api/resumes — list, read, update, delete (+ metadata, diff, slug check).
 *
 *   GET    /                 ?owner=me&view=full|summary|groups&include=ownership&includeArchived=1
 *   GET    /validateslug     ?slug=&resumeId=
 *   GET    /:id              id or slug — optional-auth (owner OR public)
 *   PUT    /:id              UpdateResumeSchema body
 *   DELETE /:id
 *   GET    /:id/metadata  ·  PUT /:id/metadata
 *   GET    /:id/diff         ?compareId=
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { DomainError } from "../../domains/errors.js";
import { RESUME_LIST_VIEWS, type ResumeListView } from "../../../../shared/resume-create.js";
import { deleteResume, updateMetadata, updateResume } from "../../services/resume/commands.js";
import {
  getMetadata,
  getResume,
  getResumeDiff,
  listOwnedResumes,
  validateSlug,
} from "../../services/resume/queries.js";
import { flag, ownerId, respond, resumeDeps, viewerContext, type ResumeCtx } from "./shared.js";

export const resumeCrudRoutes = new Hono<AppEnv>();

async function listForQuery(c: ResumeCtx) {
  const owner = c.req.query("owner") ?? "me";
  if (owner !== "me") throw new DomainError(400, "VALIDATION_ERROR", "owner must be \"me\"");
  const view = c.req.query("view") ?? "full";
  if (!(RESUME_LIST_VIEWS as readonly string[]).includes(view)) {
    throw new DomainError(400, "VALIDATION_ERROR", `view must be one of ${RESUME_LIST_VIEWS.join(", ")}`);
  }
  return listOwnedResumes(resumeDeps(c), ownerId(c), {
    view: view as ResumeListView,
    includeOwnership: (c.req.query("include") ?? "").split(",").includes("ownership"),
    includeArchived: flag(c.req.query("includeArchived")),
  });
}

resumeCrudRoutes.get("/", (c) => respond(c, listForQuery(c)));

resumeCrudRoutes.get("/validateslug", (c) =>
  respond(c, validateSlug(resumeDeps(c), c.req.query("slug") ?? "", c.req.query("resumeId") ?? null)),
);

// Optional-auth (PUBLIC_RESUME_DETAIL_ROUTE in app.ts): owner always wins,
// anyone else only sees a public résumé.
resumeCrudRoutes.get("/:id", (c) => respond(c, getResume(resumeDeps(c), viewerContext(c), c.req.param("id"))));

resumeCrudRoutes.put("/:id", async (c) =>
  respond(c, updateResume(resumeDeps(c), ownerId(c), c.req.param("id"), await c.req.json().catch(() => null))),
);

resumeCrudRoutes.delete("/:id", (c) =>
  respond(c, deleteResume(resumeDeps(c), ownerId(c), c.req.param("id")).then(() => undefined)),
);

resumeCrudRoutes.get("/:id/metadata", (c) => respond(c, getMetadata(resumeDeps(c), ownerId(c), c.req.param("id"))));

resumeCrudRoutes.put("/:id/metadata", async (c) =>
  respond(c, updateMetadata(resumeDeps(c), ownerId(c), c.req.param("id"), await c.req.json().catch(() => null))),
);

resumeCrudRoutes.get("/:id/diff", (c) =>
  respond(c, getResumeDiff(resumeDeps(c), ownerId(c), c.req.param("id"), c.req.query("compareId") ?? null)),
);

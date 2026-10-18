/**
 * /api/recruiter submissions: recruiter → job candidate submissions and
 * the print-ready candidate packet (#243). /submissions/job/:jobId and
 * /submissions/packet are registered before /submissions/:id.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { withGamification } from "../../domains/gamification/with-gamification.js";
import { renderCandidatePacketHtml } from "../../services/recruiter/packet-renderer.js";
import {
  createSubmission,
  getSubmission,
  listSubmissions,
  listSubmissionsByJob,
  updateSubmissionStatus,
  withdrawSubmission,
} from "../../services/recruiter/submissions.js";
import { responseEnvelope } from "./http.js";

export const submissionRoutes = new Hono<AppEnv>();

// GET /submissions/job/:jobId — must be before /:id
submissionRoutes.get("/submissions/job/:jobId", async (c) => {
  return c.json(responseEnvelope(await listSubmissionsByJob(c.var.userId, c.req.param("jobId"))));
});

// POST /submissions — create a submission
submissionRoutes.post("/submissions", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  const sub = await createSubmission(user.sub, body);
  // #1118 — award the recruiter for submitting a candidate. RefId = submission
  // id makes it idempotent across retries; best-effort (never fails the write).
  await withGamification(c, "candidate-submitted", (game, role, uidEarner) =>
    game.onCandidateSubmitted({ userId: uidEarner, role, submissionId: sub.id }),
  );
  return c.json(responseEnvelope(sub));
});

// GET /submissions — list all submissions for current recruiter
submissionRoutes.get("/submissions", async (c) => {
  return c.json(responseEnvelope(await listSubmissions(c.var.userId)));
});

// GET /submissions/packet — print-ready multi-candidate packet (#243), HTML
// for browser print-to-PDF. `ids` = comma-separated submission ids,
// `anonymize=1` hides name/email/photo. Ownership enforced in the renderer.
submissionRoutes.get("/submissions/packet", async (c) => {
  const ids = (c.req.query("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const anonymize = ["1", "true", "yes"].includes((c.req.query("anonymize") ?? "").toLowerCase());
  const html = await renderCandidatePacketHtml(c.var.userId, ids, anonymize);
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

// GET /submissions/:id — single submission
submissionRoutes.get("/submissions/:id", async (c) => {
  const row = await getSubmission(c.var.userId, c.req.param("id"));
  if (!row) return c.json(responseEnvelope(null), 404);
  return c.json(responseEnvelope(row));
});

// PUT /submissions/:id/status — update status
submissionRoutes.put("/submissions/:id/status", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();
  const updated = await updateSubmissionStatus(user.sub, id, body);
  if (!updated) return c.json(responseEnvelope(null), 404);
  return c.json(responseEnvelope(updated));
});

// POST /submissions/:id/withdraw — withdraw a submission
submissionRoutes.post("/submissions/:id/withdraw", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();
  const updated = await withdrawSubmission(user.sub, id, body);
  if (!updated) return c.json(responseEnvelope(null), 404);
  return c.json(responseEnvelope(updated));
});

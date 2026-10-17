/**
 * Resolves the resume text to analyze from a tool-route request body.
 *
 * Two source modes, picked in this order:
 *   1. `resumeText` — the paste-text / file-upload flow sends the raw
 *      content directly because it never lived on a saved resume row.
 *   2. `resumeId`   — the saved-resume flow sends only the id and we
 *      fetch the JSON content server-side via the owner-scoped repo,
 *      so the client never has to ship the full resume payload.
 *
 * Shared by the `resume-optimize` and `resume-score` AI tools
 * so the two surfaces never drift on what counts as a valid request.
 */

import type { Context } from "hono";
import type { Env, Variables, AppEnv } from "../../types/index.js";
import { buildRepos } from "../../repositories/index.js";
import { getDb } from "../../db/index.js";
import { isUuid } from "../../../../shared/value-types.js";

export interface ResolvedResume {
  resumeText: string;
  resumeId?: string;
}

export async function resolveResumeContent(
  c: Context<AppEnv>,
  body: unknown,
): Promise<ResolvedResume> {
  if (typeof body !== "object" || body === null) return { resumeText: "" };
  const b = body as { resumeText?: unknown; resumeId?: unknown };

  const passedResumeId =
    typeof b.resumeId === "string" && isUuid(b.resumeId) ? b.resumeId : undefined;

  if (typeof b.resumeText === "string" && b.resumeText.trim().length > 0) {
    return { resumeText: b.resumeText, resumeId: passedResumeId };
  }

  if (passedResumeId) {
    const ownerId = c.var.user?.sub;
    if (!ownerId) return { resumeText: "", resumeId: passedResumeId };
    const row = await buildRepos(getDb()).resumes.findByIdForOwner(passedResumeId, ownerId);
    if (row?.content) {
      return { resumeText: JSON.stringify(row.content), resumeId: passedResumeId };
    }
    return { resumeText: "", resumeId: passedResumeId };
  }

  return { resumeText: "" };
}

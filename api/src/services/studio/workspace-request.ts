/**
 * Request-side workspace parsing shared by the studio use cases (projects,
 * uploads, brand kits, campaigns): the write target from a body's
 * `workspace` field and the read restriction from a `?workspace=` query.
 * Split out of routes/studio.ts (W2-3a); the auth rules themselves live in
 * ./workspace.ts.
 */
import { resolveWorkspaceForWrite, type WorkspaceSelection } from "./workspace.js";

export interface WorkspaceTarget {
  ownerUserId: string;
  ownerCompanyId: string | null;
}

export type WorkspaceRestriction =
  | { kind: "personal" }
  | { kind: "company"; companyId: string }
  | { kind: "delegated"; subjectUserId: string };

/** Pull the workspace selection from a request body, then verify it.
 *  Throws WorkspaceForbiddenError when the actor can't write there. */
export async function resolveWorkspaceFromBody(
  actorUserId: string,
  body: unknown,
): Promise<WorkspaceTarget> {
  const selection = ((body as { workspace?: WorkspaceSelection } | null)?.workspace ?? null) as WorkspaceSelection;
  const ctx = await resolveWorkspaceForWrite(actorUserId, selection);
  return { ownerUserId: ctx.ownerUserId, ownerCompanyId: ctx.ownerCompanyId };
}

/** Parse `?workspace=` into the read-side restriction shape. Accepts
 *  "personal", "company:<uuid>", "delegated:<uuid>"; anything else (or
 *  absent) → undefined = every workspace the caller can see. Auth is
 *  re-checked by the buildOwnershipFilter caller. */
export function parseWorkspaceQueryParam(raw: string | undefined): WorkspaceRestriction | undefined {
  if (!raw) return undefined;
  if (raw === "personal") return { kind: "personal" };
  const [k, v] = raw.split(":");
  if (k === "company" && v) return { kind: "company", companyId: v };
  if (k === "delegated" && v) return { kind: "delegated", subjectUserId: v };
  return undefined;
}

/**
 * Simple | Advanced — how much of the workspace a viewer sees. It is a
 * VIEW preference, never a different layout: Advanced only appends registry
 * entries (rail tools, ⋯ items, inspector sections, strip tracks) to the same
 * fixed frame (workspace-panels.ts). Pure so the route, the hook and the
 * tests read one rule.
 */
export const WORKSPACE_DEPTHS = ["simple", "advanced"] as const;
export type WorkspaceDepth = (typeof WORKSPACE_DEPTHS)[number];

/** `?depth=` on any workspace URL. */
export const DEPTH_PARAM = "depth";
export const DEPTH_STORAGE_KEY = "workspace.depth";

export function parseDepth(raw: string | null | undefined): WorkspaceDepth | null {
  return raw === "simple" || raw === "advanced" ? raw : null;
}

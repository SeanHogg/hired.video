/**
 * Pure mutation helpers for `BuilderState` — the edit operations the structured
 * builder UI and AI bridge drive (#1955 T0.1). Side-effect-free (no React, no
 * DOM), so they're unit-testable and the UI never inlines tree surgery (DRY —
 * mirrors `document-edit.ts` / `game-state-edit.ts`). Every helper returns a
 * fresh state; callers wrap the result in the history `setState`/`commit` pair.
 */
import { newId } from "@/lib/studio/editor-v2/document-edit";
import type { BuilderNode, BuilderState } from "./builder-state";

/** A fresh empty node of the given type. */
export function makeNode(type: string): BuilderNode {
  return { id: newId("node"), type, fields: {}, children: [] };
}

/** Map every node in the tree, replacing the one matching `id`. */
function mapNode(
  nodes: BuilderNode[],
  id: string,
  fn: (node: BuilderNode) => BuilderNode,
): BuilderNode[] {
  return nodes.map((n) =>
    n.id === id ? fn(n) : { ...n, children: mapNode(n.children, id, fn) },
  );
}

/** Find a node anywhere in the tree (depth-first). */
export function findNode(state: BuilderState, id: string): BuilderNode | null {
  const walk = (nodes: BuilderNode[]): BuilderNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const hit = walk(n.children);
      if (hit) return hit;
    }
    return null;
  };
  return walk(state.nodes);
}

/** Append a node of `type` under `parentId` (or at the top level when null). */
export function addNode(
  state: BuilderState,
  parentId: string | null,
  type: string,
): { state: BuilderState; nodeId: string } {
  const node = makeNode(type);
  if (parentId === null) {
    return { state: { ...state, nodes: [...state.nodes, node] }, nodeId: node.id };
  }
  return {
    state: {
      ...state,
      nodes: mapNode(state.nodes, parentId, (p) => ({
        ...p,
        children: [...p.children, node],
      })),
    },
    nodeId: node.id,
  };
}

/** Remove a node (and its subtree) by id, at any depth. */
export function removeNode(state: BuilderState, id: string): BuilderState {
  const prune = (nodes: BuilderNode[]): BuilderNode[] =>
    nodes
      .filter((n) => n.id !== id)
      .map((n) => ({ ...n, children: prune(n.children) }));
  return { ...state, nodes: prune(state.nodes) };
}

/** Patch a node's `fields` (shallow merge). */
export function updateNodeFields(
  state: BuilderState,
  id: string,
  patch: Record<string, unknown>,
): BuilderState {
  return {
    ...state,
    nodes: mapNode(state.nodes, id, (n) => ({ ...n, fields: { ...n.fields, ...patch } })),
  };
}

/** Move a node one slot up/down within its sibling list (clamps at the ends). */
export function moveNode(
  state: BuilderState,
  id: string,
  direction: "up" | "down",
): BuilderState {
  const reorder = (nodes: BuilderNode[]): BuilderNode[] => {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx >= 0) {
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= nodes.length) return nodes;
      const next = [...nodes];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return next;
    }
    // Not at this level — recurse into children.
    return nodes.map((n) => ({ ...n, children: reorder(n.children) }));
  };
  return { ...state, nodes: reorder(state.nodes) };
}

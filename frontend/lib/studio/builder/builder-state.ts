/**
 * BuilderState — the authoring format for the Studio's NON-paged `structured`
 * runtime (#1918 / #1955 T0.1). It is to ordered-list / nested / DAG content
 * what `DocumentState` is to printable pages: a frontend-side JSONB model the
 * API stores opaquely, mounted by `CanvasRouter` as a self-hosting Studio
 * surface (full shell — outline, undo/redo, AI, save).
 *
 * Unlike `DocumentState` this has NO page geometry — it is a tree of ordered
 * nodes. A flat builder (screening questions, pitch-deck slides) uses only the
 * top level; a nested builder (course modules → lessons) uses `children`. The
 * node TYPES per entity come from `BUILDER_ENTITY_DEFS` (the SSoT), and each
 * node's data is a flat `fields` record driven by the shared field-schema
 * engine (the same `SectionFieldDef` / `FieldGroupEditor` the document canvas
 * uses), so node editors share one form engine (DRY).
 *
 * STRUCTURE vs CONTENT, like the document model: the entity's META (title,
 * pricing, …) lives on the entity row; the BUILDER tree is
 * the body; neither embeds the other. `entityId` binds the saved row.
 *
 * Scope boundary (#1918): structured builders deliberately do NOT live under
 * `DocumentEntityKind` / a Letter sheet — that is the whole point of a second
 * runtime. Geometry (list vs graph) is a per-entity capability here.
 */

export const BUILDER_STATE_VERSION = 1;

/** Entities authored on the structured runtime. */
export const BUILDER_ENTITY_KINDS = [
  "course",
  "screening_template",
  "interview_set",
  "pitch_deck",
  "scorecard",
  "learning_path",
] as const;
export type BuilderEntityKind = (typeof BUILDER_ENTITY_KINDS)[number];

/** A node in the builder tree. `type` is one of the entity's node-type levels
 *  (e.g. "module" | "lesson"); `fields` is the node's schema-driven data;
 *  `children` holds the next level (empty for leaf / flat builders). */
export interface BuilderNode {
  id: string;
  type: string;
  fields: Record<string, unknown>;
  children: BuilderNode[];
}

export interface BuilderState {
  schemaVersion: number;
  entityKind: BuilderEntityKind;
  /** The saved entity row this builder edits. null for a fresh draft. */
  entityId: string | null;
  /** Top-level ordered nodes (modules / questions / slides / steps). */
  nodes: BuilderNode[];
}

// ── Per-entity node-type definitions (SSoT) ──────────────────────────────────

export interface BuilderNodeType {
  /** Stable node `type` value stored on `BuilderNode.type`. */
  type: string;
  /** Singular display noun ("Module", "Lesson", "Question"). */
  label: string;
  /** The node type nested one level under this one, if the entity nests. */
  childType?: string;
}

export interface BuilderEntityDef {
  /** Ordered node-type levels, root first. `levels[0]` is the top-level node;
   *  each level's `childType` (if any) names the next level. */
  levels: BuilderNodeType[];
  /** Whether nodes form a DAG (edges between siblings) vs a pure tree/list.
   *  List/tree ships first; graph mode (learning paths) is a follow-on. */
  graph?: boolean;
}

export const BUILDER_ENTITY_DEFS: Record<BuilderEntityKind, BuilderEntityDef> = {
  course: {
    levels: [
      { type: "module", label: "Module", childType: "lesson" },
      { type: "lesson", label: "Lesson" },
    ],
  },
  screening_template: { levels: [{ type: "question", label: "Question" }] },
  interview_set: { levels: [{ type: "question", label: "Question" }] },
  pitch_deck: { levels: [{ type: "slide", label: "Slide" }] },
  scorecard: { levels: [{ type: "criterion", label: "Criterion" }] },
  learning_path: { levels: [{ type: "step", label: "Step" }], graph: true },
};

/** The top-level node type for an entity (what "+ Add" creates at the root). */
export function rootNodeType(entityKind: BuilderEntityKind): BuilderNodeType {
  return BUILDER_ENTITY_DEFS[entityKind].levels[0];
}

/** Look up a node-type def by its `type` value within an entity. */
export function builderNodeType(
  entityKind: BuilderEntityKind,
  type: string,
): BuilderNodeType | undefined {
  return BUILDER_ENTITY_DEFS[entityKind].levels.find((l) => l.type === type);
}

/** The node type nested under `type`, or undefined when `type` is a leaf. */
export function childTypeOf(
  entityKind: BuilderEntityKind,
  type: string,
): string | undefined {
  return builderNodeType(entityKind, type)?.childType;
}

/** A blank builder for a fresh draft (no nodes — the UI offers "+ Add <root>").
 *  Binds `entityId` when editing an existing row. */
export function createBuilderState(
  entityKind: BuilderEntityKind,
  _idFactory: () => string,
  entityId: string | null = null,
): BuilderState {
  return {
    schemaVersion: BUILDER_STATE_VERSION,
    entityKind,
    entityId,
    nodes: [],
  };
}

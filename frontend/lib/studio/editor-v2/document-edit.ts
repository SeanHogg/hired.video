/**
 * Pure mutation helpers for `DocumentState` — the edit operations the
 * `<DocumentStage>` UI and the AI bridge both drive. Kept side-effect-free
 * (no React, no DOM) so they're unit-testable and the UI never inlines block
 * surgery (DRY, mirrors `game-state-edit.ts`). Every helper returns a fresh
 * state; callers wrap the result in the history `setState`/`commit` pair.
 */

import {
  type BlockBox,
  type DocumentBlock,
  type DocumentBlockKind,
  type DocumentEntityKind,
  type DocumentOverlay,
  type DocumentPage,
  type DocumentState,
  type PageOrientation,
  type PageSize,
} from "./document-state";

/** Stable id for a freshly-inserted block / page / overlay widget. */
export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${rand}`;
}

/** What the user can select on the document canvas. */
export type DocumentSelection =
  | { kind: "page"; pageId: string }
  | { kind: "block"; pageId: string; blockId: string }
  | { kind: "overlay"; pageId: string; overlayId: string };

// ── Block catalog (the left-rail palette source) ─────────────────────────────

export interface DocumentBlockPreset {
  /** The block kind to insert. */
  kind: DocumentBlockKind;
  /** Display label in the palette + default block title. */
  label: string;
  /** For section blocks — the entity content key it binds to. */
  sectionKey?: string;
  /** Default per-block layout for section blocks. */
  layout?: string;
}

// Free-content primitives shared by every entity palette — not bound to entity
// content, so they make sense for resume, job, article, and blog alike.
const FREE_CONTENT_PRESETS: DocumentBlockPreset[] = [
  { kind: "text", label: "Text", layout: undefined },
  { kind: "image", label: "Image", layout: undefined },
  { kind: "divider", label: "Divider", layout: undefined },
  { kind: "spacer", label: "Spacer", layout: undefined },
];

/**
 * Resume section blocks + layout primitives offered in the palette. Section
 * keys + their default layouts mirror the declarative resume template
 * (`frontend/types/resume-template.ts`) so a section dropped here renders the
 * same way the read-only resume does.
 */
export const RESUME_BLOCK_PRESETS: DocumentBlockPreset[] = [
  { kind: "section", label: "Header", sectionKey: "basics", layout: "compact" },
  { kind: "section", label: "Work Experience", sectionKey: "work", layout: "timeline" },
  { kind: "section", label: "Education", sectionKey: "education", layout: "timeline" },
  { kind: "section", label: "Skills", sectionKey: "skills", layout: "grid" },
  { kind: "section", label: "Projects", sectionKey: "projects", layout: "cards" },
  { kind: "section", label: "Volunteer", sectionKey: "volunteer", layout: "timeline" },
  { kind: "section", label: "Certificates", sectionKey: "certificates", layout: "list" },
  { kind: "section", label: "Awards", sectionKey: "awards", layout: "list" },
  { kind: "section", label: "Publications", sectionKey: "publications", layout: "list" },
  { kind: "section", label: "Languages", sectionKey: "languages", layout: "compact" },
  { kind: "section", label: "Interests", sectionKey: "interests", layout: "compact" },
  { kind: "section", label: "References", sectionKey: "references", layout: "list" },
  ...FREE_CONTENT_PRESETS,
];

/**
 * Job-posting section blocks. Section keys match the job field schemas in
 * `document-field-schema.ts` so a section dropped here is field-editable inline
 * and writes back to the bound job's content.
 */
export const JOB_BLOCK_PRESETS: DocumentBlockPreset[] = [
  { kind: "section", label: "Overview", sectionKey: "overview", layout: "prose" },
  { kind: "section", label: "What you'll do", sectionKey: "responsibilities", layout: "list" },
  { kind: "section", label: "Requirements", sectionKey: "requirements", layout: "list" },
  { kind: "section", label: "Compensation & details", sectionKey: "details", layout: "compact" },
  ...FREE_CONTENT_PRESETS,
];

/**
 * The block palette for an entity kind. Single source of truth so the
 * DocumentStage "Add block" menu self-selects the right sections without
 * branching on kind at the call site (DRY). Article/blog have no section model
 * yet (#1914) — they get the free-content primitives only.
 */
export function blockPresetsForEntity(kind: DocumentEntityKind): DocumentBlockPreset[] {
  switch (kind) {
    case "resume":
      return RESUME_BLOCK_PRESETS;
    case "job":
      return JOB_BLOCK_PRESETS;
    case "article":
    case "blog":
      return FREE_CONTENT_PRESETS;
  }
}

// ── Internal page helpers ────────────────────────────────────────────────────

function mapPage(
  state: DocumentState,
  pageId: string,
  fn: (page: DocumentPage) => DocumentPage,
): DocumentState {
  return {
    ...state,
    pages: state.pages.map((p) => (p.id === pageId ? fn(p) : p)),
  };
}

/** The first page — the only page until multi-page lands. */
export function firstPageId(state: DocumentState): string {
  return state.pages[0]?.id ?? "";
}

// ── Block mutations ──────────────────────────────────────────────────────────

export function makeBlock(preset: DocumentBlockPreset): DocumentBlock {
  return {
    id: newId("blk"),
    kind: preset.kind,
    ...(preset.sectionKey ? { sectionKey: preset.sectionKey } : {}),
    ...(preset.label ? { title: preset.label } : {}),
    ...(preset.layout ? { layout: preset.layout } : {}),
    ...(preset.kind === "text" ? { text: "New text block" } : {}),
    mode: "flow",
  };
}

/** Append a block to a page's flow list. */
export function addBlock(
  state: DocumentState,
  pageId: string,
  preset: DocumentBlockPreset,
): { state: DocumentState; blockId: string } {
  const block = makeBlock(preset);
  return {
    state: mapPage(state, pageId, (p) => ({ ...p, blocks: [...p.blocks, block] })),
    blockId: block.id,
  };
}

/** Insert a block immediately BEFORE `beforeId` (drop-at-cursor). When
 *  `beforeId` is null or not found, appends — so it degrades to `addBlock`. */
export function insertBlockAt(
  state: DocumentState,
  pageId: string,
  preset: DocumentBlockPreset,
  beforeId: string | null,
): { state: DocumentState; blockId: string } {
  const block = makeBlock(preset);
  return {
    state: mapPage(state, pageId, (p) => {
      const idx = beforeId ? p.blocks.findIndex((b) => b.id === beforeId) : -1;
      if (idx < 0) return { ...p, blocks: [...p.blocks, block] };
      const blocks = [...p.blocks];
      blocks.splice(idx, 0, block);
      return { ...p, blocks };
    }),
    blockId: block.id,
  };
}

export function removeBlock(
  state: DocumentState,
  pageId: string,
  blockId: string,
): DocumentState {
  return mapPage(state, pageId, (p) => ({
    ...p,
    blocks: p.blocks.filter((b) => b.id !== blockId),
  }));
}

export function updateBlock(
  state: DocumentState,
  pageId: string,
  blockId: string,
  patch: Partial<DocumentBlock>,
): DocumentState {
  return mapPage(state, pageId, (p) => ({
    ...p,
    blocks: p.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
  }));
}

/** Move a flow block one slot up/down within its page. */
export function moveBlock(
  state: DocumentState,
  pageId: string,
  blockId: string,
  direction: "up" | "down",
): DocumentState {
  return mapPage(state, pageId, (p) => {
    const idx = p.blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) return p;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= p.blocks.length) return p;
    const blocks = [...p.blocks];
    const [moved] = blocks.splice(idx, 1);
    blocks.splice(target, 0, moved);
    return { ...p, blocks };
  });
}

/** Detach a flow block to an absolute bounding box, or re-flow an absolute
 *  block. `box` defaults to a centered half-width box when detaching. */
export function setBlockMode(
  state: DocumentState,
  pageId: string,
  blockId: string,
  mode: "flow" | "absolute",
  box?: BlockBox,
): DocumentState {
  const defaultBox: BlockBox = { x: 0.08, y: 0.1, width: 0.4, height: 0.2, z: 1 };
  return updateBlock(state, pageId, blockId, {
    mode,
    ...(mode === "absolute" ? { box: box ?? defaultBox } : { box: undefined }),
  });
}

/** Reposition an absolute block's bounding box. */
export function setBlockBox(
  state: DocumentState,
  pageId: string,
  blockId: string,
  box: BlockBox,
): DocumentState {
  return updateBlock(state, pageId, blockId, { box });
}

// ── Overlay mutations ────────────────────────────────────────────────────────

export function addOverlay(
  state: DocumentState,
  pageId: string,
  overlay: DocumentOverlay,
): DocumentState {
  return mapPage(state, pageId, (p) => ({
    ...p,
    overlays: [...p.overlays, overlay],
  }));
}

export function removeOverlay(
  state: DocumentState,
  pageId: string,
  overlayId: string,
): DocumentState {
  return mapPage(state, pageId, (p) => ({
    ...p,
    overlays: p.overlays.filter((o) => o.widget.id !== overlayId),
  }));
}

// ── Page-setup mutations (resume-only via documentSupportsPageMode) ───────────

export function setPageSize(state: DocumentState, pageSize: PageSize): DocumentState {
  return { ...state, pageSize };
}

export function setOrientation(
  state: DocumentState,
  orientation: PageOrientation,
): DocumentState {
  return { ...state, orientation };
}

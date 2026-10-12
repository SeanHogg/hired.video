/**
 * The free elements on a career kit's résumé and cover letter pages — text
 * boxes, shapes, images, icons laid over the page — as ONE `DocumentState`
 * on the kit's studio project (`studio_projects.document_state`, the studio's
 * own document column; useKitDocumentLayers saves it).
 *
 * What it holds, and what it never holds:
 *   • one page per kit document (`kit-resume`, `kit-letter`), each with only
 *     an OVERLAY plane: stock studio `Widget`s (the same element model the
 *     studio's document and video canvases use);
 *   • no flow blocks and no résumé text — the résumé content + template stay
 *     the source of the flowing page (the résumé row), never copied here.
 *
 * Positions are in PAGE units: x / width are fractions of the page width,
 * y / height fractions of ONE printed page's height (y = 1.2 is 20% down the
 * second page), so an element stays on the page it was put on however long
 * the résumé grows. The stage lays the plane over every page and converts
 * (lib/studio/document/overlay-plane.ts).
 *
 * Kit overlays add two layer flags the Layers panel toggles: `hidden` (not
 * drawn, not printed) and `locked` (can't be moved or resized). Pure.
 */
import {
  DOCUMENT_STATE_VERSION,
  DEFAULT_DOCUMENT_THEME,
  type DocumentOverlay,
  type DocumentPage,
  type DocumentState,
  type MediaBinding,
  type PageSize,
} from "@/lib/studio/editor-v2/document-state";
import { addOverlay, removeOverlay } from "@/lib/studio/editor-v2/document-edit";
import { emptyCanvasState, type CanvasState, type Scene, type Widget, type WidgetPosition } from "@/lib/studio/editor-v2/canvas-state";
import { layerZ } from "@/lib/studio/editor-v2/layer-order";
import { EDITOR_SHEET_GAP, planeSpan, toPlanePosition } from "@/lib/studio/document/overlay-plane";

export { toPlanePosition, fromPlanePosition } from "@/lib/studio/document/overlay-plane";

export const KIT_DOC_PAGES = ["resume", "letter"] as const;
export type KitDocPage = (typeof KIT_DOC_PAGES)[number];

export const KIT_PAGE_IDS: Record<KitDocPage, string> = { resume: "kit-resume", letter: "kit-letter" };

export interface KitOverlay extends DocumentOverlay {
  hidden?: boolean;
  locked?: boolean;
}

export type KitLayerFlag = "hidden" | "locked";

export function isKitDocPage(page: string): page is KitDocPage {
  return (KIT_DOC_PAGES as readonly string[]).includes(page);
}

function blankPage(id: string): DocumentPage {
  return { id, blocks: [], overlays: [] };
}

export function emptyKitDocument(resumeId: string | null): DocumentState {
  return {
    schemaVersion: DOCUMENT_STATE_VERSION,
    pageSize: "letter",
    orientation: "portrait",
    columns: 12,
    theme: { ...DEFAULT_DOCUMENT_THEME },
    pages: KIT_DOC_PAGES.map((p) => blankPage(KIT_PAGE_IDS[p])),
    entityKind: "resume",
    entityId: resumeId,
  };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isWidget(raw: unknown): raw is Widget {
  if (!raw || typeof raw !== "object") return false;
  const w = raw as Partial<Widget>;
  const p = w.position as Partial<WidgetPosition> | undefined;
  return (
    typeof w.id === "string" &&
    typeof w.kind === "string" &&
    !!w.params &&
    typeof w.params === "object" &&
    !!p &&
    isNum(p.x) &&
    isNum(p.y) &&
    isNum(p.width) &&
    isNum(p.height)
  );
}

function reviveOverlay(raw: unknown): KitOverlay | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isWidget(o.widget)) return null;
  const widget = o.widget;
  const position = { ...widget.position, z: isNum(widget.position.z) ? widget.position.z : 0, rotation: isNum(widget.position.rotation) ? widget.position.rotation : 0 };
  return {
    widget: { ...widget, position, visibleFrom: null, visibleTo: null, motion: widget.motion ?? null },
    ...(o.mediaBinding && typeof o.mediaBinding === "object" ? { mediaBinding: o.mediaBinding as DocumentOverlay["mediaBinding"] } : {}),
    ...(o.hidden === true ? { hidden: true } : {}),
    ...(o.locked === true ? { locked: true } : {}),
  };
}

/** The project's stored document → the kit's document: both kit pages
 *  present, malformed overlays dropped, flow blocks left out (the résumé
 *  content is the flow). Anything unreadable starts empty. */
export function normalizeKitDocument(raw: unknown, resumeId: string | null): DocumentState {
  const base = emptyKitDocument(resumeId);
  if (!raw || typeof raw !== "object") return base;
  const pages = Array.isArray((raw as { pages?: unknown }).pages) ? ((raw as { pages: unknown[] }).pages) : [];
  return {
    ...base,
    pages: KIT_DOC_PAGES.map((p) => {
      const id = KIT_PAGE_IDS[p];
      const stored = pages.find((pg) => !!pg && typeof pg === "object" && (pg as { id?: unknown }).id === id) as
        | { overlays?: unknown }
        | undefined;
      const rawOverlays: unknown = stored?.overlays;
      const overlays = Array.isArray(rawOverlays) ? rawOverlays.map(reviveOverlay).filter((o): o is KitOverlay => o !== null) : [];
      return { id, blocks: [], overlays };
    }),
  };
}

export function kitPageOverlays(state: DocumentState, page: KitDocPage): KitOverlay[] {
  return (state.pages.find((p) => p.id === KIT_PAGE_IDS[page])?.overlays ?? []) as KitOverlay[];
}

export function findKitOverlay(state: DocumentState, page: KitDocPage, widgetId: string): KitOverlay | null {
  return kitPageOverlays(state, page).find((o) => o.widget.id === widgetId) ?? null;
}

function mapOverlays(state: DocumentState, page: KitDocPage, fn: (overlays: KitOverlay[]) => KitOverlay[]): DocumentState {
  const id = KIT_PAGE_IDS[page];
  let changed = false;
  const pages = state.pages.map((p) => {
    if (p.id !== id) return p;
    const next = fn(p.overlays as KitOverlay[]);
    if (next === p.overlays) return p;
    changed = true;
    return { ...p, overlays: next };
  });
  return changed ? { ...state, pages } : state;
}

/** Add an element on top of the page's stack — with the résumé item it is
 *  bound to (#2153), when it was dropped on one. */
export function addKitOverlay(state: DocumentState, page: KitDocPage, widget: Widget, mediaBinding?: MediaBinding): DocumentState {
  const top = kitPageOverlays(state, page).reduce((z, o) => Math.max(z, o.widget.position.z), 0);
  return addOverlay(state, KIT_PAGE_IDS[page], {
    widget: { ...widget, position: { ...widget.position, z: top + 1 } },
    ...(mediaBinding ? { mediaBinding } : {}),
  });
}

export function removeKitOverlay(state: DocumentState, page: KitDocPage, widgetId: string): DocumentState {
  return removeOverlay(state, KIT_PAGE_IDS[page], widgetId);
}

/** A properties edit (PropertiesPanel) — the id never changes. */
export function patchKitOverlay(state: DocumentState, page: KitDocPage, widgetId: string, patch: Partial<Widget>): DocumentState {
  return mapOverlays(state, page, (overlays) =>
    overlays.some((o) => o.widget.id === widgetId)
      ? overlays.map((o) => (o.widget.id === widgetId ? { ...o, widget: { ...o.widget, ...patch, id: widgetId } } : o))
      : overlays,
  );
}

/** A drag / resize / rotate on the page. A locked element doesn't move. */
export function moveKitOverlay(state: DocumentState, page: KitDocPage, widgetId: string, position: WidgetPosition): DocumentState {
  const current = findKitOverlay(state, page, widgetId);
  if (!current || current.locked) return state;
  return patchKitOverlay(state, page, widgetId, { position });
}

/** Layers: restack the page's elements, front-to-back ids (top row = in front). */
export function reorderKitOverlays(state: DocumentState, page: KitDocPage, frontToBack: readonly string[]): DocumentState {
  return mapOverlays(state, page, (overlays) =>
    overlays.map((o) => ({ ...o, widget: { ...o.widget, position: { ...o.widget.position, z: layerZ(frontToBack, o.widget.id) } } })),
  );
}

export function toggleKitOverlayFlag(state: DocumentState, page: KitDocPage, widgetId: string, flag: KitLayerFlag): DocumentState {
  return mapOverlays(state, page, (overlays) =>
    overlays.some((o) => o.widget.id === widgetId)
      ? overlays.map((o) => {
          if (o.widget.id !== widgetId) return o;
          const next: KitOverlay = { ...o };
          if (o[flag]) delete next[flag];
          else next[flag] = true;
          return next;
        })
      : overlays,
  );
}

// ── The stage plane (every page stacked) ─────────────────────────────────

/** How many pages the plane must span: the document's, or further down when
 *  an element sits below its end (the résumé got shorter). */
export function planePageCount(state: DocumentState, page: KitDocPage, documentPages: number): number {
  const lowest = kitPageOverlays(state, page).reduce((m, o) => Math.max(m, o.widget.position.y + o.widget.position.height), 0);
  return Math.max(1, documentPages, Math.ceil(lowest - 1e-6));
}

/** The page's elements as a studio Scene over the plane — what CanvasStage
 *  and LayersPanel take. Hidden elements are left out unless asked for. */
export function kitPageScene(
  state: DocumentState,
  page: KitDocPage,
  opts: { pageCount: number; label: string; includeHidden?: boolean },
): Scene {
  const widgets = kitPageOverlays(state, page)
    .filter((o) => opts.includeHidden || !o.hidden)
    .map((o) => ({ ...o.widget, position: toPlanePosition(o.widget.position, opts.pageCount, EDITOR_SHEET_GAP) }));
  return {
    id: KIT_PAGE_IDS[page],
    label: opts.label,
    durationSeconds: 5,
    backgroundColor: "transparent",
    widgets,
    filters: null,
  };
}

/** A canvas holding the page's scene, sized as the plane — PropertiesPanel
 *  reads a CanvasState. Positions are in plane units, like the stage. */
export function kitPageCanvas(
  state: DocumentState,
  page: KitDocPage,
  opts: { width: number; pageHeight: number; pageCount: number; label: string },
): CanvasState {
  const canvas = emptyCanvasState({ width: opts.width, height: Math.round(opts.pageHeight * planeSpan(opts.pageCount, EDITOR_SHEET_GAP)) });
  return { ...canvas, scenes: [kitPageScene(state, page, { ...opts, includeHidden: true })] };
}

/** Paper of a kit page (the letter's own style picks Letter or A4). */
export function kitPagePaper(paper: "letter" | "a4" | undefined): PageSize {
  return paper === "a4" ? "a4" : "letter";
}

/** The paper a kit document page sits on: the résumé on its design's page
 *  (Letter unless it says A4), the letter on its own style's paper. */
export function kitDocPaper(
  page: KitDocPage,
  letterPaper: "letter" | "a4" | undefined,
  resumePaper?: "letter" | "a4",
): PageSize {
  return kitPagePaper(page === "letter" ? letterPaper : resumePaper);
}

/** The strip's title over a document page's tiles ("Résumé pages"). */
export const KIT_PAGES_TITLE_KEY: Record<KitDocPage, string> = {
  resume: "workspace.strip.resumePages",
  letter: "workspace.strip.letterPages",
};

/**
 * useKitDocumentLayers — the free elements on a kit's résumé and letter
 * pages (kit-document.ts): loaded from the kit's studio project, edited on
 * the document stage / Elements / Layers / the inspector, and written back
 * to the SAME project (`document_state`, debounced; flushed when the tab
 * hides or the kit closes). No parallel store: the kit's one project
 * (useKitProject) carries them, beside its timeline.
 *
 * Elements can be added once the project has loaded (before that a save
 * would overwrite what it holds). Selection is UI state here: one element,
 * on one page. Every edit is one undo step (a drag or a burst of inspector
 * typing coalesced) in the kit's ONE history (useKitHistory).
 *
 * An image / video dropped on a résumé entry (a role, a project…) binds to
 * it (#2153): the overlay keeps a `mediaBinding` and the résumé content
 * gets the matching `metaData` row (resume-media-binding.ts), so the entry
 * plays the media back wherever the résumé renders. Removing the element
 * drops exactly that row.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeContent } from "@shared/resume";
import type { DocumentState, MediaBinding } from "@/lib/studio/editor-v2/document-state";
import {
  defaultWidget,
  emptyCanvasState,
  makeLinkedContentWidget,
  type Widget,
  type WidgetKind,
  type WidgetPosition,
} from "@/lib/studio/editor-v2/canvas-state";
import { resolveLinkedContentColors, type LinkedContentKind } from "@/lib/studio/editor-v2/linked-content";
import { studioService } from "@/lib/services/studio-service";
import { mediaWidget } from "@/lib/build/frame-edits";
import { EDITOR_SHEET_GAP, placeOnPlane } from "@/lib/studio/document/overlay-plane";
import { removeBoundMedia, upsertBoundMedia } from "@/lib/studio/document/resume-media-binding";
import { COALESCE_MS, HISTORY_LIMIT } from "@/lib/build/use-content-history";
import { useStudioProjectRow } from "../use-studio-project-row";
import { emptySnapshots, snapshotCommit, snapshotRedo, snapshotUndo, type Snapshots } from "./kit-history";
import {
  addKitOverlay,
  findKitOverlay,
  fromPlanePosition,
  kitPageOverlays,
  moveKitOverlay,
  normalizeKitDocument,
  patchKitOverlay,
  removeKitOverlay,
  reorderKitOverlays,
  toggleKitOverlayFlag,
  type KitDocPage,
  type KitLayerFlag,
} from "./kit-document";

const SAVE_DEBOUNCE_MS = 1500;

interface Args {
  /** The kit's project (useKitProject), once it has one. */
  projectId: string | null;
  resumeId: string | null;
  /** The project's name — save-draft writes it with every save. */
  title: string;
  /** An edit added an undo step (useKitHistory's journal records it). */
  onStep?: () => void;
  /** The history was cleared (another project loaded). */
  onReset?: () => void;
  /** The résumé on the page — a media drop on one of its entries binds
   *  there (#2153); removing that element unbinds it. */
  resume?: KitResumeBinding;
}

export interface KitResumeBinding {
  content: ResumeContent | null;
  /** Writes the résumé content (the kit's content history; `group` keeps
   *  it from coalescing with typing). */
  commit: (next: ResumeContent, group?: string) => void;
  /** Runs `fn` as ONE undo step across the kit's stores (useKitHistory
   *  `batch`), so the element and its binding undo together. */
  batch?: (fn: () => void) => void;
  /** The résumé owner (the metaData row's userId); no binding without one. */
  userId: string | null;
}

type At = { x: number; y: number } | undefined;

/** `fn` as one undo step across stores (or plainly, with no journal). */
function oneStep(host: KitResumeBinding, fn: () => void) {
  if (host.batch) host.batch(fn);
  else fn();
}

export function useKitDocumentLayers({ projectId, resumeId, title, onStep, onReset, resume }: Args) {
  const { project } = useStudioProjectRow(projectId);
  const [state, setStateRaw] = useState<DocumentState>(() => normalizeKitDocument(null, resumeId));
  // Mirror so edits / undo read the latest state outside a state updater.
  const stateRef = useRef(state);
  const setState = useCallback((next: DocumentState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ page: KitDocPage; widgetId: string } | null>(null);
  // How many printed pages each document spans on the stage (it measures).
  const [pageCounts, setPageCounts] = useState<Record<KitDocPage, number>>({ resume: 1, letter: 1 });
  const pagesRef = useRef(pageCounts);
  pagesRef.current = pageCounts;
  const reportPages = useCallback((page: KitDocPage, count: number) => {
    setPageCounts((prev) => (prev[page] === count ? prev : { ...prev, [page]: count }));
  }, []);
  const listeners = useRef({ onStep, onReset });
  listeners.current = { onStep, onReset };
  const resumeRef = useRef(resume);
  resumeRef.current = resume;
  // This store's undo steps (the kit's journal orders them with the résumé's).
  const snapshots = useRef<Snapshots<DocumentState>>(emptySnapshots());

  // The project's stored elements, once per project — a fresh history.
  useEffect(() => {
    if (!project || project.id !== projectId || loadedFor === project.id) return;
    setState(normalizeKitDocument(project.documentState, resumeId));
    setLoadedFor(project.id);
    setSelected(null);
    snapshots.current = emptySnapshots();
    listeners.current.onReset?.();
  }, [project, projectId, resumeId, loadedFor, setState]);
  const ready = projectId !== null && loadedFor === projectId;

  // Debounced write-back of edits made in this visit.
  const latest = useRef({ projectId, title });
  latest.current = { projectId, title };
  // An edit waits WITH its project, so a project change never writes one
  // project's elements into another.
  const pending = useRef<{ projectId: string; state: DocumentState } | null>(null);
  const lastSave = useRef<Promise<unknown>>(Promise.resolve());
  const flush = useCallback((): Promise<unknown> => {
    const due = pending.current;
    pending.current = null;
    if (due) {
      lastSave.current = studioService
        .saveDraft({ name: latest.current.title, projectId: due.projectId, documentState: due.state })
        .catch(() => undefined);
    }
    return lastSave.current;
  }, []);
  const timer = useRef<number | null>(null);
  const persist = useCallback(
    (next: DocumentState) => {
      if (!projectId) return;
      setState(next);
      pending.current = { projectId, state: next };
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [projectId, setState, flush],
  );
  /** One edit. Edits sharing a `group` within COALESCE_MS (a drag, typing
   *  in the inspector) are ONE undo step; no group = always its own step. */
  const stepId = useRef(0);
  const edit = useCallback(
    (fn: (prev: DocumentState) => DocumentState, group?: string) => {
      if (!ready) return;
      const prev = stateRef.current;
      const next = fn(prev);
      if (next === prev) return;
      const { next: stacks, newStep } = snapshotCommit(
        snapshots.current,
        prev,
        group ?? `step:${(stepId.current += 1)}`,
        Date.now(),
        COALESCE_MS,
        HISTORY_LIMIT,
      );
      snapshots.current = stacks;
      persist(next);
      if (newStep) listeners.current.onStep?.();
    },
    [ready, persist],
  );
  const undo = useCallback((): boolean => {
    const taken = snapshotUndo(snapshots.current, stateRef.current);
    if (!taken || !ready) return false;
    snapshots.current = taken.next;
    persist(taken.value);
    return true;
  }, [ready, persist]);
  const redo = useCallback((): boolean => {
    const taken = snapshotRedo(snapshots.current, stateRef.current, HISTORY_LIMIT);
    if (!taken || !ready) return false;
    snapshots.current = taken.next;
    persist(taken.value);
    return true;
  }, [ready, persist]);
  // Another project: what the last one still owes is written to IT first.
  useEffect(
    () => () => {
      void flush();
    },
    [projectId, flush],
  );
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer.current !== null) window.clearTimeout(timer.current);
      void flush();
    };
  }, [flush]);

  /** Put a new element on the page (centred on `at`, a plane fraction, when
   *  dropped; else where it is made) and select it. */
  const place = useCallback(
    (page: KitDocPage, widget: Widget, at: At, mediaBinding?: MediaBinding) => {
      const z = kitPageOverlays(stateRef.current, page).length + 1;
      const placed = placeOnPlane(widget, at, z, pagesRef.current[page], EDITOR_SHEET_GAP);
      edit((prev) => addKitOverlay(prev, page, placed, mediaBinding));
      setSelected({ page, widgetId: placed.id });
    },
    [edit],
  );

  return {
    state,
    /** Revert / reapply this store's latest step (useKitHistory calls these). */
    undo,
    redo,
    /** Write any waiting edits now; resolves when the save settles (a
     *  download that reads them from the project waits for it). */
    flush,
    /** Elements can be added and edited (the project is loaded). */
    ready,
    /** Pages the plane spans per document (the stage reports them). */
    pageCounts,
    reportPages,
    selected,
    select: useCallback((page: KitDocPage, widgetId: string | null) => setSelected(widgetId ? { page, widgetId } : null), []),
    /** The selected element, when it is on `page` and still exists. */
    selectedOn: useCallback(
      (page: KitDocPage) => (selected?.page === page ? findKitOverlay(state, page, selected.widgetId) : null),
      [selected, state],
    ),
    insert: useCallback(
      (page: KitDocPage, kind: WidgetKind, at?: At) => place(page, defaultWidget(kind), at),
      [place],
    ),
    /** A library image / video dropped on the page; `item` is the résumé
     *  entry under the drop point, which it binds to (#2153). */
    insertMedia: useCallback(
      (page: KitDocPage, kind: "image" | "video", url: string, at?: At, item?: { referenceId: string }) => {
        if (!ready) return;
        const widget = mediaWidget(kind, url);
        const host = resumeRef.current;
        const bound =
          page === "resume" && item && host?.content && host.userId
            ? upsertBoundMedia(host.content, item.referenceId, { overlayId: widget.id, url, kind, userId: host.userId })
            : null;
        if (!bound?.ok || !host) {
          place(page, widget, at);
          return;
        }
        oneStep(host, () => {
          place(page, widget, at, bound.binding);
          host.commit(bound.content, `bind:${widget.id}`);
        });
      },
      [ready, place],
    ),
    insertLinked: useCallback(
      (page: KitDocPage, kind: LinkedContentKind, id: string, at?: At) =>
        place(page, makeLinkedContentWidget({ entityKind: kind, entityId: id, ...resolveLinkedContentColors(emptyCanvasState()) }), at),
      [place],
    ),
    /** A drag on the stage — `position` in plane units. */
    move: useCallback(
      (page: KitDocPage, widgetId: string, position: WidgetPosition) =>
        edit((prev) => moveKitOverlay(prev, page, widgetId, fromPlanePosition(position, pagesRef.current[page], EDITOR_SHEET_GAP)), `move:${widgetId}`),
      [edit],
    ),
    /** An inspector edit — a position in it is in plane units. */
    patch: useCallback(
      (page: KitDocPage, widgetId: string, patch: Partial<Widget>) =>
        edit((prev) =>
          patchKitOverlay(
            prev,
            page,
            widgetId,
            patch.position ? { ...patch, position: fromPlanePosition(patch.position, pagesRef.current[page], EDITOR_SHEET_GAP) } : patch,
          ),
          `props:${widgetId}`,
        ),
      [edit],
    ),
    remove: useCallback(
      (page: KitDocPage, widgetId: string) => {
        const bound = !!findKitOverlay(stateRef.current, page, widgetId)?.mediaBinding;
        const host = resumeRef.current;
        // A bound element takes its metaData row with it — one undo step.
        const unbound = bound && ready && host?.content ? removeBoundMedia(host.content, widgetId) : null;
        const run = () => {
          edit((prev) => removeKitOverlay(prev, page, widgetId));
          if (host && unbound && unbound !== host.content) host.commit(unbound, `unbind:${widgetId}`);
        };
        if (host && unbound) oneStep(host, run);
        else run();
        setSelected((s) => (s?.widgetId === widgetId ? null : s));
      },
      [edit, ready],
    ),
    reorder: useCallback((page: KitDocPage, frontToBack: string[]) => edit((prev) => reorderKitOverlays(prev, page, frontToBack)), [edit]),
    toggle: useCallback(
      (page: KitDocPage, widgetId: string, flag: KitLayerFlag) => {
        edit((prev) => toggleKitOverlayFlag(prev, page, widgetId, flag));
        // A hidden element can't stay selected on the page.
        if (flag === "hidden") setSelected((s) => (s?.widgetId === widgetId ? null : s));
      },
      [edit],
    ),
  };
}

export type KitDocumentLayers = ReturnType<typeof useKitDocumentLayers>;

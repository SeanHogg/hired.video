/**
 * The editor's local (localStorage) draft, scoped to the project id: the seed
 * the canvas history hydrates from, the document runtime's draft slice, and
 * the debounced autosave that writes them so unsaved work survives reloads.
 * Lifted out of StudioEditorV2.
 */
import { useEffect, useRef } from "react";
import type { MediaKind } from "@shared/media-kinds";
import type { ImageState } from "@shared/image-state";
import { trackStudioFunnel } from "@/lib/studio/anon-conversion";
import { type CanvasState, normalizeCanvasState } from "./canvas-state";
import type { DocumentState } from "./document-state";
import { seedCanvasFromTemplate } from "./template-seeds";
import { formatRuntimeFor } from "./format-runtime";
import { stripTabScopedUrls } from "@/lib/studio/media-persistence";

const LOCAL_STORAGE_PREFIX = "studio.v2.draft.";
const AUTOSAVE_DEBOUNCE_MS = 800;

// ───────────────────────────────────────────────────────────────────────────
// Initial state hydration — checks localStorage first, then falls back
// to an empty canvas keyed off the template hint.
// ───────────────────────────────────────────────────────────────────────────

export function hydrateInitialState(
  projectId: string,
  templateHint: string | null,
): CanvasState {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_PREFIX + projectId);
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: CanvasState };
        if (parsed.state && Array.isArray(parsed.state.scenes) && parsed.state.scenes.length > 0) {
          // `normalizeCanvasState` fills any missing top-level fields from
          // `emptyCanvasState()` (present keys win) AND migrates a pre-v2
          // audio shape (`musicSource` + `voiceovers[]`) forward into
          // `audioLayers[]`, so a draft saved by an OLDER app shape can't
          // crash the editor (e.g. emit iterating a missing array).
          return normalizeCanvasState(parsed.state);
        }
      }
    } catch {
      // Fall through to seed-from-template.
    }
  }
  // Template-seeded layouts ship from a shared catalog — see
  // `lib/studio/editor-v2/template-seeds.ts`. Unknown template ids fall
  // through to an empty canvas without throwing.
  return seedCanvasFromTemplate(templateHint);
}

/** Forget the local draft for a project — e.g. before reloading to take a
 *  newer copy another tab saved (#2242), so the reload shows the server's
 *  copy rather than this tab's older one. */
export function clearLocalDraft(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LOCAL_STORAGE_PREFIX + projectId);
  } catch {
    // Private mode / blocked storage — nothing stored to clear.
  }
}

/** Read a locally-autosaved `documentState` slice for a draft (#2212). Lets a
 *  signed-out visitor's in-progress resume / job document survive a reload and
 *  the signup → email-verify round-trip — mirrors `hydrateInitialState`'s
 *  CanvasState path for the document runtime. */
export function readLocalDocumentDraft(projectId: string): DocumentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_PREFIX + projectId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { documentState?: DocumentState };
    const ds = parsed.documentState;
    if (ds && Array.isArray(ds.pages) && ds.pages.length > 0) return ds;
  } catch {
    // Corrupt / private-mode — fall through to a blank seed.
  }
  return null;
}

export interface LocalDraftAutosaveInput {
  projectId: string;
  title: string;
  state: CanvasState;
  imageState: ImageState;
  documentState: DocumentState;
  currentMediaKind: MediaKind;
  isAnonVisitor: boolean;
}

export function useLocalDraftAutosave({
  projectId,
  title,
  state,
  imageState,
  documentState,
  currentMediaKind,
  isAnonVisitor,
}: LocalDraftAutosaveInput) {
  // Funnel: "edit" once when a signed-out visitor first mutates the canvas
  // (set from the autosave effect, which fires on every content change).
  const editTrackedRef = useRef(false);
  const firstAutosaveRef = useRef(true);

  // Local autosave so unsaved work survives reloads. The single effect
  // covers the Timeline-kind `state` (CanvasState), the image-kind
  // `imageState` (#940 Phase 2 image autosave), and the document-kind
  // `documentState` (#2212 — so a signed-out resume / job draft survives the
  // signup round-trip). Kind-aware snapshot (the descriptor's `localDraft`
  // slice) keeps storage shape unified so the hydration step at
  // `/studio/:id` knows which slice to rehydrate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // First run is the seeded mount state, not a user edit — skip the edit
    // funnel event but still persist (so a reload before any edit is safe).
    if (firstAutosaveRef.current) {
      firstAutosaveRef.current = false;
    } else if (isAnonVisitor && !editTrackedRef.current) {
      editTrackedRef.current = true;
      trackStudioFunnel("edit", { mediaKind: currentMediaKind });
    }
    const handle = window.setTimeout(() => {
      try {
        // A `blob:` URL dies with this tab, so a draft restored after a
        // reload must not point at one (#563) — same guard as the server save.
        const snapshot: Record<string, unknown> = stripTabScopedUrls({
          title,
          state,
          ...formatRuntimeFor(currentMediaKind).localDraft({ imageState, documentState }),
        });
        window.localStorage.setItem(
          LOCAL_STORAGE_PREFIX + projectId,
          JSON.stringify(snapshot),
        );
      } catch {
        // Quota / private-mode — drop silently.
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [projectId, title, state, imageState, documentState, currentMediaKind, isAnonVisitor]);
}

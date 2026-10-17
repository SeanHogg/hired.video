/**
 * Real-time collaboration (#2243) + the debounced server autosave, wired
 * together because only the room HOST persists (single writer). Snapshots
 * and applies the active kind's raw runtime state through the format-runtime
 * descriptor's `collab` slice. Lifted out of StudioEditorV2.
 */
import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { MediaKind } from "@shared/media-kinds";
import type { User } from "@/lib/auth";
import type { StudioProject } from "@/lib/services/studio-service";
import { useCollabDocSync } from "@/lib/studio/collab/use-collab-doc-sync";
import { runtimeStatePayload } from "./runtime-state-payload";
import { useServerAutosave } from "./use-server-autosave";
import { clearLocalDraft } from "./use-local-draft";
import { useAutosaveConflictPrompt } from "@/components/workspace/AutosaveConflictPrompt";
import { releaseAllUnsavedWork } from "@/hooks/use-unsaved-work";
import type { DocumentState } from "./document-state";
import {
  formatRuntimeFor,
  type CollabDocShape,
  type StudioStateSnapshot,
  type StudioStateWriters,
} from "./format-runtime";

// Server autosave runs on a longer cadence than the local (localStorage) one so
// a burst of edits coalesces into one network write while the local snapshot
// still captures every keystroke for instant reload recovery. Every write is
// a Neon round-trip of the whole runtime slice, so 5s of quiet (30s at most
// while editing continuously); tab hide / pagehide / blur / unmount flush a
// pending write immediately.
const SERVER_AUTOSAVE_DEBOUNCE_MS = 5000;
const SERVER_AUTOSAVE_MAX_WAIT_MS = 30_000;

export interface StudioCollabAutosaveInput {
  user: User | null;
  authLoading: boolean;
  projectId: string;
  persistedProjectId: string | null;
  currentMediaKind: MediaKind;
  title: string;
  setTitle: Dispatch<SetStateAction<string>>;
  /** The live state of every runtime (the active kind's slice is synced). */
  snapshot: StudioStateSnapshot;
  /** Where a peer's snapshot is written. */
  writers: StudioStateWriters;
  serverAutosaveReady: boolean;
  saving: boolean;
  /** The silent background save; `overwrite` skips the revision check (the
   *  "keep mine" choice after a conflict). */
  saveSilently: (opts?: { overwrite?: boolean }) => Promise<StudioProject | null>;
}

/** What autosave compares for a document: everything but the entity id the
 *  first save stamps in — that stamp is bookkeeping, not an edit, and counting
 *  it made the first save of a document write twice (#2242). */
function documentForSnapshot(documentState: DocumentState): Omit<DocumentState, "entityId"> {
  const { entityId: _stamped, ...rest } = documentState;
  return rest;
}

export function useStudioCollabAutosave({
  user,
  authLoading,
  projectId,
  persistedProjectId,
  currentMediaKind,
  title,
  setTitle,
  snapshot,
  writers,
  serverAutosaveReady,
  saving,
  saveSilently,
}: StudioCollabAutosaveInput) {
  const {
    canvasState: state,
    imageState,
    animationState,
    gameState,
    cadState,
    cad3dState: cad3DState,
    interactiveComicState,
    documentState,
    documentEntityContent,
  } = snapshot;
  const {
    setCanvasState: setState,
    setImageState,
    setAnimationState,
    setGameState,
    setCadState,
    setCad3DState,
    setInteractiveComicState,
    setDocumentState,
    setDocumentEntityContent,
  } = writers;

  // ───── Real-time collaboration (#2243) ─────
  // Live multi-editor sync via the StudioRoom Durable Object (presence + edit
  // relay + host election — useCollabDocSync owns the mechanics).
  // `buildCollabDoc` snapshots the local raw runtime state; `applyCollabDoc`
  // writes a peer snapshot into the live state. Opt-in (VITE_STUDIO_REALTIME);
  // the disabled stub keeps `isHost` true so solo autosave is unchanged. Only
  // the HOST persists to the DB (single writer) — that's what stops concurrent
  // collaborators clobbering each other.
  const collabIdentity = useMemo(
    () =>
      user
        ? { userId: user.id, displayName: user.name || user.email || "Editor" }
        : null,
    [user],
  );
  const buildCollabDoc = useCallback(
    (): CollabDocShape => ({
      title,
      canvasState: state,
      // The active kind's slice (format-runtime descriptor).
      ...formatRuntimeFor(currentMediaKind).collab.get({
        canvasState: state,
        imageState,
        animationState,
        gameState,
        cadState,
        cad3dState: cad3DState,
        interactiveComicState,
        documentState,
        documentEntityContent,
      }),
    }),
    [
      title,
      state,
      imageState,
      animationState,
      gameState,
      cadState,
      cad3DState,
      interactiveComicState,
      documentState,
      documentEntityContent,
      currentMediaKind,
    ],
  );
  const applyCollabDoc = useCallback(
    (doc: CollabDocShape) => {
      if (typeof doc.title === "string") setTitle(doc.title);
      formatRuntimeFor(currentMediaKind).collab.apply(doc, {
        setCanvasState: setState,
        setImageState,
        setAnimationState,
        setGameState,
        setCadState,
        setCad3DState,
        setInteractiveComicState,
        setDocumentState,
        setDocumentEntityContent,
      });
    },
    [
      currentMediaKind,
      setState,
      setImageState,
      setAnimationState,
      setCadState,
      setCad3DState,
      setInteractiveComicState,
      setDocumentState,
    ],
  );
  const studioRoom = useCollabDocSync({
    projectId: persistedProjectId,
    identity: collabIdentity,
    // Live collab needs a saved project (a shareable id); a brand-new unsaved
    // draft has nothing for a second editor to open yet.
    active: !!user && !authLoading && serverAutosaveReady && persistedProjectId !== null,
    buildDoc: buildCollabDoc,
    applyDoc: applyCollabDoc,
  });

  const computeAutosaveSnapshot = useCallback((): string => {
    const slice = runtimeStatePayload(currentMediaKind, {
      canvasState: state,
      imageState,
      animationState,
      gameState,
      cadState,
      cad3dState: cad3DState,
      interactiveComicState,
      documentState: documentForSnapshot(documentState) as DocumentState,
    });
    // Document CONTENT lives in its entity row (resume/job/article), not in the
    // runtime slice — fold it in so editing those fields counts as a change.
    return JSON.stringify({
      title,
      slice,
      entityContent:
        currentMediaKind === "document" ? documentEntityContent : undefined,
    });
  }, [
    currentMediaKind,
    title,
    state,
    imageState,
    animationState,
    gameState,
    cadState,
    cad3DState,
    interactiveComicState,
    documentState,
    documentEntityContent,
  ]);
  // One key per saved project: other tabs editing it hear about each save.
  const documentKey = persistedProjectId ? `studio:${persistedProjectId}` : null;
  const autosave = useServerAutosave({
    // Only the room HOST persists while collaborating, so concurrent editors
    // never clobber each other's DB writes (single writer). `isHost` is true
    // when not connected, so a solo session autosaves exactly as before.
    enabled: !!user && !authLoading && studioRoom.isHost,
    ready: serverAutosaveReady,
    debounceMs: SERVER_AUTOSAVE_DEBOUNCE_MS,
    maxWaitMs: SERVER_AUTOSAVE_MAX_WAIT_MS,
    flushOnBlur: true,
    computeSnapshot: computeAutosaveSnapshot,
    isSaving: saving,
    save: saveSilently,
    overwrite: () => saveSilently({ overwrite: true }),
    // The local (localStorage) draft already keeps an offline edit across a
    // reload, so no offline-queue write is described here.
    documentKey,
    deps: [
      projectId,
      title,
      state,
      imageState,
      animationState,
      gameState,
      cadState,
      cad3DState,
      documentState,
      documentEntityContent,
      currentMediaKind,
    ],
  });

  // A newer copy exists (another tab saved, or this save was refused as
  // stale): "load the newer copy" reloads from the server, dropping this
  // tab's local draft so the reload can't restore the older copy.
  useAutosaveConflictPrompt(autosave, documentKey, () => {
    releaseAllUnsavedWork();
    clearLocalDraft(projectId);
    if (persistedProjectId) clearLocalDraft(persistedProjectId);
    window.location.reload();
  });

  return { studioRoom, autosaveStatus: autosave.status };
}

/**
 * The editor's Save: persists the active kind's runtime slice (and a
 * document's entity content) through `studioService.saveDraft`, then follows
 * the minted row. Re-created every render so it always reads live state —
 * the claim effect, the server autosave, the render pipeline and the Save
 * menu all call this one function. Lifted out of StudioEditorV2.
 */
import { useRef, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { mediaKindIsStillImage, mediaKindIsDocument, type MediaKind } from "@shared/media-kinds";
import type { StudioSubject } from "@shared/studio-subject";
import { useToast } from "@/hooks/use-toast";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { spillLayersIfNeeded } from "@/lib/studio/drawing/layer-r2-spill";
import { documentValidationTier, validateDocumentContent } from "@/lib/studio/document/field-validation";
import { persistDocumentEntity } from "@/lib/studio/document/document-entity";
import { documentEntitySubject } from "@/lib/studio/studio-authoring";
import { persistableRuntimeSlice } from "./runtime-state-payload";
import type { StudioStateSnapshot, StudioStateWriters } from "./format-runtime";
import type { ProjectRecord } from "./use-studio-project-lifecycle";
import type { GateAction } from "./use-anon-adoption";
import { isStaleRevisionError } from "./use-server-autosave";

/** `silent` = a background autosave; `overwrite` = the "keep mine" choice
 *  after a conflict (skip the revision check). */
export type HandleSave = (opts?: { silent?: boolean; overwrite?: boolean }) => Promise<StudioProject | null>;

export interface StudioSaveInput {
  projectId: string;
  currentMediaKind: MediaKind;
  /** The live runtime state the active kind's slice is saved from. */
  snapshot: StudioStateSnapshot;
  /** Save writes back an R2-spilled image and a document's bound entity id. */
  writeBack: Pick<StudioStateWriters, "setImageState" | "setDocumentState">;
  record: Pick<
    ProjectRecord,
    | "title"
    | "persistedProjectId"
    | "persistedProject"
    | "setPersistedProjectId"
    | "setPersistedProject"
    | "setMissingProject"
  >;
  urlSubject: StudioSubject | null;
  gateAction: GateAction;
  followSavedProject: (id: string) => void;
  setSaving: Dispatch<SetStateAction<boolean>>;
}

export function useStudioSave({
  projectId,
  currentMediaKind,
  snapshot,
  writeBack,
  record,
  urlSubject,
  gateAction,
  followSavedProject,
  setSaving,
}: StudioSaveInput): HandleSave {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { imageState, documentState, documentEntityContent } = snapshot;
  const { setImageState, setDocumentState } = writeBack;
  const { title, persistedProjectId, persistedProject, setPersistedProjectId, setPersistedProject, setMissingProject } = record;
  // The content revision this tab last saw for the open project (#2242):
  // from the loaded row, then from each save's response — a ref, so a save
  // fired before the re-render still sends the latest one.
  const revisionRef = useRef<{ id: string; revision: number } | null>(null);
  const baseRevision = (): number | undefined => {
    if (!persistedProjectId) return undefined;
    if (revisionRef.current?.id === persistedProjectId) return revisionRef.current.revision;
    return persistedProject?.id === persistedProjectId ? persistedProject.revision : undefined;
  };

  // ───── Save / publish
  // Returns the persisted StudioProject so callers (notably
  // `ensureRendered`) can chain a follow-up upload without re-reading
  // through the async-state setters. Resolves to null on failure.
  async function handleSave(
    opts?: { silent?: boolean; overwrite?: boolean },
  ): Promise<StudioProject | null> {
    // `silent` = a background autosave (see useServerAutosave). It suppresses the
    // success/validation/error toasts (the header's autosave indicator reports
    // status instead) and never opens the anon gate — autosave is enabled only
    // for signed-in users, so a gate here would be a no-op anyway.
    const silent = opts?.silent === true;
    // Anon adoption gate (#2212): signed-out visitors can build freely, but
    // Save requires an account. The in-place panel opens and this same handler
    // re-runs (and the draft persists) once they authenticate.
    if (
      !silent &&
      !gateAction(
        "save",
        t("studio.anon.gateSave", {
          defaultValue:
            "Create a free account to save your work — your draft stays exactly as it is.",
        }),
        () => void handleSave(),
      )
    ) {
      return null;
    }
    setSaving(true);
    try {
      // Per the canvas-runtime extensibility model (#931 / PRD §1.2)
      // each runtime persists its OWN state column — Timeline kinds
      // (video / podcast / voice / animation / comic) write
      // `timelineSpec`; image kind writes `imageState`; game kind
      // writes `gameState`. The save-draft payload carries whichever
      // is relevant; the server's editor-kind discriminator picks
      // which JSONB column to update.
      // Per-kind runtime-state slice — single SoT in
      // `runtimeStatePayload`. The branch lives ONCE (per the DRY
      // rule); adding a new mediaKind is one more case there, not a
      // new spread here. #637 closed: V2 no longer mirrors a v1
      // VideoScript projection onto the project row — the slice's
      // `kind` discriminator + the runtime-specific state column is
      // the canonical representation.
      // R2 spill: for image kind, promote any layer whose flattened
      // PNG exceeds LAYER_DATAURL_SPILL_BYTES to R2 BEFORE persisting
      // (#940 brush dataURL bloat mitigation). The helper is a no-op
      // when nothing needs spilling.
      let imageStateToPersist = imageState;
      if (mediaKindIsStillImage(currentMediaKind)) {
        const spilledLayers = await spillLayersIfNeeded(imageState.layers);
        if (spilledLayers !== imageState.layers) {
          imageStateToPersist = { ...imageState, layers: spilledLayers };
          setImageState(imageStateToPersist);
        }
      }
      // A document's CONTENT lives in its entity row (résumé / job / article);
      // persistDocumentEntity writes it (creating the row on first save) and
      // stamps the id so reads re-bind. The layout persists via the slice below.
      let documentStateForSave = documentState;
      // A versioned autosave of an already-bound entity writes the entity only
      // AFTER save-draft's revision compare-and-set succeeds, so a stale tab or
      // device gets its 409 before it can overwrite the résumé/job/article row.
      // Unbound (first) saves still create the entity first: save-draft needs its id.
      const revision = silent && !opts?.overwrite ? baseRevision() : undefined;
      const entityAfterDraft =
        mediaKindIsDocument(currentMediaKind) && revision !== undefined && !!documentState.entityId;
      if (mediaKindIsDocument(currentMediaKind)) {
        // Field-validation gate (#1916): block the save when the content has a
        // genuinely invalid value (bad email/URL, out-of-range number, end-date
        // before start). Same `validateDocumentContent` the inline editor shows
        // red, so what the user sees flagged is exactly what stops the save.
        // Only present-but-wrong values fail — an empty/partial draft still saves.
        const contentRecord = documentEntityContent as Record<string, unknown> | null;
        const contentIssues = validateDocumentContent(
          documentState.entityKind,
          contentRecord,
          (key, params) => t(key, params),
          // A public company page saves in the publish tier (#1915).
          documentValidationTier(documentState.entityKind, contentRecord, persistedProject?.isPublic === true),
        );
        if (contentIssues.length > 0) {
          if (!silent) {
            toast({
              title: t("studio.editorV2.fixFieldsBeforeSaving"),
              description: contentIssues.slice(0, 4).join(" · "),
              variant: "destructive",
            });
          }
          setSaving(false);
          return null;
        }
        if (!entityAfterDraft) {
          try {
            documentStateForSave = await persistDocumentEntity(documentState, documentEntityContent, title);
            if (documentStateForSave !== documentState) {
              const bound = documentStateForSave;
              setDocumentState(() => bound);
            }
          } catch (err) {
            if (!silent) {
              toast({
                title: t("errors.saveFailed"),
                description: err instanceof Error ? err.message : t("errors.unknownError"),
                variant: "destructive",
              });
            }
            // Autosave: surface the failure to the caller so the indicator can show
            // "Save failed" — don't fall through and persist a partial row.
            if (silent) {
              setSaving(false);
              return null;
            }
          }
        }
      }
      // The entity row this save just created, as the subject to link to.
      const createdEntitySubject =
        mediaKindIsDocument(currentMediaKind) && !documentState.entityId
          ? documentEntitySubject(documentStateForSave.entityKind, documentStateForSave.entityId)
          : null;
      // Defence in depth (#563): every media producer uploads before it
      // touches state, but a tab-scoped blob: URL that slips through is
      // stripped here — the one path both Save and autosave write through.
      const runtimeSlice = persistableRuntimeSlice(currentMediaKind, {
        canvasState: snapshot.canvasState,
        imageState: imageStateToPersist,
        animationState: snapshot.animationState,
        gameState: snapshot.gameState,
        cadState: snapshot.cadState,
        cad3dState: snapshot.cad3dState,
        interactiveComicState: snapshot.interactiveComicState,
        documentState: documentStateForSave,
      });
      const res = await studioService.saveDraft({
        name: title,
        projectId: persistedProjectId ?? undefined,
        // Autosaves are versioned: a copy another tab/device saved since is
        // refused (409) instead of overwritten. A manual Save and "keep mine"
        // are deliberate overwrites.
        ...(revision !== undefined ? { baseRevision: revision } : {}),
        mediaKind: currentMediaKind,
        ...runtimeSlice,
        // First save of a `/studio/new?subject=...` deep-link binds the
        // freshly-created project row to the source entity. Subsequent
        // saves (persistedProjectId set) leave the subjects array alone
        // — the chips in the header are the canonical edit surface.
        ...(persistedProjectId === null && (urlSubject || createdEntitySubject)
          ? { subjects: [urlSubject, createdEntitySubject].filter((x): x is StudioSubject => x !== null) }
          : {}),
      });
      // This save created the document's entity row (a new job / company):
      // link an EXISTING project to it so the entity's page and a later
      // "Edit" find this project instead of minting a second (#274/#275).
      // Idempotent; a failure only costs the link, never the save.
      if (createdEntitySubject && persistedProjectId !== null && res.data?.id) {
        await studioService.linkSubject(res.data.id, createdEntitySubject).catch(() => undefined);
      }
      if (res.data?.id && typeof res.data.revision === "number") {
        revisionRef.current = { id: res.data.id, revision: res.data.revision };
      }
      // The revision is ours — now the bound entity's content is safe to write.
      // A failure here leaves the indicator on "Save failed" and the next
      // autosave retries the entity write.
      if (entityAfterDraft) {
        try {
          await persistDocumentEntity(documentState, documentEntityContent, title);
        } catch {
          return null;
        }
      }
      if (res.data?.id) {
        setPersistedProjectId(res.data.id);
        setPersistedProject(res.data);
        // Sync the URL when the route was either `/new` or pointed at an
        // unreadable id the load step recovered from (`missingProject`).
        // In both cases the save just minted a brand-new project row, so
        // the URL has to follow or the next reload would re-trigger the
        // not-found banner against a stale id.
        if (projectId !== res.data.id) {
          followSavedProject(res.data.id);
        }
        setMissingProject(false);
      }
      if (!silent) toast({ title: t("messages.savedTitle") });
      return res.data ?? null;
    } catch (err) {
      // The autosave owns a stale write: it pauses and asks which copy to keep.
      if (silent && isStaleRevisionError(err)) throw err;
      if (!silent) {
        toast({
          title: t("errors.saveFailed"),
          description: err instanceof Error ? err.message : t("errors.unknownError"),
          variant: "destructive",
        });
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  return handleSave;
}

/**
 * useDraftAutosave — keep the kit draft's résumé row in sync with the
 * draft.
 *
 *   - Any visitor with a server identity (guest or real) gets the résumé
 *     created once (`ensureSavedResume`; signed-in visitors automatically) so
 *     it lands in /resumes and the PDF route has an id.
 *   - Every later change to the same draft — content (chat revision, section
 *     edit, undo) or design — updates THAT row through the shared server
 *     autosave (useServerAutosave: debounce, retry with backoff, offline
 *     queue, flush when the page is left, unsaved-work registry, cross-tab
 *     conflict prompt). No second debounce lives here (#1494).
 *   - Signed-in résumés also get an autosave VERSION row
 *     (`POST /api/resumes/:id/versions {isAutosave:true}`) at most every
 *     VERSION_INTERVAL_MS of editing, through the same hook — the server
 *     caps and prunes them (#1494). They appear in ⋯ › Versions.
 *   - The draft's identity is its intake `source`: a new source (new parse,
 *     Start over) is a new résumé; an adopted résumé ("existing") is never
 *     copied — its own id is the saved id.
 *
 * What is written: the content, plus the design picked in the kit workspace when there
 * is one (resume-design.ts withDesign). An existing résumé whose design was
 * not touched is written as-is, so its own design (incl. a legacy studio
 * layout) survives content edits.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import { useAuth } from "@/lib/auth";
import { resumeService } from "@/lib/services/resume-service";
import { withDesign, type ResumeDesign } from "@/lib/resume-design";
import type { SaveStatus } from "@/lib/workspace/save-status";
import { useServerAutosave } from "@/lib/studio/editor-v2/use-server-autosave";
import { useAutosaveConflictPrompt } from "@/components/workspace/AutosaveConflictPrompt";
import type { IntakeSource } from "./use-resume-intake";
import { resumeTitle } from "./preview-resume";

export const SAVE_DEBOUNCE_MS = 800;
/** Longest stretch of editing between two autosave version rows. */
export const VERSION_INTERVAL_MS = 30_000;

interface Args {
  content: ResumeContent | null;
  source: IntakeSource | null;
  /** The design to save; null = keep the résumé's own. */
  design: ResumeDesign | null;
  /** False for a draft restored from localStorage: it is not created
   *  automatically (it may already exist from an earlier visit), and an
   *  existing résumé's restored draft is re-saved once (it may hold edits
   *  that never reached the server before the reload). */
  autoPersist: boolean;
  /** The row a restored draft was already saved to (useResumeIntake): its
   *  edits update that row rather than mint another. */
  restoredResumeId?: string | null;
  /** Replace the draft with the newer copy another tab saved (the "load the
   *  newer copy" choice of the conflict prompt). */
  onLoadNewer?: (content: ResumeContent) => void;
}

function existingId(source: IntakeSource | null): string | null {
  return source?.kind === "existing" ? source.resumeId : null;
}

export function toStoredContent(content: ResumeContent, design: ResumeDesign | null): ResumeContent {
  return design ? withDesign(content, design) : content;
}

/** What autosave compares: exactly what would be written. */
function snapshotOf(content: ResumeContent | null, design: ResumeDesign | null): string {
  return content ? JSON.stringify(toStoredContent(content, design)) : "";
}

export function useDraftAutosave({
  content,
  source,
  design,
  autoPersist,
  restoredResumeId = null,
  onLoadNewer,
}: Args) {
  const { t } = useTranslation();
  const { user, isGuest } = useAuth();
  const [savedResumeId, setSavedResumeId] = useState<string | null>(() => existingId(source) ?? restoredResumeId);
  // The create step's status; row updates report through the autosave hook.
  const [createState, setCreateState] = useState<SaveStatus>(() =>
    (existingId(source) ?? restoredResumeId) ? "saved" : "idle",
  );
  // In-flight create — so auto-persist + a click never mint two résumés.
  const savingRef = useRef<Promise<string> | null>(null);
  const sourceRef = useRef(source);
  // Latest values for the autosave callbacks (they run from timers).
  const latest = useRef({ content, design, savedResumeId });
  latest.current = { content, design, savedResumeId };

  const computeSnapshot = useCallback(() => snapshotOf(latest.current.content, latest.current.design), []);
  // A restored draft may hold edits the server never got: nothing saved
  // matches it, so the first pass writes it once.
  const initialBaseline = autoPersist ? undefined : null;

  const row = useServerAutosave({
    enabled: !!savedResumeId && !!content,
    ready: true,
    debounceMs: SAVE_DEBOUNCE_MS,
    computeSnapshot,
    isSaving: false,
    save: async () => {
      const { content: c, design: d, savedResumeId: id } = latest.current;
      // No row yet (a new draft between sources): ensureSavedResume writes it.
      if (!id || !c) return true;
      await resumeService.updateResumeData(id, { data: toStoredContent(c, d) });
      return true;
    },
    deps: [content, design, savedResumeId],
    initialBaseline,
    documentKey: savedResumeId ? `resume:${savedResumeId}` : null,
    offlineWrite: () => {
      const { content: c, design: d, savedResumeId: id } = latest.current;
      return id && c ? { method: "PUT", path: `/api/resumes/${id}`, body: { content: toStoredContent(c, d) } } : null;
    },
  });

  // Autosave version history (#1494) — real accounts only; a guest's résumé
  // has no version history surface. Not "unsaved work": the row above is.
  const versions = useServerAutosave({
    enabled: !!savedResumeId && !!content && !!user && !isGuest,
    ready: true,
    debounceMs: VERSION_INTERVAL_MS,
    maxWaitMs: VERSION_INTERVAL_MS,
    computeSnapshot,
    // The version snapshots the stored row: wait for a row write in flight.
    isSaving: row.status === "saving",
    save: async () => {
      const id = latest.current.savedResumeId;
      if (!id) return true;
      await resumeService.createVersion(id, { isAutosave: true });
      return true;
    },
    deps: [content, design, savedResumeId],
    initialBaseline,
    tracksUnsavedWork: false,
    flushOnLeave: false,
  });

  // A new source means a new draft: forget the saved id — or take the adopted
  // résumé's own id, whose row already holds this content and design.
  const { rebaseline: rebaselineRow } = row;
  const { rebaseline: rebaselineVersions } = versions;
  useEffect(() => {
    if (sourceRef.current === source) return;
    sourceRef.current = source;
    const adopted = existingId(source);
    const saved = snapshotOf(content, adopted ? null : design);
    rebaselineRow(saved);
    rebaselineVersions(saved);
    savingRef.current = null;
    setSavedResumeId(adopted);
    setCreateState(adopted ? "saved" : "idle");
  }, [source, content, design, rebaselineRow, rebaselineVersions]);

  // Another tab saved this résumé: offer its copy (or keep this one).
  const loadNewerRef = useRef(onLoadNewer);
  loadNewerRef.current = onLoadNewer;
  useAutosaveConflictPrompt(row, savedResumeId ? `resume:${savedResumeId}` : null, async () => {
    const id = latest.current.savedResumeId;
    const apply = loadNewerRef.current;
    if (!id || !apply) return;
    const newer = await resumeService.getResumeById(id);
    const snapshot = snapshotOf(newer.content, latest.current.design);
    rebaselineRow(snapshot);
    rebaselineVersions(snapshot);
    apply(newer.content);
  });

  const fallbackTitle = t("build.untitledResume");
  const ensureSavedResume = useCallback((): Promise<string> => {
    if (savedResumeId) return Promise.resolve(savedResumeId);
    if (savingRef.current) return savingRef.current;
    if (!content) return Promise.reject(new Error(t("build.errors.noResume")));
    const basis = snapshotOf(content, design);
    const from = sourceRef.current;
    setCreateState("saving");
    const promise = resumeService
      .createResume({
        title: resumeTitle(content, fallbackTitle),
        parsedContent: toStoredContent(content, design),
      })
      .then((created) => {
        // Another draft since (Start over, a new file): the row is the old
        // draft's, not this one's.
        if (sourceRef.current !== from) return created.id;
        // The row now holds THIS content + design; later edits diff against it.
        rebaselineRow(basis);
        rebaselineVersions(basis);
        setSavedResumeId(created.id);
        setCreateState("saved");
        return created.id;
      })
      .catch((err: unknown) => {
        savingRef.current = null;
        setCreateState("error");
        throw err;
      });
    savingRef.current = promise;
    return promise;
  }, [savedResumeId, content, design, fallbackTitle, t, rebaselineRow, rebaselineVersions]);

  // Signed-in: persist as soon as there is a résumé so it lands in /resumes
  // and Download can open the print window without an await first.
  useEffect(() => {
    if (!autoPersist || !user || !content || savedResumeId || savingRef.current) return;
    ensureSavedResume().catch(() => {
      // Surfaced on the explicit action instead (Download).
    });
  }, [autoPersist, user, content, savedResumeId, ensureSavedResume]);

  const saveState: SaveStatus = !savedResumeId || row.status === "idle" ? createState : row.status;

  return { saveState, ensureSavedResume, savedResumeId };
}

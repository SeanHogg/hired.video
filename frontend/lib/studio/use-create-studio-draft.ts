/**
 * useCreateStudioDraft — shared "start a new Studio video" primitive.
 *
 * Three callers used to inline the same `getTemplate → seedCanvasFromTemplate
 * → canvasStateToTimeline → saveDraft → navigate` sequence with subtly
 * different bookkeeping (StudioLanding's TemplateCarousel,
 * the studio New menu's templates, StudioAiWizard's generated-script
 * handoff). This hook owns the shared pipeline so all three agree on:
 *
 *   - The editor kind: every Timeline draft is `kind: "nle"` (V2 is the only editor).
 *   - Seeded `timelineSpec` for v2 from `seedCanvasFromTemplate(id)`.
 *   - The "last-used template" memory (`studio_default_template` localStorage
 *     key) — now updated whether the user picks from the dropdown OR the
 *     carousel, fixing the prior inconsistency where only the dropdown wrote.
 *   - Busy / error toast / success navigate.
 *
 * This hook seeds v2 drafts ONLY (the editor of record): new drafts are
 * minted with a v2 timelineSpec and never a V1 `script`.
 *
 * The single source of per-template canvas content is
 * [editor-v2/template-seeds.ts]. The same seed feeds the marketplace
 * press-play preview (TemplatePlayer) so visitors see EXACTLY what
 * they'll land on after clicking Use.
 *
 * The `kind: "script"` branch survives only as the bridge for legacy v1
 * VideoScript inputs (wizard-generated drafts + creator-published
 * templates whose `videoScript` column is still a v1 shape). When those
 * surfaces migrate to v2, this branch can be deleted.
 *
 * Consumers add ONLY their consumer-specific bookkeeping via `onCreated`
 * (e.g. optimistic prepend to a local Recent list, closing a modal).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import type { StudioSubject } from "@shared/studio-subject";
import type { ComicSpec } from "@shared/comic-spec";
import { useToast } from "@/hooks/use-toast";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import {
  emptyCanvasState,
  type CanvasState,
} from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { comicSpecToCanvas } from "@/lib/studio/editor-v2/comic-spec-to-canvas";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import { seedTemplate } from "@/lib/studio/template-dispatch";
import {
  getTemplate,
  type ContentTemplate,
} from "@/lib/studio/templates/catalog";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { workspaceHrefForTemplate } from "@/lib/studio/career-starts";
import { resumeTemplateHref } from "@/lib/studio/resume-editor-link";
import {
  JOB_POST_LEAD_PATH,
  recordPostJobIntent,
  startsJobPosting,
  useJobPostAccess,
} from "@/lib/studio/job-post-access";
import type { VideoScript } from "@/types/video-script";
import { MEDIA_KIND_UI, type MediaKind } from "@shared/media-kinds";

export type CreateStudioDraftInput =
  | { kind: "template"; templateId: ContentTemplate }
  | { kind: "script"; script: VideoScript; name?: string }
  /** Comic AI scaffolder result. The hook converts the spec → CanvasState
   *  via `comicSpecToCanvas()` then mints a new project with mediaKind:
   *  "comic". Same downstream path as `template` / `script` from a
   *  persistence standpoint — only the spec → canvas conversion differs. */
  | { kind: "comicSpec"; spec: ComicSpec; name?: string }
  /** Empty draft — used by the chooser's `?subject=` / `?capture=` /
   *  `?new=1` deep-link forwarder so external entry points mint the
   *  project server-side and land users on `/studio/<real-id>` instead
   *  of the legacy `/studio/new` sentinel. Optional `subjects` pre-links
   *  source entities (resume / job / company) on the first save. */
  | { kind: "blank"; name?: string; subjects?: StudioSubject[] }
  /** Document project (#1912) created from a fully-formed `DocumentState` —
   *  used to open an EXISTING entity (e.g. a resume) on the paged canvas with
   *  `documentState.entityId` already bound. Distinct from `template` (which
   *  seeds a fresh blank document via the catalog). Pass `subjects` to LINK the
   *  project to the source entity so a later "edit" can find-and-reopen this
   *  project instead of minting a duplicate (#1882). */
  | {
      kind: "document";
      documentState: DocumentState;
      name?: string;
      subjects?: StudioSubject[];
    }
  /** A résumé template (built-in preset id, or a résumé studio template's
   *  slug / id). A résumé is made in a career kit, so this opens a new kit
   *  wearing it (signed in or not) instead of minting a loose document. */
  | { kind: "resumeTemplate"; design: string };

interface Opts {
  /** Fires once after a successful save, BEFORE navigate. Useful for
   *  optimistic local-cache prepends or closing a host modal. */
  onCreated?: (project: StudioProject) => void;
  /** Skip the internal navigate (caller does it). Default false. */
  skipNavigate?: boolean;
}

/** Where a signed-out visitor lands when they "start a new project". An
 *  anonymous visitor has no server row to write to, so we route them into the
 *  anon editor (`/studio/new`) where the canvas autosaves to localStorage and
 *  Save / Publish / Export prompt for sign-up in place (StudioEditorV2 +
 *  useAuthGate). `template` carries the chosen kind via `?contentTemplate=` so
 *  the draft opens seeded with the right template; every other input shape has
 *  server-generated content that can't survive a URL hop, so it falls back to
 *  a blank anon draft. */
function anonStartHref(input: CreateStudioDraftInput): string {
  if (input.kind === "template") {
    return `/studio/new?contentTemplate=${encodeURIComponent(input.templateId)}`;
  }
  return "/studio/new?new=1";
}

export function useCreateStudioDraft(opts: Opts = {}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [defaultTemplate, setDefaultTemplate] =
    usePersistentState<ContentTemplate>("studio_default_template", "basic");
  const [creating, setCreating] = useState(false);
  const jobAccess = useJobPostAccess();
  const { t } = useTranslation();

  async function create(input: CreateStudioDraftInput): Promise<StudioProject | null> {
    if (creating) return null;
    // A résumé / video-résumé template IS a career kit: open a new kit
    // (signed in or not) instead of minting a second, studio copy.
    if (input.kind === "resumeTemplate") {
      navigate(resumeTemplateHref(input.design));
      return null;
    }
    const workspaceHref = input.kind === "template" ? workspaceHrefForTemplate(input.templateId) : null;
    if (workspaceHref) {
      navigate(workspaceHref);
      return null;
    }
    // Signed-out visitors don't have a server row to write to — route every
    // "start a new project" path into the anon editor instead. Doing it here
    // (the single create seam) means every consumer — the /studio template
    // carousel, StudioNewMenu, StudioAiWizard — works signed-out with no
    // per-caller branch. We navigate and return null; callers already treat a
    // null result as "nothing more to do" (their `onCreated`/optimistic
    // prepend simply doesn't fire).
    //
    // A new job POSTING is for recruiters / employers only (#1915 — the gate
    // the retired JobCreatePage had; same rule POST /api/jobs enforces):
    // signed-out visitors go to the lead capture, other roles get a toast.
    if (startsJobPosting(input)) {
      if (jobAccess === "sign-in") {
        navigate(JOB_POST_LEAD_PATH);
        return null;
      }
      if (jobAccess === "denied") {
        toast({ title: t("studio.jobPost.deniedTitle"), description: t("studio.jobPost.deniedBody"), variant: "destructive" });
        return null;
      }
      recordPostJobIntent("studio");
    }
    if (!user) {
      if (input.kind === "template") setDefaultTemplate(input.templateId);
      navigate(anonStartHref(input));
      return null;
    }
    setCreating(true);
    // Derive the kind that's being created so a failure toast can say
    // "Couldn't create drawing" instead of the generic "Couldn't create
    // project" — the generic phrasing was confusing users into thinking
    // every kind was being treated as a video. Reads from the same
    // MEDIA_KIND_UI single SoT every other surface uses.
    const intendedKind: MediaKind | null =
      input.kind === "template"
        ? getTemplate(input.templateId).mediaKind
        : input.kind === "comicSpec"
          ? "comic"
          : null;
    try {
      const projectKind = "nle" as const;
      if (input.kind === "template") {
        // Remember the user's last pick for the next split-button default.
        // Carousel + dropdown both flow through here so they stay in sync.
        setDefaultTemplate(input.templateId);
        const template = getTemplate(input.templateId);
        // Per the canvas-runtime extensibility model (PRD §1.2), every
        // mediaKind has its own seed registry. `seedTemplate()` is the
        // single SoT dispatcher — Timeline kinds get `timelineSpec`,
        // game gets `gameState`, future kinds add their own field. No
        // `if (template.mediaKind === "game")` branching here (DRY).
        const seed = seedTemplate(template);
        const res = await studioService.saveDraft({
          name: seed.name,
          // For Timeline-runtime kinds we stamp `kind: 'nle'` so the row
          // points at the v2 canvas surface. Game projects don't use
          // the legacy `kind` discriminator — their canvas is selected
          // by `mediaKind` via `<CanvasRouter>`; leave `kind` as the
          // server default ('scene') so old read paths don't choke.
          ...(seed.timelineSpec !== undefined ? { kind: projectKind } : {}),
          // Carry the template's mediaKind onto the row at first save so
          // the export menu + publish destinations gate correctly from
          // the very first paint. Default 'video' on the column would
          // otherwise yield a podcast template that exports as MP4.
          mediaKind: template.mediaKind,
          ...(seed.timelineSpec !== undefined ? { timelineSpec: seed.timelineSpec } : {}),
          ...(seed.gameState !== undefined ? { gameState: seed.gameState } : {}),
          ...(seed.imageState !== undefined ? { imageState: seed.imageState } : {}),
          ...(seed.animationState !== undefined ? { animationState: seed.animationState } : {}),
          // Non-Timeline seed fields were previously dropped here, so a
          // cad / cad_3d / document template's seeded state was lost on
          // create and the editor had to re-seed blank. Carry them through
          // so a template that ships pre-arranged content (e.g. a document
          // design template's blocks) persists from first save.
          ...(seed.cadState !== undefined ? { cadState: seed.cadState } : {}),
          ...(seed.cad3dState !== undefined ? { cad3dState: seed.cad3dState } : {}),
          ...(seed.documentState !== undefined ? { documentState: seed.documentState } : {}),
          // Interactive-comic templates ship a starter branch graph; carry it
          // through so the seeded graph persists from first save instead of the
          // editor re-seeding a blank one (#2126).
          ...(seed.interactiveComicState !== undefined ? { interactiveComicState: seed.interactiveComicState } : {}),
        });
        return finalise(res.data);
      }
      if (input.kind === "blank") {
        const empty: CanvasState = emptyCanvasState();
        const timelineSpec = canvasStateToTimeline(empty);
        const res = await studioService.saveDraft({
          name: input.name || "New Video",
          kind: projectKind,
          timelineSpec,
          // Subjects pre-link the project to source entities so the
          // editor's chip rail + EntityMedia rails on the source page
          // are populated from first paint.
          ...(input.subjects && input.subjects.length > 0
            ? { subjects: input.subjects }
            : {}),
        });
        return finalise(res.data);
      }
      if (input.kind === "comicSpec") {
        // Comic AI scaffolder result. The spec already carries the
        // canonical layout + palette so we only need to convert it to
        // a CanvasState. mediaKind: "comic" tells the editor's
        // <CanvasRouter> to mount the comic surface from first paint,
        // and the save-menu's export rows filter to PNG-strip / PDF /
        // CBZ / motion-MP4 automatically via `outputProfilesFor("comic")`.
        const canvas = comicSpecToCanvas(input.spec);
        const timelineSpec = canvasStateToTimeline(canvas);
        const res = await studioService.saveDraft({
          name: input.name || input.spec.title || "Comic pitch",
          kind: projectKind,
          mediaKind: "comic",
          timelineSpec,
        });
        return finalise(res.data);
      }
      if (input.kind === "document") {
        // Open an existing entity on the paged canvas — the DocumentState
        // already carries `entityId` so the editor fetches + writes back that
        // row's content. Storage `kind: "scene"` (non-Timeline runtime) +
        // mediaKind "document" → <CanvasRouter> mounts <DocumentStage>.
        const res = await studioService.saveDraft({
          name: input.name || "New document",
          kind: "scene",
          mediaKind: "document",
          documentState: input.documentState,
          // Link the source entity (resume / article) so the next edit finds
          // and reopens THIS project rather than minting a duplicate (#1882).
          ...(input.subjects && input.subjects.length > 0
            ? { subjects: input.subjects }
            : {}),
        });
        return finalise(res.data);
      }
      // kind === "script" — legacy v1 VideoScript bridge for the wizard
      // and creator-template flows. Converts to v2 CanvasState on the
      // way in so saved projects are uniformly v2-shaped (no V1 script
      // is ever written).
      const timelineSpec = canvasStateToTimeline(scriptToCanvasState(input.script));
      const res = await studioService.saveDraft({
        name: input.name || "New Video",
        kind: projectKind,
        timelineSpec,
      });
      return finalise(res.data);
    } catch (err) {
      const kindLabel = intendedKind
        ? MEDIA_KIND_UI[intendedKind].badgeLabel.toLowerCase()
        : "project";
      toast({
        title: `Couldn't create ${kindLabel}`,
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      return null;
    } finally {
      setCreating(false);
    }
  }

  function finalise(created: StudioProject | undefined): StudioProject | null {
    if (!created?.id) throw new Error("No project id returned");
    opts.onCreated?.(created);
    if (!opts.skipNavigate) {
      navigate(`/studio/${encodeURIComponent(created.id)}`);
    }
    return created;
  }

  return { create, creating, defaultTemplate };
}

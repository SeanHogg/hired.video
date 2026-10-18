// Studio project CRUD, drafts and subject links — part of the `studioService`
// facade in studio-service.ts. Methods that call `this.*` resolve against the
// facade object (every method here is spread into it), so spies/mocks on
// `studioService.getProjects` / `saveDraft` keep intercepting.
import { z } from "zod";
import { apiClient } from "../../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import type { StudioPurpose } from "@shared/studio-purposes";
import type { MediaKind } from "@shared/media-kinds";
import type { StudioSubject } from "@shared/studio-subject";
import { canvasStateToTimeline } from "../../studio/editor-v2/timeline-emit";
import type { CanvasState } from "../../studio/editor-v2/canvas-state";
import { StudioProjectSchema, type StudioProject } from "./project-schemas";

export const studioProjectsApi = {
  /**
   * List all studio projects for the current user. When `subject` is
   * provided, only projects linked to that entity are returned —
   * `EntityMedia` uses this to populate the per-entity scroller.
   * When `workspace` is provided (e.g. "personal" | "company:<id>" |
   * "delegated:<id>"), the response is restricted to that workspace
   * scope; omit it to receive rows from every workspace the caller can
   * see. Build the value via `selectionToQuery()` so the encoding
   * stays in lockstep with the server-side parser.
   */
  async getProjects(
    subject?: { kind: string; id: string },
    workspace?: string,
  ): Promise<ApiSuccessResponse<StudioProject[]>> {
    const params = new URLSearchParams();
    if (subject) {
      params.set("subjectKind", subject.kind);
      params.set("subjectId", subject.id);
    }
    if (workspace) params.set("workspace", workspace);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiClient.get(
      `/api/studio/projects${qs}`,
      z.array(StudioProjectSchema),
    );
  },

  /**
   * Public read for the EntityMedia rail (#323). Returns the projects
   * linked to the given subject that the owner has marked public,
   * regardless of who the viewer is — including anonymous viewers on
   * public listing pages. Owners should keep using `getProjects` so they
   * see their drafts and analytics; non-owners use this so they only
   * receive watchable public clips.
   */
  async getPublicProjects(
    subject: { kind: string; id: string },
  ): Promise<ApiSuccessResponse<StudioProject[]>> {
    const params = new URLSearchParams({
      subjectKind: subject.kind,
      subjectId: subject.id,
    });
    return apiClient.get(
      `/api/studio/public?${params.toString()}`,
      z.array(StudioProjectSchema),
    );
  },

  /**
   * Resolve the canvas `document`-kind project linked to a subject, if one
   * exists yet (#1882). A resume / article / blog authored on the document
   * canvas has exactly one such project; this is the single seam for "find
   * the existing canvas doc" so the studio-landing redirect and the entity
   * "Edit" buttons stay in lockstep. Returns null on first-ever edit (no doc
   * project yet) or on any fetch error, so callers fall back to the
   * `?editResume=`/`?editArticle=` bootstrap that mints one.
   */
  async findDocumentProject(
    subject: { kind: string; id: string },
  ): Promise<StudioProject | null> {
    return this.findSubjectProject(subject, "document");
  },

  /**
   * The newest project of `mediaKind` linked to a subject, or null (none
   * yet, or the fetch failed). The ONE seam for "is there already a <kind>
   * for this entity?" — the document canvas uses it for résumé/article docs.
   */
  async findSubjectProject(
    subject: { kind: string; id: string },
    mediaKind: MediaKind,
  ): Promise<StudioProject | null> {
    try {
      return await this.findSubjectProjectStrict(subject, mediaKind);
    } catch {
      return null;
    }
  },

  /**
   * findSubjectProject that THROWS when the lookup fails, so a caller about
   * to create the project on "none found" (a career kit's ONE video) never
   * mistakes a 401 / network blip for "none" and saves a duplicate.
   */
  async findSubjectProjectStrict(
    subject: { kind: string; id: string },
    mediaKind: MediaKind,
  ): Promise<StudioProject | null> {
    const res = await this.getProjects(subject);
    const matches = (res.data ?? []).filter((p) => p.mediaKind === mediaKind);
    matches.sort((a, b) => b.updateDateTime.localeCompare(a.updateDateTime));
    return matches[0] ?? null;
  },

  /** Save a video canvas as an NLE draft (create, or update `projectId`). */
  async saveVideoDraft(args: {
    name: string;
    projectId?: string;
    canvas: CanvasState | null;
    subjects?: StudioSubject[];
  }) {
    return this.saveDraft({
      name: args.name,
      projectId: args.projectId,
      kind: "nle",
      mediaKind: "video",
      ...(args.canvas ? { timelineSpec: canvasStateToTimeline(args.canvas) } : {}),
      ...(args.subjects ? { subjects: args.subjects } : {}),
    });
  },

  /**
   * Save (create or update) a draft project. Pass `subjects` to
   * replace-all the project's entity links; omit it to leave existing
   * links untouched (e.g. when only the title changed). Pass
   * `timelineSpec` (with `kind: 'nle'`) when saving from the v2 canvas
   * editor. No caller writes a V1 `script` any more (#639); old V1 rows
   * are converted at read time (`scriptToCanvasState`).
   */
  async saveDraft(
    args: {
      name: string;
      resumeText?: string;
      projectId?: string;
      prompt?: string;
      jobDescription?: string;
      purpose?: StudioPurpose;
      subjects?: Array<{ kind: string; id: string }>;
      kind?: "scene" | "nle";
      /** Output axis (#894). Sent on first save when the user picked a
       *  non-video template — server defaults to 'video' so legacy
       *  callers are unaffected. */
      mediaKind?: MediaKind;
      timelineSpec?: unknown;
      /** Game runtime state for mediaKind='game' projects (#927). Sent
       *  by `<GameStage>` on save; mutually exclusive in practice with
       *  `timelineSpec` (each canvas runtime writes to its own JSONB
       *  column). See `shared/game-state.ts`. */
      gameState?: unknown;
      /** Image runtime state for mediaKind='image' projects (#932). Sent
       *  by `<DrawingStage>` on save; same parallel-column pattern as
       *  `gameState`. See `shared/image-state.ts`. */
      imageState?: unknown;
      /** Animation runtime state for mediaKind='animation' projects
       *  (#1003). Sent by `<AnimationStage>` on save; same parallel-
       *  column pattern. See `shared/animation-state.ts`. */
      animationState?: unknown;
      /** CAD runtime state for mediaKind='cad' projects (#930). Sent
       *  by `<CadStage>` on save; same parallel-column pattern. See
       *  `shared/cad-state.ts`. */
      cadState?: unknown;
      /** 3D CAD runtime state for mediaKind='cad_3d' projects (#930
       *  Phase 2). Sent by `<Cad3DStage>` on save; same parallel-column
       *  pattern. See `shared/cad-3d-state.ts`. */
      cad3dState?: unknown;
      /** Document runtime state for mediaKind='document' projects (#1912).
       *  Sent by `<DocumentStage>` on save; same parallel-column pattern. */
      documentState?: unknown;
      /** Interactive-comic (Comic+) branching choice graph for
       *  mediaKind='interactive_comic' projects (#1960 / #2126). Sent by
       *  `<InteractiveComicStage>` on save; same parallel-column pattern.
       *  See `shared/interactive-comic-state.ts`. */
      interactiveComicState?: unknown;
      // SEO patch — sent only by the "Details" drawer; omit-vs-empty
      // matters server-side (omitted = preserve, empty string = clear).
      metaDescription?: string;
      slug?: string;
      keywords?: string[];
      socialCardImage?: string;
      /** The revision this save is based on (#2242). When set, the server
       *  refuses the write with 409 STALE_REVISION if another tab/device has
       *  saved since. Omit to overwrite (manual save, "keep mine"). */
      baseRevision?: number;
    },
  ): Promise<ApiSuccessResponse<StudioProject>> {
    const body = {
      name: args.name,
      resumeText: args.resumeText ?? "",
      ...(args.projectId ? { projectId: args.projectId } : {}),
      ...(args.prompt ? { prompt: args.prompt } : {}),
      ...(args.jobDescription ? { jobDescription: args.jobDescription } : {}),
      ...(args.purpose ? { purpose: args.purpose } : {}),
      ...(args.subjects !== undefined ? { subjects: args.subjects } : {}),
      ...(args.kind ? { kind: args.kind } : {}),
      ...(args.mediaKind ? { mediaKind: args.mediaKind } : {}),
      ...(args.timelineSpec !== undefined ? { timelineSpec: args.timelineSpec } : {}),
      ...(args.gameState !== undefined ? { gameState: args.gameState } : {}),
      ...(args.imageState !== undefined ? { imageState: args.imageState } : {}),
      ...(args.animationState !== undefined ? { animationState: args.animationState } : {}),
      ...(args.cadState !== undefined ? { cadState: args.cadState } : {}),
      ...(args.cad3dState !== undefined ? { cad3dState: args.cad3dState } : {}),
      ...(args.documentState !== undefined ? { documentState: args.documentState } : {}),
      ...(args.interactiveComicState !== undefined ? { interactiveComicState: args.interactiveComicState } : {}),
      ...(args.metaDescription !== undefined ? { metaDescription: args.metaDescription } : {}),
      ...(args.slug !== undefined ? { slug: args.slug } : {}),
      ...(args.keywords !== undefined ? { keywords: args.keywords } : {}),
      ...(args.socialCardImage !== undefined ? { socialCardImage: args.socialCardImage } : {}),
      ...(args.baseRevision !== undefined ? { baseRevision: args.baseRevision } : {}),
    };
    // A versioned save is an autosave: a 409 STALE_REVISION is an expected
    // outcome the editor handles (it asks which copy to keep), not an error
    // for the global toast.
    return apiClient.request(
      "/api/studio/save-draft",
      { method: "POST", body, suppressErrorEvent: args.baseRevision !== undefined },
      StudioProjectSchema,
    );
  },

  /**
   * Single-project hydration. Server-side ownership check returns 404
   * when the caller can't read (parity with the GET /projects list).
   */
  async getProject(projectId: string): Promise<ApiSuccessResponse<StudioProject>> {
    return apiClient.get(
      `/api/studio/projects/${encodeURIComponent(projectId)}`,
      StudioProjectSchema,
    );
  },

  /**
   * Add a single entity link to a project. Idempotent — adding the same
   * pair twice is a no-op and still returns the current subjects array.
   */
  async linkSubject(
    projectId: string,
    subject: { kind: string; id: string },
  ): Promise<ApiSuccessResponse<{ projectId: string; subjects: Array<{ kind: string; id: string }> }>> {
    return apiClient.post(
      `/api/studio/projects/${encodeURIComponent(projectId)}/subjects`,
      subject,
    );
  },

  /**
   * Remove a single entity link from a project. Returns 200 + the
   * remaining subjects even when the pair didn't exist (idempotent).
   */
  async unlinkSubject(
    projectId: string,
    subject: { kind: string; id: string },
  ): Promise<ApiSuccessResponse<{ projectId: string; subjects: Array<{ kind: string; id: string }> }>> {
    return apiClient.delete(
      `/api/studio/projects/${encodeURIComponent(projectId)}/subjects/${encodeURIComponent(subject.kind)}/${encodeURIComponent(subject.id)}`,
    );
  },

  /**
   * Delete a studio project permanently.
   */
  async deleteProject(projectId: string): Promise<ApiSuccessResponse<{ id: string }>> {
    return apiClient.delete(`/api/studio/projects/${projectId}`, z.object({ id: z.string() }));
  },

  /**
   * Clone an existing studio project into a new draft owned by the same user.
   * The backend appends "(Copy)" to the new title and resets status to "Draft".
   */
  async cloneProject(projectId: string): Promise<ApiSuccessResponse<StudioProject>> {
    return apiClient.post(
      `/api/studio/projects/${projectId}/clone`,
      {},
      StudioProjectSchema,
    );
  },

  /**
   * Update the status of a studio project.
   */
  async updateProjectStatus(
    projectId: string,
    status: "draft" | "exported" | "published" | "processing" | "failed",
  ): Promise<ApiSuccessResponse<StudioProject>> {
    return apiClient.patch(`/api/studio/projects/${projectId}`, { status }, StudioProjectSchema);
  },

  /**
   * Toggle a project's video visibility between public and unlisted.
   */
  async updateProjectVisibility(
    projectId: string,
    isPublic: boolean,
  ): Promise<ApiSuccessResponse<StudioProject>> {
    return apiClient.patch(
      `/api/studio/projects/${projectId}`,
      { isPublic },
      StudioProjectSchema,
    );
  },
};

/**
 * Where a studio template is published FROM — resolved once, so the ONE
 * publish use case (StudioTemplatesService.publish) stays source-agnostic:
 *
 *   project  a studio project the caller owns. Its media kind is the
 *            template's; a document snapshots its `state` (DocumentState), every
 *            other kind its storyboard (or the live payload the editor sent).
 *   resume   a résumé the caller owns, published from the career kit as a
 *            résumé template (media kind 'document', document kind
 *            'resume'). The design is the live one the kit sent, else the
 *            résumé's stored design (its studio layout, or the built-in
 *            design it names). Personal content is stripped
 *            (resumeTemplateSnapshot).
 *
 * Reads go through repositories; no Drizzle here.
 */

import type { ResumeRow, StudioProjectRow } from "../../repositories/index.js";
import { isWearableResumeTemplate } from "../../../../shared/resume-template-snapshot.js";
import { templateSnapshotFor, type TemplateSnapshot } from "./studioTemplateSnapshot.js";
import { StudioTemplatesError } from "./studioTemplatesErrors.js";

export type TemplateSourceRef = { kind: "project"; id: string } | { kind: "resume"; id: string };

/** The reads a source needs — narrow so tests fake only these. */
export interface TemplateSourceRepos {
  media: {
    findStudioProjectById(
      id: string,
    ): Promise<Pick<StudioProjectRow, "userId" | "mediaKind" | "companyId" | "state" | "storyboard"> | null>;
  };
  resumes: { findById(id: string): Promise<Pick<ResumeRow, "userId" | "content"> | null> };
}

export interface ResolvedTemplateSource {
  mediaKind: string;
  /** The studio project it was forked from (soft link); null for a résumé. */
  sourceProjectId: string | null;
  /** Company that owns the source (royalties accrue to it); null for a résumé. */
  companyId: string | null;
  snapshot: TemplateSnapshot;
}

/** The one source a publish names — exactly one of the two ids. */
export function templateSourceRef(input: { sourceProjectId?: string; sourceResumeId?: string }): TemplateSourceRef {
  if (input.sourceResumeId && !input.sourceProjectId) return { kind: "resume", id: input.sourceResumeId };
  if (input.sourceProjectId && !input.sourceResumeId) return { kind: "project", id: input.sourceProjectId };
  throw new StudioTemplatesError("VALIDATION_ERROR", "Publish from exactly one source: a studio project or a résumé.");
}

export async function resolveTemplateSource(
  repos: TemplateSourceRepos,
  ref: TemplateSourceRef,
  userId: string,
  livePayload: unknown,
): Promise<ResolvedTemplateSource> {
  return ref.kind === "resume"
    ? resolveResume(repos, ref.id, userId, livePayload)
    : resolveProject(repos, ref.id, userId, livePayload);
}

async function resolveProject(
  repos: TemplateSourceRepos,
  projectId: string,
  userId: string,
  livePayload: unknown,
): Promise<ResolvedTemplateSource> {
  const project = await repos.media.findStudioProjectById(projectId);
  if (!project || project.userId !== userId) {
    throw new StudioTemplatesError("NOT_FOUND", "Source studio project not found.");
  }
  // The template is the same kind as what the creator authored (no "what
  // kind?" form field). Null = a legacy pre-#894 row → 'video'.
  const mediaKind = project.mediaKind ?? "video";
  const isDocument = mediaKind === "document";
  // `video_script` is the generic payload for EVERY kind: a document's
  // design is its `state` (DocumentState), everything else the storyboard.
  // V2 editors send the live payload instead of mirroring it on save.
  const payload = livePayload ?? (isDocument ? project.state : project.storyboard);
  if (!payload) {
    throw new StudioTemplatesError(
      "VALIDATION_ERROR",
      isDocument
        ? "Source document has no saved layout yet — save the project before publishing it as a template."
        : "Source project has no script yet — save the project before publishing as a template.",
    );
  }
  return {
    mediaKind,
    sourceProjectId: projectId,
    companyId: project.companyId ?? null,
    snapshot: templateSnapshotFor(mediaKind, payload),
  };
}

async function resolveResume(
  repos: TemplateSourceRepos,
  resumeId: string,
  userId: string,
  livePayload: unknown,
): Promise<ResolvedTemplateSource> {
  const resume = await repos.resumes.findById(resumeId);
  if (!resume) throw new StudioTemplatesError("NOT_FOUND", "Résumé not found.");
  if (resume.userId !== userId) {
    throw new StudioTemplatesError("FORBIDDEN", "You can only save your own résumé's design as a template.");
  }
  // A résumé design is always a résumé document (forced kind), so the one
  // strip choice in templateSnapshotFor takes the strict strip.
  const snapshot = templateSnapshotFor("document", asResumeDocument(livePayload ?? storedResumeDesign(resume.content)));
  if (!isWearableResumeTemplate(snapshot.videoScript)) {
    throw new StudioTemplatesError("VALIDATION_ERROR", "This résumé has no design to save yet — pick a design first.");
  }
  return { mediaKind: "document", sourceProjectId: null, companyId: null, snapshot };
}

/** A résumé's design is a résumé document whatever kind its payload claims. */
function asResumeDocument(design: unknown): Record<string, unknown> {
  const fields = design && typeof design === "object" ? (design as Record<string, unknown>) : {};
  return { ...fields, entityKind: "resume" };
}

/** The design a résumé row stores in `content.meta` (frontend
 *  lib/resume-design.ts is the reader): its studio page layout when it has
 *  one, else the built-in design it names. Null when neither. */
export function storedResumeDesign(content: unknown): Record<string, unknown> | null {
  const meta = (content as { meta?: unknown } | null)?.meta;
  if (!meta || typeof meta !== "object") return null;
  const { documentLayout, template } = meta as { documentLayout?: unknown; template?: unknown };
  if (documentLayout && typeof documentLayout === "object") return documentLayout as Record<string, unknown>;
  return typeof template === "string" ? { entityKind: "resume", entityId: null, templateId: template, pages: [] } : null;
}

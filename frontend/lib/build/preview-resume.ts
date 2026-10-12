/**
 * Wrap parsed resume content in the `Resume` envelope the declarative renderer
 * expects. Same approach TemplatePreview uses (SAMPLE_RESUME as the envelope),
 * with the visitor's own content swapped in — nothing here is persisted.
 */
import type { ResumeContent } from "@shared/resume";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import type { Resume } from "@/types/resume";

export const BUILD_PREVIEW_ID = "build-preview";

export function toPreviewResume(content: ResumeContent, title: string): Resume {
  return {
    ...SAMPLE_RESUME,
    id: BUILD_PREVIEW_ID,
    userId: "",
    title,
    privacy: "private",
    status: "draft",
    isOwner: false,
    content,
  };
}

/** Title for a resume created from the kit workspace: the person's name, else a fallback. */
export function resumeTitle(content: ResumeContent | null, fallback: string): string {
  return (content?.basics?.name ?? "").trim() || fallback;
}

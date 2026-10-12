/**
 * Resume tab of the kit preview: the visitor's content rendered through
 * the SAME declarative renderer as /resumes/:id (a paper artifact — the
 * renderer pins its own force-light-scope), with the chosen template +
 * structure. The page is also the way into editing: each section carries the
 * renderer's edit pencil, which opens that section's editor in the panel.
 */
import { useTranslation } from "react-i18next";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import type { ResumeAnnotations } from "@/components/resume-renderer/annotations";
import type { ResumeInlineEdit } from "@/components/resume-renderer/inline-edit";
import type { Resume } from "@/types/resume";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

interface ResumePreviewPaneProps {
  resume: Resume;
  descriptor: ResumeTemplateDescriptor;
  /** Opens a section's editor; the pencils render only when set. */
  onEditSection?: (sectionKey: string) => void;
  /** CSS zoom of the page (1 = fill the column). */
  zoom?: number;
  /** Review marks / cards on the page (a merge, tailor or job review). */
  annotations?: ResumeAnnotations;
  /** On a host's paper (the kit's document stage): no frame of its own. */
  bare?: boolean;
  /** The page is the form: double-click a field to type in place
   *  (inline-edit.tsx). Omit for a read-only page. */
  inlineEdit?: ResumeInlineEdit;
}

export default function ResumePreviewPane({ resume, descriptor, onEditSection, zoom = 1, annotations, bare = false, inlineEdit }: ResumePreviewPaneProps) {
  const { t } = useTranslation();
  return (
    <div className={bare ? "w-full" : "mx-auto w-full max-w-[880px]"} style={bare ? undefined : { zoom }}>
      <article
        aria-label={t("build.resume.previewLabel")}
        className={bare ? undefined : "overflow-hidden rounded-md shadow-[0_1px_0_hsl(var(--input)),0_30px_60px_-36px_hsl(var(--ink)/0.45)]"}
      >
        <DeclarativeResumeRenderer
          resume={resume}
          descriptor={descriptor}
          isOwner={Boolean(onEditSection)}
          onEditSection={onEditSection}
          annotations={annotations}
          inlineEdit={inlineEdit}
        />
      </article>
    </div>
  );
}

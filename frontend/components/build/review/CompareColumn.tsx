/** One page of the compare panel: a label row and the résumé, in its own
 *  scroll box (so "Scroll together" can tie the two boxes). */
import { forwardRef, type ReactNode } from "react";
import ResumePreviewPane from "@/components/build/ResumePreviewPane";
import type { ResumeAnnotations } from "@/components/resume-renderer/annotations";
import type { Resume } from "@/types/resume";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

interface CompareColumnProps {
  label: ReactNode;
  meta?: ReactNode;
  resume: Resume | null;
  descriptor: ResumeTemplateDescriptor;
  annotations?: ResumeAnnotations;
  onScroll?: () => void;
  emptyText: string;
}

const CompareColumn = forwardRef<HTMLDivElement, CompareColumnProps>(function CompareColumn(
  { label, meta, resume, descriptor, annotations, onScroll, emptyText },
  ref,
) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-foreground">
        <strong className="tracking-[0.06em]">{label}</strong>
        {meta && <span className="text-muted-foreground">{meta}</span>}
      </div>
      <div ref={ref} onScroll={onScroll} className="min-h-[50vh] flex-1 overflow-y-auto rounded-md sm:min-h-0">
        {resume ? (
          <ResumePreviewPane resume={resume} descriptor={descriptor} annotations={annotations} />
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        )}
      </div>
    </div>
  );
});

export default CompareColumn;

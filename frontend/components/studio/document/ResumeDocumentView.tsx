/**
 * ResumeDocumentView — renders a resume `DocumentState` through the canonical
 * `DeclarativeResumeRenderer` (the SAME engine `/resumes/:id` uses), so the
 * studio preview, the detail view, and the printed PDF are one renderer with
 * columns, themes, hero, and per-section layout. Replaces `DocumentView`'s
 * generic single-column block render for the resume entity kind.
 *
 * The descriptor is bridged from the canvas state via
 * `descriptorFromResumeDocument` (template id → full declarative descriptor +
 * the canvas's live theme + section order).
 */
import type { Resume, ResumeData } from "@/types/resume";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import { descriptorFromResumeDocument } from "@/lib/studio/document/resume-document-descriptor";

interface ResumeDocumentViewProps {
  state: DocumentState;
  content?: ResumeData | null;
  className?: string;
}

export default function ResumeDocumentView({
  state,
  content,
  className,
}: ResumeDocumentViewProps) {
  const descriptor = descriptorFromResumeDocument(state);
  // DeclarativeResumeRenderer reads only `.content` and `.title`; the rest of
  // the Resume row is irrelevant to rendering, so a minimal object suffices.
  const name =
    (content?.basics?.name as string | undefined)?.trim() || "Resume";
  const resume = {
    id: state.entityId ?? "",
    title: name,
    content: content ?? undefined,
  } as unknown as Resume;

  return (
    <div className={className}>
      <DeclarativeResumeRenderer resume={resume} descriptor={descriptor} />
    </div>
  );
}

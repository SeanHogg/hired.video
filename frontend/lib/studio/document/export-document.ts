/**
 * exportDocument — single entry point for "export/print this document".
 *
 * Resume documents export through the in-app declarative PDF route (the same
 * `DeclarativeResumeRenderer` the preview + `/resumes/:id` view use), so the
 * PDF matches what the user sees — columns, themes, hero. Other document kinds
 * (articles / blogs / free-form) use the popup print of `DocumentView`.
 *
 * Centralised so the editor's Export button and the preview overlay's Print
 * button never drift (DRY). Returns false only when a popup was blocked so the
 * caller can surface a hint.
 */
import { printDocument } from "@/lib/studio/document/print-document";
import { downloadResume } from "@/lib/resume-download";
import { descriptorFromResumeDocument } from "@/lib/studio/document/resume-document-descriptor";
import type {
  DocumentEntityContent,
  DocumentState,
} from "@/lib/studio/editor-v2/document-state";

export async function exportDocument(
  state: DocumentState,
  content: DocumentEntityContent | null,
  title?: string,
): Promise<boolean> {
  if (state.entityKind === "resume" && state.entityId) {
    await downloadResume({
      id: state.entityId,
      format: "pdf",
      descriptor: descriptorFromResumeDocument(state),
    });
    return true;
  }
  return printDocument(state, content, title);
}

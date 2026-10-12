/**
 * The document format's surface (#1912): the template / section Tools tab,
 * a job's screening inspector (#1918) or a company's embed settings (#1915),
 * the document preview, the document history and the paged `<DocumentStage>`
 * canvas.
 */
import { LayoutTemplate } from "lucide-react";
import DocumentStage from "@/components/studio/document/DocumentStage";
import DocumentLeftPanel from "@/components/studio/document/DocumentLeftPanel";
import EmbedSettings from "@/components/company/EmbedSettings";
import JobDocumentInspector from "./JobDocumentInspector";
import type { DocumentSurfaceCtx, StudioFormatSurface } from "../types";
import { documentImageGenerator } from "./document-ai-generator";

export const documentSurface: StudioFormatSurface<DocumentSurfaceCtx> = {
  leftTabs: (ctx) => {
    const { t } = ctx;
    const { documentState, setDocumentState, documentCommit, documentStateHydrated } = ctx.document;
    if (!documentStateHydrated) return [];
    return [
      {
        id: "widgets",
        label: t("studio.editor.panelTools"),
        icon: LayoutTemplate,
        content: (
          <DocumentLeftPanel state={documentState} setState={setDocumentState} commit={documentCommit} />
        ),
      },
    ];
  },
  // An image from the AI panel lands as an image block on the page (#1934).
  aiGenerator: documentImageGenerator,
  // Called only for a job document or a saved company document
  // (format-runtime `hasInspector` → document-inspectors.ts).
  inspector: (ctx) => {
    const { t } = ctx;
    const { documentState } = ctx.document;
    if (documentState.entityKind === "company") {
      return {
        title: t("studio.editorV2.panelEmbed"),
        // The company's embed keys + snippets (owner-gated server-side) —
        // moved here from the retired CompanyBuilder form (#1915).
        content: (
          <div className="p-3">
            <EmbedSettings companyId={documentState.entityId ?? ""} />
          </div>
        ),
      };
    }
    return {
      // The job's video, geo tags and (once saved) screening setup (#1915).
      title: t("studio.editorV2.panelJob"),
      content: (
        <JobDocumentInspector
          entityId={documentState.entityId}
          content={ctx.document.documentEntityContent}
          onContentChange={ctx.document.setDocumentEntityContent}
          navigate={ctx.navigate}
        />
      ),
    };
  },
  preview: (ctx) => ({ label: ctx.t("actions.preview"), onClick: () => ctx.dialogs.setDocPreviewOpen(true) }),
  history: (ctx) => {
    const { documentUndo, documentRedo, documentCanUndo, documentCanRedo } = ctx.document;
    return { undo: documentUndo, redo: documentRedo, canUndo: documentCanUndo, canRedo: documentCanRedo };
  },
};

export function documentCanvas(ctx: DocumentSurfaceCtx) {
  const {
    documentState,
    setDocumentState,
    documentCommit,
    documentStateHydrated,
    documentEntityContent,
    setDocumentEntityContent,
  } = ctx.document;
  return documentStateHydrated ? (
    <DocumentStage
      state={documentState}
      setState={setDocumentState}
      commit={documentCommit}
      zoom={ctx.zoom}
      entityContent={documentEntityContent}
      onContentChange={setDocumentEntityContent}
    />
  ) : null;
}

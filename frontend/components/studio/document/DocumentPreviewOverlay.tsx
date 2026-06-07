/**
 * DocumentPreviewOverlay — fullscreen, read-only review of a `DocumentState`
 * for the document mediaKind (resume today). The document analogue of the
 * Timeline `<PreviewOverlay>`: distraction-free chrome (close + view-mode
 * toggle + print) wrapping the canonical `<DocumentPagedView>`, so what the
 * user reviews here is exactly what `DocumentStage` authors and what
 * `printDocument` exports ("preview === render === print").
 */
import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResumeData } from "@/types/resume";
import type { DocumentState } from "@/lib/studio/editor-v2/document-state";
import { exportDocument } from "@/lib/studio/document/export-document";
import DocumentPagedView, {
  DocumentViewModeToggle,
  type DocumentViewMode,
} from "@/components/studio/document/DocumentPagedView";

interface DocumentPreviewOverlayProps {
  state: DocumentState;
  content?: ResumeData | null;
  title?: string;
  onClose: () => void;
}

export default function DocumentPreviewOverlay({
  state,
  content,
  title,
  onClose,
}: DocumentPreviewOverlayProps) {
  // Default to the two-up flip spread — the "review how it paginates" view the
  // continuous editor canvas can't show.
  const [viewMode, setViewMode] = useState<DocumentViewMode>("paged");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-sm">
      <header className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="truncate text-sm font-medium text-white/90">
          {title || "Preview"}
        </span>
        <DocumentViewModeToggle value={viewMode} onChange={setViewMode} />
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1"
            onClick={() => void exportDocument(state, content ?? null, title)}
          >
            <Printer className="h-4 w-4" /> Print / PDF
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-9 w-9 rounded-full p-0 text-white hover:bg-white/10"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 items-start justify-center overflow-auto p-6">
        <DocumentPagedView state={state} content={content} mode={viewMode} className="w-full" />
      </div>
    </div>
  );
}

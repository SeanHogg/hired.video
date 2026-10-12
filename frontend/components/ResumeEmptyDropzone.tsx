import { FileText, Plus, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import ResumeUploadSheet from "@/components/ResumeUploadSheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ResumeUploadResponse } from "@/types/resume";

interface ResumeEmptyDropzoneProps {
  /** Called after a successful upload — receives the ResumeUploadResponse so the
   *  parent can refetch lists, navigate, or advance a wizard step. */
  onUploadSuccess: (response: ResumeUploadResponse) => void;
  /** Optional override for the heading text. */
  title?: string;
  /** Optional override for the secondary text. */
  description?: string;
  /** When provided, renders a "Create Resume" button alongside upload. */
  onCreateResume?: () => void;
  /** Compact variant for use inside cards / wizard steps where the parent
   *  already supplies its own outer padding. */
  compact?: boolean;
}

/**
 * Reusable empty-state card for "user has no resume here yet". Accepts a file
 * via drag-drop or the inline button — both paths open the shared
 * ResumeUploadSheet so the upload form, parsing, and master-resume defaulting
 * stay in one place.
 *
 * Used by the /resumes empty state, the Studio "Your Resume" wizard step, and
 * the Video Resume wizard. Each consumer supplies its own onUploadSuccess so
 * the dropzone doesn't have to know about navigation, wizard advancement, or
 * list refetching.
 */
export default function ResumeEmptyDropzone({
  onUploadSuccess,
  title = "No resumes yet",
  description = "Drop your resume here, or click to upload. We'll parse PDF, Word, Markdown, JSON, and plain text.",
  onCreateResume,
  compact = false,
}: ResumeEmptyDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    setPendingFile(dropped);
    setSheetOpen(true);
  }, []);

  const handleSheetChange = useCallback((open: boolean) => {
    setSheetOpen(open);
    if (!open) setPendingFile(null);
  }, []);

  const inner = (
    <div
      className={`flex flex-col items-center justify-center text-center transition-colors ${
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40"
      } border-2 border-dashed rounded-lg ${compact ? "p-6" : "p-12"}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <FileText className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-6 max-w-md">{description}</p>
      <div className="flex flex-wrap gap-2 justify-center">
        <Button
          onClick={() => {
            setPendingFile(null);
            setSheetOpen(true);
          }}
          variant="outline"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Resume
        </Button>
        {onCreateResume && (
          <Button onClick={onCreateResume}>
            <Plus className="h-4 w-4 mr-2" />
            Create Resume
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {compact ? (
        inner
      ) : (
        <Card>
          <CardContent className="p-6">{inner}</CardContent>
        </Card>
      )}

      <ResumeUploadSheet
        open={sheetOpen}
        onOpenChange={handleSheetChange}
        onSuccess={(response) => {
          setPendingFile(null);
          onUploadSuccess(response);
        }}
        initialFile={pendingFile}
      />
    </>
  );
}

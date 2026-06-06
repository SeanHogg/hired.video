import { Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ResumeUpload from "@/components/ResumeUpload";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { ResumeUploadResponse } from "@/types/resume";

interface ResumeUploadSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful upload — receives the response. If omitted,
   *  opens the resume on the Studio document canvas (#1915). */
  onSuccess?: (response: ResumeUploadResponse) => void;
  /** Pre-fill the dropzone when the sheet opens. Lets parents collect a file
   *  via their own drag-drop affordance (e.g. ResumeEmptyDropzone) and hand
   *  it off without forcing the user to drop a second time. */
  initialFile?: File | null;
}

export default function ResumeUploadSheet({
  open,
  onOpenChange,
  onSuccess,
  initialFile = null,
}: ResumeUploadSheetProps) {
  const navigate = useNavigate();

  const handleSuccess = (response: ResumeUploadResponse) => {
    onOpenChange(false);
    if (onSuccess) {
      onSuccess(response);
    } else {
      navigate(`/studio?editResume=${response.id}`);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col p-0 overflow-hidden"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Upload className="h-5 w-5 text-primary" />
            Upload Resume
          </SheetTitle>
          <SheetDescription>
            Upload your existing resume and let AI convert it to our format.
            Supports PDF, Word, Markdown, JSON, and text files.
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable content area — important for small screens / PWA */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ResumeUpload
            onUploadSuccess={handleSuccess}
            onCancel={handleCancel}
            compact
            initialFile={initialFile}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

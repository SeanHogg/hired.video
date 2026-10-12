// Shared "picked file" row (icon tile + name + size + remove button) used by
// the multi-step tool inputs (JobInputStep, ResumeSelectionStep).

import { FileText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface SelectedFileRowProps {
  file: File;
  onRemove: () => void;
  disabled?: boolean;
}

export function SelectedFileRow({ file, onRemove, disabled }: SelectedFileRowProps) {
  const { t } = useTranslation();
  return (
    <div className="border border-border rounded-xl p-4 bg-muted">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-medium truncate">{file.name}</p>
            <p className="text-sm text-muted-foreground">
              {t("toolSteps.common.fileSizeMb", { size: (file.size / 1024 / 1024).toFixed(2) })}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 min-w-11"
          onClick={onRemove}
          disabled={disabled}
          aria-label={t("toolSteps.common.removeFile")}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

// KanbanToolbar — bulk actions on the left, share / report / export / add
// on the right. Lifted out of JobPipelineKanban so the parent component
// stays focused on layout + DnD wiring.

import { useTranslation } from "react-i18next";
import {
  Download,
  FileText,
  FolderPlus,
  Plus,
  Send,
  Share,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PIPELINE_STAGES,
  type PipelineStage,
} from "@shared/recruiter-pipeline";

interface KanbanToolbarProps {
  selectionCount: number;
  onClearSelection: () => void;
  onBulkMove: (stage: PipelineStage) => void;
  onAddToList: () => void;
  onExport: () => void;
  onPrint: () => void;
  onShare: () => void;
  onAddPeople: () => void;
}

export default function KanbanToolbar({
  selectionCount,
  onClearSelection,
  onBulkMove,
  onAddToList,
  onExport,
  onPrint,
  onShare,
  onAddPeople,
}: KanbanToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-2 bg-muted/30">
      <div className="flex flex-wrap items-center gap-1">
        {selectionCount > 0 && (
          <span className="text-xs font-medium text-muted-foreground mr-2">
            {t("labels.selectedCount", { count: selectionCount })}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={selectionCount === 0}>
              <Send className="w-3.5 h-3.5 mr-1" />
              {t("actions.moveStage")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel>
              {t("labels.moveCountTo", { count: selectionCount })}
            </DropdownMenuLabel>
            {PIPELINE_STAGES.filter((s) => s !== "rejected").map((s) => (
              <DropdownMenuItem key={s} onClick={() => onBulkMove(s)}>
                {t(`pipelineStage.${s}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onBulkMove("rejected")}
          disabled={selectionCount === 0}
        >
          <X className="w-3.5 h-3.5 mr-1" />
          {t("actions.reject")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onBulkMove("submitted")}
          disabled={selectionCount === 0}
        >
          <Send className="w-3.5 h-3.5 mr-1" />
          {t("actions.submitCandidates")}
        </Button>
        {selectionCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearSelection}>
            {t("actions.clear")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onAddToList}
          disabled={selectionCount === 0}
        >
          <FolderPlus className="w-3.5 h-3.5 mr-1" />
          {t("actions.addToEllipsis")}
        </Button>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="w-3.5 h-3.5 mr-1" />
          {t("actions.export")}
        </Button>
        <Button variant="outline" size="sm" onClick={onPrint}>
          <FileText className="w-3.5 h-3.5 mr-1" />
          {t("actions.report")}
        </Button>
        <Button variant="outline" size="sm" onClick={onShare}>
          <Share className="w-3.5 h-3.5 mr-1" />
          {t("actions.share")}
        </Button>
        <Button size="sm" onClick={onAddPeople}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          {t("actions.addPeople")}
        </Button>
      </div>
    </div>
  );
}

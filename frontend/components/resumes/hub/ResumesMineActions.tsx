import { Upload, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import ListsButton from "@/components/lists/ListsButton";
import type { ViewMode } from "@/lib/hooks/useViewMode";

interface ResumesMineActionsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  includeArchived: boolean;
  onToggleArchived: () => void;
  onUpload: () => void;
  onCreate: () => void;
}

/** Header actions of the "My resumes" tab. */
export default function ResumesMineActions({
  viewMode,
  onViewModeChange,
  includeArchived,
  onToggleArchived,
  onUpload,
  onCreate,
}: ResumesMineActionsProps) {
  const { t } = useTranslation();
  return (
    <>
      <Button onClick={onUpload} variant="outline">
        <Upload className="h-4 w-4 mr-2" />
        {t("actions.uploadResumeAction")}
      </Button>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4 mr-2" />
        {t("headings.createResumeHeading")}
      </Button>
      <ViewModeToggle
        value={viewMode}
        onChange={onViewModeChange}
        modes={BROWSE_VIEW_MODES}
      />
      <ListsButton entityType="resume" />
      {/* #154 — Include archived. Off by default. Toggling refetches via
          the includeArchived useEffect dep. */}
      <Button
        variant={includeArchived ? "secondary" : "outline"}
        size="sm"
        onClick={onToggleArchived}
        title={t("messages.resumes.showArchivedTooltip")}
      >
        {includeArchived ? t("actions.resumes.hidingNone") : t("actions.resumes.includeArchived")}
      </Button>
    </>
  );
}

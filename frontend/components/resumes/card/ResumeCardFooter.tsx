import { Eye, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatStudioSubject } from "@shared/studio-subject";
import { Button } from "@/components/ui/button";
import { ResumeActionsMenu } from "@/components/ResumeActionsMenu";
import type { ResumeCardProps } from "./types";
import { viewResumeOrNavigate } from "./use-resume-card-model";

type ResumeCardFooterProps = Pick<
  ResumeCardProps,
  | "id"
  | "parentId"
  | "ownership"
  | "onView"
  | "onEdit"
  | "onRename"
  | "onAddMedia"
  | "onCreateVariation"
  | "onSetActive"
  | "onShare"
  | "onCopyLink"
  | "onShowQR"
  | "onDownload"
  | "onChangePrivacy"
  | "onPromoteToMaster"
  | "onCopyToMaster"
  | "onDelete"
  | "onArchive"
  | "onUnarchive"
  | "onViewVersionHistory"
  | "onTrack"
  | "onContactOwner"
  | "onViewToolHistory"
  | "onViewAnalytics"
> & {
  isOwner: boolean;
  isActive: boolean;
  isMaster: boolean;
  isArchived: boolean;
  canCreateVariation: boolean;
  /** Resolved clone handler (owner-only; undefined hides the item). */
  onClone?: () => void;
};

/** Owner-style action row: View / Variation / Create Video + overflow menu. */
export default function ResumeCardFooter({
  id,
  parentId,
  ownership,
  isOwner,
  isActive,
  isMaster,
  isArchived,
  canCreateVariation,
  onView,
  onEdit,
  onRename,
  onAddMedia,
  onCreateVariation,
  onSetActive,
  onShare,
  onCopyLink,
  onShowQR,
  onDownload,
  onChangePrivacy,
  onPromoteToMaster,
  onCopyToMaster,
  onClone,
  onDelete,
  onArchive,
  onUnarchive,
  onViewVersionHistory,
  onTrack,
  onContactOwner,
  onViewToolHistory,
  onViewAnalytics,
}: ResumeCardFooterProps) {
  const { t } = useTranslation();
  return (
    <div className="p-4 bg-background border-t border-border flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            viewResumeOrNavigate(id, onView);
          }}
          className="gap-2"
        >
          <Eye className="w-4 h-4" />
          {t("resumeCard.view")}
        </Button>
        {canCreateVariation && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onCreateVariation?.();
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            {t("resumeCard.variation")}
          </Button>
        )}
        {/* Studio deep-link (#270) — owner-only, sits right next to
            "Variation" so the discoverability is at parity. */}
        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            asChild
            className="gap-2"
          >
            <Link
              to={`/studio?subject=${formatStudioSubject({ kind: "resume", id })}&new=1`}
              onClick={(e) => e.stopPropagation()}
            >
              <Plus className="w-4 h-4" />
              {t("resumeCard.createVideo")}
            </Link>
          </Button>
        )}
      </div>
      <ResumeActionsMenu
        resumeId={id}
        isOwner={isOwner}
        isActive={isActive}
        isMaster={isMaster}
        parentId={parentId}
        onView={onView}
        onEdit={onEdit}
        onRename={onRename}
        onAddMedia={onAddMedia}
        onCreateVariation={onCreateVariation}
        onSetActive={onSetActive}
        onShare={onShare}
        onCopyLink={onCopyLink}
        onShowQR={onShowQR}
        onDownload={onDownload}
        onChangePrivacy={onChangePrivacy}
        onPromoteToMaster={onPromoteToMaster}
        onCopyToMaster={onCopyToMaster}
        onClone={onClone}
        onDelete={onDelete}
        isArchived={isArchived}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        onViewVersionHistory={onViewVersionHistory}
        isTracked={ownership === "tracked"}
        onTrack={onTrack}
        onContactOwner={onContactOwner}
        onViewToolHistory={onViewToolHistory}
        onViewAnalytics={onViewAnalytics}
      />
    </div>
  );
}

import {
  Eye,
  Calendar,
  Star,
  Copy,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import CardHeaderWithAvatar from "@/components/ui/CardHeaderWithAvatar";
import CardActions from "@/components/ui/CardActions";
import { OwnerMetricsRow, Metric } from "@/components/ui/OwnerMetricsRow";
import { ResumeActionsMenu } from "@/components/ResumeActionsMenu";
import { formatDate } from "@/lib/utils";
import { visibilityHeaderBadge } from "@/lib/visibility-config";
import { buildTrackAction } from "@/lib/card-track-action";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
import type { ResumePrivacy } from "@/types/resume";

interface ResumeCardProps {
  id: string;
  slug?: string;
  name: string;
  title?: string;
  summary: string;
  createdAt: string;
  views?: number;
  privacy?: "public" | "recruiter_only" | "connections" | "private" | "draft";
  isMaster?: boolean;
  isActive?: boolean;
  parentId?: string;
  ownership?: "owned" | "tracked";
  actions?: DynamicCardAction[];
  userContext?: UserContext;
  itemOwnership?: ItemOwnership;
  onView?: () => void;
  /** @deprecated Use individual action handlers instead */
  onActions?: () => void;
  // Individual action handlers (consistent with list view)
  onEdit?: () => void;
  onAddMedia?: () => void;
  onCreateVariation?: () => void;
  onSetActive?: () => void;
  onShare?: () => void;
  onDownload?: () => void;
  onChangePrivacy?: (privacy: ResumePrivacy) => void;
  onPromoteToMaster?: () => void;
  onDelete?: () => void;
  onTrack?: () => void;
  onContactOwner?: () => void;
  onRunTool?: (toolId: string) => void;
}

export default function ResumeCard({
  id,
  slug,
  name,
  title,
  summary,
  createdAt,
  views = 0,
  privacy = "private",
  isMaster = false,
  isActive = false,
  parentId,
  ownership = "owned",
  actions,
  userContext: _userContext,
  itemOwnership: _itemOwnership,
  onView,
  onActions,
  onEdit,
  onAddMedia,
  onCreateVariation,
  onSetActive,
  onShare,
  onDownload,
  onChangePrivacy,
  onPromoteToMaster,
  onDelete,
  onTrack,
  onContactOwner,
  onRunTool,
}: ResumeCardProps) {
  const isOwner = ownership === "owned";

  // Prepare badges for header. Tracked state lives in the bottom action row,
  // not the header, so every content type exposes tracking the same way.
  const badges = [];

  if (isActive) {
    badges.push({
      text: "Active",
      variant: "secondary" as const,
      className: "text-xs bg-green-100 text-green-800",
      icon: Target,
    });
  }

  if (isMaster) {
    badges.push({
      text: "Master",
      variant: "secondary" as const,
      className: "text-xs bg-yellow-100 text-yellow-800",
      icon: Star,
    });
  }

  if (parentId) {
    badges.push({
      text: "Variation",
      variant: "outline" as const,
      className: "text-xs",
      icon: Copy,
    });
  }

  badges.push(visibilityHeaderBadge(privacy));
  const hasIndividualHandlers = onEdit || onAddMedia || onCreateVariation || onSetActive || onDownload || onChangePrivacy || onPromoteToMaster || onDelete || onTrack || onContactOwner || onShare;

  // Fallback actions for legacy usage (dynamic actions or onActions modal trigger).
  // Tracking goes into the bottom action row for consistency with every other card type.
  const fallbackActions: DynamicCardAction[] = [
    {
      id: "view",
      label: "View",
      variant: "outline",
      icon: Eye,
      onClick: () => {
        if (onView) {
          onView();
        } else {
          window.location.href = `/resumes/${id}`;
        }
      },
    },
  ];
  if (onTrack) {
    fallbackActions.push(
      buildTrackAction({
        isTracked: ownership === "tracked",
        onToggle: (e) => {
          e.stopPropagation();
          onTrack();
        },
      }),
    );
  }
  fallbackActions.push({
    id: "actions",
    label: "Actions",
    variant: "default",
    icon: Eye,
    onClick: () => onActions?.(),
  });
  const cardActions = actions && actions.length > 0 ? actions : fallbackActions;

  return (
    <BaseCard>
      <CardHeaderWithAvatar
        title={name}
        subtitle={title}
        avatar={{
          src: undefined, // Resumes don't typically have avatars
          fallback: "R",
          size: "md",
        }}
        badges={badges}
        linkTo={`/resumes/${id}`}
      />

      <CardContent>
        <div className="space-y-4">
          {/* Professional Summary */}
          <div className="p-4 bg-primary text-primary-foreground rounded-lg">
            <h4 className="font-bold text-lg mb-2">Professional Summary</h4>
            <p className="text-sm leading-relaxed opacity-95 line-clamp-3">
              {summary}
            </p>
          </div>

          {/* Metadata - Mobile Responsive Layout */}
          <div className="space-y-2 text-xs text-muted-foreground">
            {/* Created Date Row */}
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              <span className="text-xs">CREATED</span>
              <span className="font-medium text-foreground">
                {formatDate(createdAt, { year: "numeric", month: "short", day: "numeric" }, "No date")}
              </span>
            </div>

            {/* Owner-only engagement metrics. Non-owners never see these. */}
            <OwnerMetricsRow isOwner={isOwner} className="gap-2">
              <Metric icon={Eye} value={views || 0} label="views" />
            </OwnerMetricsRow>

            {/* Slug Row - Only show if exists */}
            {slug && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Slug:</span>
                <span className="font-mono text-foreground break-all">{slug}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>

      {hasIndividualHandlers ? (
        <div className="p-4 bg-background border-t border-border flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              if (onView) onView();
              else window.location.href = `/resumes/${id}`;
            }}
            className="gap-2"
          >
            <Eye className="w-4 h-4" />
            View
          </Button>
          <ResumeActionsMenu
            isOwner={isOwner}
            isActive={isActive}
            isMaster={isMaster}
            parentId={parentId}
            onView={onView}
            onEdit={onEdit}
            onAddMedia={onAddMedia}
            onCreateVariation={onCreateVariation}
            onSetActive={onSetActive}
            onShare={onShare}
            onDownload={onDownload}
            onChangePrivacy={onChangePrivacy}
            onPromoteToMaster={onPromoteToMaster}
            onDelete={onDelete}
            isTracked={ownership === "tracked"}
            onTrack={onTrack}
            onContactOwner={onContactOwner}
            onRunTool={onRunTool}
          />
        </div>
      ) : (
        <CardActions actions={cardActions} />
      )}
    </BaseCard>
  );
}

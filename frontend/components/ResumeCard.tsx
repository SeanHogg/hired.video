import {
  Eye,
  Calendar,
  Star,
  Copy,
  Target,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import type { ResumePrivacy, ResumeWithOwnership } from "@/types/resume";

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
  parentName?: string;
  diffPercent?: number | null;
  // When this card represents a parent, its children are rendered as a
  // horizontal preview slider inside the card. Pass the full hydrated list
  // from the page so we can deep-link to each variant.
  variations?: ResumeWithOwnership[];
  ownership?: "owned" | "tracked";
  actions?: DynamicCardAction[];
  userContext?: UserContext;
  itemOwnership?: ItemOwnership;
  onView?: () => void;
  /** @deprecated Use individual action handlers instead */
  onActions?: () => void;
  // Individual action handlers (consistent with list view)
  onEdit?: () => void;
  onRename?: () => void;
  onAddMedia?: () => void;
  onCreateVariation?: () => void;
  onSetActive?: () => void;
  onShare?: () => void;
  onCopyLink?: () => void;
  onShowQR?: () => void;
  onDownload?: (format: "pdf" | "word" | "json" | "text") => void;
  onChangePrivacy?: (privacy: ResumePrivacy) => void;
  onPromoteToMaster?: () => void;
  onCopyToMaster?: () => void;
  onDelete?: () => void;
  onTrack?: () => void;
  onContactOwner?: () => void;
  onViewToolHistory?: () => void;
  onViewAnalytics?: () => void;
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
  parentName,
  diffPercent,
  variations,
  ownership = "owned",
  actions,
  userContext: _userContext,
  itemOwnership: _itemOwnership,
  onView,
  onActions,
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
  onDelete,
  onTrack,
  onContactOwner,
  onViewToolHistory,
  onViewAnalytics,
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
    const diffLabel = typeof diffPercent === "number" ? ` · ${diffPercent}% diff` : "";
    badges.push({
      text: `Variation${diffLabel}`,
      variant: "outline" as const,
      className: "text-xs",
      icon: Copy,
    });
  }

  badges.push(visibilityHeaderBadge(privacy));
  const hasChildren = Array.isArray(variations) && variations.length > 0;
  const canCreateVariation = isOwner && !!onCreateVariation;
  const hasIndividualHandlers = onEdit || onRename || onAddMedia || onCreateVariation || onSetActive || onDownload || onChangePrivacy || onPromoteToMaster || onCopyToMaster || onDelete || onTrack || onContactOwner || onShare || onCopyLink || onShowQR || onViewAnalytics;

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
          {/* Parent reference — only rendered when this card is a variant.
              Clickable so the user can jump straight to the primary resume. */}
          {parentId && parentName && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Copy className="w-3 h-3 shrink-0" />
              <span>Variation of</span>
              <Link
                to={`/resumes/${parentId}`}
                className="font-medium text-foreground hover:text-primary transition-colors truncate"
                title={parentName}
              >
                {parentName}
              </Link>
            </div>
          )}

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

          {/* Variant previews — only rendered when this resume is a parent. The
              one-level hierarchy means a variant card never shows this slider. */}
          {hasChildren && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {variations!.length} Variation{variations!.length === 1 ? "" : "s"}
                </h4>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
                {variations!.map((child) => (
                  <Link
                    key={child.id}
                    to={`/resumes/${child.id}`}
                    className="snap-start shrink-0 w-48 rounded-md border bg-background hover:bg-muted/40 transition-colors p-3 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium truncate" title={child.title}>
                        {child.title}
                      </span>
                      {child.isActive && (
                        <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-800 shrink-0">
                          Active
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Copy className="w-3 h-3" />
                      <span>
                        {typeof child.diffPercent === "number"
                          ? `${child.diffPercent}% diff`
                          : "Variation"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>

      {hasIndividualHandlers ? (
        <div className="p-4 bg-background border-t border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
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
                Variation
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
            onDelete={onDelete}
            isTracked={ownership === "tracked"}
            onTrack={onTrack}
            onContactOwner={onContactOwner}
            onViewToolHistory={onViewToolHistory}
            onViewAnalytics={onViewAnalytics}
          />
        </div>
      ) : (
        <CardActions actions={cardActions} />
      )}
    </BaseCard>
  );
}

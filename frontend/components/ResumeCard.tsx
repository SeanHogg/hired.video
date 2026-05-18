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
import EntityVideos from "@/components/studio/EntityVideos";
import ResumeScoreBadges from "@/components/tools/ResumeScoreBadges";
import type { ResumeScores } from "@shared/scores";
import { formatStudioSubject } from "@shared/studio-subject";
import { useEntityOwnership } from "@/lib/use-entity-ownership";
import { usePermissions } from "@/hooks/use-permissions";
import { formatDate } from "@/lib/utils";
import { visibilityHeaderBadge } from "@/lib/visibility-config";
import { buildTrackAction } from "@/lib/card-track-action";
import { buildShareAction } from "@/lib/card-share-action";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
import type { ResumePrivacy, ResumeWithOwnership } from "@/types/resume";

interface ResumeCardProps {
  id: string;
  slug?: string;
  /** Resume owner's user id — used by EntityVideos to gate the Create
   *  Video chip and by ownership-aware actions. Required for any surface
   *  that needs to distinguish owner from non-owner; safe to omit only
   *  when an explicit `ownership` prop is provided alongside. */
  userId?: string;
  name: string;
  title?: string;
  summary: string;
  createdAt: string;
  views?: number;
  /** Persisted analytical scores (overall/ats/keyword/format/content/impact)
   *  written by the resume scorer + optimizer. Owner-only — non-owners
   *  never see the score row. */
  scores?: ResumeScores | null;
  /** Sentiment score from the sentiment-analysis tool. Owner-only. */
  sentimentScore?: number | null;
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
  /** Fired when a score chip is clicked. Receives the catalog tool id that
   *  produced the score (e.g. "ai-resume-scorer", "sentiment-analysis"),
   *  so the host can open the tool-history sheet pre-expanded on that
   *  tool. Optional — when omitted the chips render as non-interactive. */
  onScoreClick?: (toolId: string) => void;
  onViewAnalytics?: () => void;
  /** Extra dropdown items appended to the card's overflow menu (e.g. AddToListMenu). */
  extraMenuItems?: React.ReactNode;
}

export default function ResumeCard({
  id,
  slug,
  userId,
  name,
  title,
  summary,
  createdAt,
  views = 0,
  scores,
  sentimentScore,
  privacy = "private",
  isMaster = false,
  isActive = false,
  parentId,
  parentName,
  diffPercent,
  variations,
  ownership,
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
  onScoreClick,
  onViewAnalytics,
  extraMenuItems,
}: ResumeCardProps) {
  // Ownership is centralised in `useEntityOwnership` — single source of
  // truth shared with EntityVideos and every other card surface.
  const { isOwner, isAuthenticated } = useEntityOwnership({ ownerUserId: userId, ownership });
  // Score cluster widens to anyone who can triage candidates at the list
  // level (recruiters / employers / admin / SA). Mirrors the detail-page
  // `canViewStats` gate from `useResumePermissions` (#671).
  const { canManageJobs } = usePermissions();
  const canViewStats = isOwner || canManageJobs;

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
  // `buildTrackAction` self-gates on auth + owner; the null entry is filtered below.
  const fallbackActions: Array<DynamicCardAction | null> = [
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
        isAuthenticated,
        isOwn: isOwner,
        isTracked: ownership === "tracked",
        onToggle: (e) => {
          e.stopPropagation();
          onTrack();
        },
      }),
    );
  }
  // Share — always available, including for unauthenticated viewers.
  // Platform-wide rule: every entity card lets a viewer share. Resume cards
  // mounted through card-factory don't get individual handlers so this is
  // the only path that surfaces Share for them.
  fallbackActions.push(
    buildShareAction({
      entityUrl: `/resumes/${id}`,
      onActions,
      copySuccessDescription: "Resume link has been copied to your clipboard.",
    }),
  );
  const cardActions: DynamicCardAction[] = actions && actions.length > 0
    ? actions
    : fallbackActions.filter((a): a is DynamicCardAction => a !== null);

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
            {/* Created date + view count share a row. Views are owner-only;
                non-owners just see the date. The "X views" Metric retains
                the eye icon so it stays visually parsable in the same row. */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="w-3 h-3 flex-shrink-0" />
                <span className="text-xs">CREATED</span>
                <span className="font-medium text-foreground">
                  {formatDate(createdAt, { year: "numeric", month: "short", day: "numeric" }, "No date")}
                </span>
              </div>
              <OwnerMetricsRow isOwner={isOwner} className="gap-2">
                <Metric icon={Eye} value={views || 0} label="views" />
              </OwnerMetricsRow>
            </div>

            {/* Tool scores row — visible to anyone who can view resume
                stats (owner + recruiter / employer / admin / SA per #671).
                ResumeScoreBadges still self-gates on whether any score has
                been computed yet. Clicking a chip opens the tool-history
                sheet pre-expanded on the tool that produced the score. */}
            {canViewStats && (
              <ResumeScoreBadges
                resume={{ scores, sentimentScore }}
                onChipClick={onScoreClick}
              />
            )}

            {/* Slug Row - Only show if exists */}
            {slug && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Slug:</span>
                <span className="font-mono text-foreground break-all">{slug}</span>
              </div>
            )}
          </div>

          {/* Studio videos linked to this resume (#270). EntityVideos
              re-runs `useEntityOwnership({ ownerUserId })` so its own
              create-chip gate stays in lockstep with this card's
              `isOwner`. */}
          <EntityVideos
            subject={{ kind: "resume", id }}
            ownerUserId={userId}
          />

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
                  Create Video
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
            onDelete={onDelete}
            isTracked={ownership === "tracked"}
            onTrack={onTrack}
            onContactOwner={onContactOwner}
            onViewToolHistory={onViewToolHistory}
            onViewAnalytics={onViewAnalytics}
          />
        </div>
      ) : (
        <CardActions actions={cardActions} extraMenuItems={extraMenuItems} />
      )}
    </BaseCard>
  );
}

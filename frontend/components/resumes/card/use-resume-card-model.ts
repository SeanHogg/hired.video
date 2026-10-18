import { Eye, Star, Copy, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { publicResumePath } from "@shared/public-paths";
import { useEntityOwnership } from "@/lib/use-entity-ownership";
import { usePermissions } from "@/hooks/use-permissions";
import { visibilityHeaderBadge, type HeaderBadgeConfig } from "@/lib/visibility-config";
import { buildTrackAction } from "@/lib/card-track-action";
import { buildShareAction } from "@/lib/card-share-action";
import { resumeService } from "@/lib/services/resume-service";
import { toast } from "@/components/ui/use-toast";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
import type { ResumeCardProps } from "./types";

/** Navigates to the resume's public page, unless the host supplied `onView`. */
export function viewResumeOrNavigate(id: string, onView?: () => void): void {
  if (onView) onView();
  else window.location.href = publicResumePath(id);
}

/**
 * Derived state + default handlers for `ResumeCard`: ownership/stats
 * gates, header badges, the legacy fallback action row and the default
 * Clone handler. Pure view-model — no rendering.
 */
export function useResumeCardModel(props: ResumeCardProps) {
  const {
    id,
    userId,
    name,
    title,
    summary,
    privacy = "private",
    isMaster = false,
    isActive = false,
    parentId,
    diffPercent,
    variations,
    ownership,
    actions,
    onView,
    onActions,
    onEdit,
    onRename,
    onAddMedia,
    onCreateVariation,
    onSetActive,
    onDownload,
    onChangePrivacy,
    onPromoteToMaster,
    onCopyToMaster,
    onDelete,
    onTrack,
    onContactOwner,
    onShare,
    onCopyLink,
    onShowQR,
    onViewAnalytics,
  } = props;
  const { t } = useTranslation();

  // Ownership is centralised in `useEntityOwnership` — single source of
  // truth shared with EntityMedia and every other card surface.
  const { isOwner, isAuthenticated } = useEntityOwnership({ ownerUserId: userId, ownership });
  // Score cluster widens to anyone who can triage candidates at the list
  // level (recruiters / employers / admin / SA). Mirrors the detail-page
  // `canViewStats` gate from `useResumePermissions` (#671).
  const { canManageJobs } = usePermissions();
  const canViewStats = isOwner || canManageJobs;

  // Default clone handler — POST /api/resumes { source: "clone" } via resumeService,
  // then navigate to the clone's edit page. Backend appends " (copy)" to
  // the title and lands the clone as `status: draft`.
  const handleCloneResume = async () => {
    try {
      const cloned = await resumeService.cloneResume(id);
      toast({
        title: t("resumeCard.clonedTitle"),
        description: t("resumeCard.clonedDescription", { title: cloned.title }),
      });
      window.location.href = publicResumePath(cloned.id);
    } catch (err) {
      toast({
        title: t("resumeCard.cloneFailedTitle"),
        description: (err as Error).message || t("resumeCard.cloneFailedDescription"),
        variant: "destructive",
      });
    }
  };

  // Prepare badges for header. Tracked state lives in the bottom action row,
  // not the header, so every content type exposes tracking the same way.
  const badges: HeaderBadgeConfig[] = [];
  if (isActive) {
    badges.push({
      text: t("resumeCard.active"),
      variant: "secondary",
      className: "text-xs bg-green-100 text-green-800",
      icon: Target,
    });
  }
  if (isMaster) {
    badges.push({
      text: t("resumeCard.master"),
      variant: "secondary",
      className: "text-xs bg-yellow-100 text-yellow-800",
      icon: Star,
    });
  }
  if (parentId) {
    badges.push({
      text: typeof diffPercent === "number"
        ? t("resumeCard.variationDiff", { percent: diffPercent })
        : t("resumeCard.variation"),
      variant: "outline",
      className: "text-xs",
      icon: Copy,
    });
  }
  badges.push(visibilityHeaderBadge(privacy));

  const hasChildren = Array.isArray(variations) && variations.length > 0;
  const canCreateVariation = isOwner && !!onCreateVariation;
  const hasIndividualHandlers = !!(onEdit || onRename || onAddMedia || onCreateVariation || onSetActive || onDownload || onChangePrivacy || onPromoteToMaster || onCopyToMaster || onDelete || onTrack || onContactOwner || onShare || onCopyLink || onShowQR || onViewAnalytics);

  // Fallback actions for legacy usage (dynamic actions or onActions modal trigger).
  // Tracking goes into the bottom action row for consistency with every other card type.
  // `buildTrackAction` self-gates on auth + owner; the null entry is filtered below.
  const fallbackActions: Array<DynamicCardAction | null> = [
    {
      id: "view",
      label: t("resumeCard.view"),
      variant: "outline",
      icon: Eye,
      onClick: () => viewResumeOrNavigate(id, onView),
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
      entityUrl: publicResumePath(id),
      shareTitle: title ? `${name} — ${title}` : name,
      shareText: summary || undefined,
      onActions,
      copySuccessDescription: t("resumeCard.linkCopied"),
    }),
  );
  const cardActions: DynamicCardAction[] = actions && actions.length > 0
    ? actions
    : fallbackActions.filter((a): a is DynamicCardAction => a !== null);

  return {
    isOwner,
    canViewStats,
    badges,
    hasChildren,
    canCreateVariation,
    hasIndividualHandlers,
    cardActions,
    handleCloneResume,
  };
}

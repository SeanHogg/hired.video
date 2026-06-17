import {
  MapPin,
  DollarSign,
  Clock,
  Eye,
  Users,
  Edit,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import MarkdownPreview from "@/components/MarkdownPreview";
import CardHeaderWithAvatar from "@/components/ui/CardHeaderWithAvatar";
import CardActions from "@/components/ui/CardActions";
import { OwnerMetricsRow, Metric } from "@/components/ui/OwnerMetricsRow";
import { visibilityHeaderBadge } from "@/lib/visibility-config";
import { promptDialog } from "@/lib/dialogs";
import { useAuth } from "@/lib/auth";
import { useEntityOwnership } from "@/lib/use-entity-ownership";
import { useTrackedJobs } from "@/hooks/use-tracked-jobs";
import { notifyExtension } from "@/hooks/use-extension-bridge";
import { jobService } from "@/lib/services/job-service";
import { toast } from "sonner";
import { useState } from "react";
import type { JobMetadata, JobWithOwnership } from "@/types/job";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
import EntityMedia from "@/components/studio/EntityMedia";
import { JobActionsMenu } from "@/components/JobActionsMenu";

interface JobCardProps {
  job: JobMetadata | JobWithOwnership;
  showOwnership?: boolean;
  /** Legacy DynamicCardAction[] override — only honoured when callers
   *  pass a non-empty array. The default footer now uses `JobActionsMenu`
   *  (mirrors ResumeCard) so callers don't usually need to set this. */
  actions?: DynamicCardAction[];
  userContext?: UserContext;
  itemOwnership?: ItemOwnership;
  layout?: "vertical" | "horizontal";

  onTrack?: (_jobId: string) => void;
  onUntrack?: (_jobId: string) => void;
  onView?: () => void;
  /** Legacy callback fired in place of the default Share action when the
   *  legacy `actions` array is supplied. Kept for `card-factory` callers
   *  that route every action through their `interactions` bag. */
  onActions?: () => void;
  /** Owner-only — opens the analytics dialog for this job. */
  onViewAnalytics?: () => void;
  /** Owner-only — opens the Tool Run History side panel for this job. */
  onViewToolHistory?: () => void;
  /** Owner-only — opens the delete confirmation dialog. */
  onDelete?: () => void;
  /** Owner-only override for Clone. Defaults to calling
   *  `jobService.cloneJob(job.id)` and navigating to the clone's edit page,
   *  so most callers don't need to pass this. */
  onClone?: () => void;
  /** Optional override for the Share entry — defaults to clipboard copy. */
  onShare?: () => void;
  /** Optional override for the Copy Link entry — defaults to clipboard copy. */
  onCopyLink?: () => void;
  /** Optional override for the QR Code entry — when omitted the menu
   *  hides the QR item rather than showing a no-op. */
  onShowQR?: () => void;
  /** Extra dropdown items appended to the card's overflow menu (e.g. AddToListMenu). */
  extraMenuItems?: React.ReactNode;
}

export default function JobCard({
  job,
  showOwnership: _showOwnership = false,
  actions,
  userContext: _userContext,
  itemOwnership: _itemOwnership,
  layout = "vertical",
  onTrack,
  onUntrack,
  onView,
  onActions: _onActions,
  onViewAnalytics,
  onViewToolHistory,
  onDelete,
  onClone,
  onShare,
  onCopyLink,
  onShowQR,
  extraMenuItems,
}: JobCardProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const ownership = "ownership" in job ? job.ownership : undefined;
  // Single source of truth for owner derivation — same hook EntityMedia
  // and every other card use, so the create-chip gate can never drift.
  const { isOwner: isOwned, isTracked } = useEntityOwnership({
    ownerUserId: job.userId,
    ownership,
  });
  const canEdit = isOwned;

  // Saved state is shared across every JobCard on the page via
  // `useTrackedJobs` — the same store powers the Saved tab and the
  // extension's tracked-jobs list, so flipping the bookmark on one card
  // updates them all without prop-drilling a `savedIds` set. Ownership
  // === "tracked" still wins for backend-classified rows.
  const { isTracked: isTrackedInStore, markTracked, markUntracked } =
    useTrackedJobs();
  const saved = isTracked || isTrackedInStore(job.id);
  const [savingInFlight, setSavingInFlight] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "paused":
        return "bg-yellow-100 text-yellow-800";
      case "closed":
        return "bg-gray-100 text-gray-800";
      case "draft":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleToggleTrack = async () => {
    if (!isAuthenticated) {
      toast.error(t("messages.signInToSaveJobs"));
      return;
    }
    setSavingInFlight(true);
    const wasSaved = saved;
    try {
      if (wasSaved) {
        if (onUntrack) {
          onUntrack(job.id);
        } else {
          await jobService.unsaveJob(job.id);
          toast.success(t("messages.jobRemovedFromSaved"));
        }
        markUntracked(job.id);
      } else {
        if (onTrack) {
          onTrack(job.id);
        } else {
          await jobService.saveJob(job.id);
          toast.success(t("messages.jobSaved"));
        }
        markTracked(job.id);
      }
      // Tell the Chrome extension's side panel so its tracked-jobs
      // list refreshes without the user having to reopen the panel.
      // Soft-fails when the extension isn't installed.
      notifyExtension("tracked-job-changed", {
        jobId: job.id,
        saved: !wasSaved,
      });
    } catch {
      toast.error(wasSaved ? t("errors.unsaveJobFailed") : t("errors.saveJobFailed"));
    } finally {
      setSavingInFlight(false);
    }
  };

  // Prepare badges for header. Tracked state has moved to the bottom action row.
  const badges = [];

  if (canEdit && job.status === "draft") {
    badges.push({
      text: t("labels.jobStatus.draft"),
      variant: "outline" as const,
      className: "text-xs bg-orange-50 text-orange-700",
      icon: Edit,
    });
  }

  badges.push({
    text: job.status,
    variant: "secondary" as const,
    className: getStatusColor(job.status),
  });

  if (job.privacy) {
    badges.push(visibilityHeaderBadge(job.privacy));
  }

  // The actions footer is rendered through JobActionsMenu (which mirrors
  // ResumeActionsMenu) so the action set stays consistent across entities.
  // Callers can still override with `actions` for surfaces with bespoke
  // primary buttons, in which case we honour the legacy CardActions path.
  const useLegacyActions = actions && actions.length > 0;

  const handleView = () => {
    if (onView) {
      onView();
    } else if (typeof window !== "undefined") {
      window.location.href = `/jobs/${job.id}`;
    }
  };

  const copyJobUrl = async () => {
    const url = `${window.location.origin}/jobs/${job.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("messages.jobLinkCopied"));
    } catch {
      await promptDialog({ title: t("dialogs.jobCard.copyLinkTitle"), label: t("prompts.copyThisLink"), defaultValue: url });
    }
  };

  // Default clone handler — POST /api/jobs/:id/clone via jobService, then
  // navigate to the clone's edit page so the owner can review + publish. The
  // backend appends " (Copy)" to the title and lands the clone as inactive.
  const handleCloneJob = async () => {
    try {
      const cloned = await jobService.cloneJob(job.id);
      toast.success(t("messages.jobCloned", { defaultValue: "Job cloned" }));
      window.location.href = `/jobs/edit/${cloned.id}`;
    } catch (err) {
      toast.error((err as Error).message || t("errors.cloneJobFailed", { defaultValue: "Couldn't clone job" }));
    }
  };

  const renderActionsFooter = () => (
    <div className="p-4 bg-background border-t border-border flex items-center justify-between gap-2">
      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleView(); }} className="gap-2">
        <Eye className="w-4 h-4" />
        {t("actions.view")}
      </Button>
      <div className="flex items-center gap-1">
        {/* Save affordance is authenticated-only — unauthenticated viewers
            see only View + Share (via the menu). Mirrors the entity-wide
            rule that auth-required actions never render for anon viewers. */}
        {!isOwned && isAuthenticated && (
          <Button
            variant="ghost"
            size="sm"
            disabled={savingInFlight}
            onClick={(e) => {
              e.stopPropagation();
              void handleToggleTrack();
            }}
            className={saved ? "gap-2 text-primary" : "gap-2"}
            aria-pressed={saved}
          >
            {saved
              ? <><BookmarkCheck className="w-4 h-4" />{t("labels.saved")}</>
              : <><Bookmark className="w-4 h-4" />{t("actions.save")}</>}
          </Button>
        )}
        <JobActionsMenu
          jobId={job.id}
          isOwner={isOwned}
          isTracked={saved}
          onEdit={canEdit && job.id ? () => { window.location.href = `/jobs/edit/${job.id}`; } : undefined}
          onShare={onShare ?? copyJobUrl}
          onCopyLink={onCopyLink ?? copyJobUrl}
          onShowQR={onShowQR}
          onViewToolHistory={isOwned ? onViewToolHistory : undefined}
          onViewAnalytics={isOwned ? onViewAnalytics : undefined}
          onTrack={
            !isOwned
              ? () => {
                  void handleToggleTrack();
                }
              : undefined
          }
          onClone={isOwned ? (onClone ?? handleCloneJob) : undefined}
          onDelete={isOwned ? onDelete : undefined}
          extraMenuItems={extraMenuItems}
        />
      </div>
    </div>
  );

  if (layout === "horizontal") {
    return (
      <BaseCard className="flex flex-row items-center">
        <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
          <div className="flex-1 min-w-0">
            <a href={`/jobs/${job.id}`} className="font-semibold hover:underline truncate block">
              {job.title}
            </a>
            <p className="text-sm text-muted-foreground truncate">{job.company}</p>
          </div>
          <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>
            {job.salary && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{job.salary}</span>}
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{job.employmentType}</span>
          </div>
          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            {badges.map((b, i) => (
              <Badge key={i} variant={b.variant} className={b.className}>{b.text}</Badge>
            ))}
          </div>
        </div>
        <div className="flex-shrink-0 p-2">
          {useLegacyActions ? (
            <CardActions
              actions={actions!}
              className="border-t-0 p-0 bg-transparent"
              extraMenuItems={extraMenuItems}
            />
          ) : (
            renderActionsFooter()
          )}
        </div>
      </BaseCard>
    );
  }

  return (
    <BaseCard>
      <CardHeaderWithAvatar
        title={job.title}
        subtitle={`${job.company}`}
        badges={badges}
        linkTo={`/jobs/${job.id}`}
      />

      <CardContent>
        <div className="space-y-3">
          {/* Job Details */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {job.location}
            </div>
            {job.salary && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                {job.salary}
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {job.employmentType}
            </div>
          </div>

          {/* Summary */}
          <MarkdownPreview clamp={2} className="text-muted-foreground">
            {job.summary}
          </MarkdownPreview>

          {/* Experience Level */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {job.experienceLevel}
            </Badge>
          </div>

          {/* Stats — views/applications are owner-only. Non-owners only see the posted date. */}
          <div className="pt-2 border-t space-y-2">
            <OwnerMetricsRow isOwner={isOwned}>
              <Metric icon={Eye} value={job.views || 0} label={t("labels.views")} />
              <Metric icon={Users} value={job.applications || 0} label={t("labels.applications")} />
            </OwnerMetricsRow>
            <div className="text-xs text-muted-foreground">
              {t("labels.postedOn", { date: new Date(job.createdAt).toLocaleDateString() })}
            </div>
          </div>

          {/* Studio media linked to this job (#271). EntityMedia
              self-fetches and self-gates — given the job's userId it
              decides internally whether the viewer is the owner —
              and renders any mediaKind (video / podcast / game /
              image / animation) the owner attached. */}
          {job.id && (
            <EntityMedia
              subject={{ kind: "job", id: job.id }}
              ownerUserId={job.userId}
            />
          )}
        </div>
      </CardContent>

      {useLegacyActions ? (
        <CardActions actions={actions!} extraMenuItems={extraMenuItems} />
      ) : (
        renderActionsFooter()
      )}
    </BaseCard>
  );
}

import {
  MapPin,
  DollarSign,
  Clock,
  Eye,
  Users,
  Edit,
  Share,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import MarkdownPreview from "@/components/MarkdownPreview";
import CardHeaderWithAvatar from "@/components/ui/CardHeaderWithAvatar";
import CardActions from "@/components/ui/CardActions";
import { OwnerMetricsRow, Metric } from "@/components/ui/OwnerMetricsRow";
import { visibilityHeaderBadge } from "@/lib/visibility-config";
import { buildTrackAction } from "@/lib/card-track-action";
import { useAuth } from "@/lib/auth";
import { jobService } from "@/lib/services/job-service";
import { toast } from "sonner";
import { useState } from "react";
import type { JobMetadata, JobWithOwnership } from "@/types/job";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";
import type { DynamicCardAction } from "@/lib/dynamic-actions";

interface JobCardProps {
  job: JobMetadata | JobWithOwnership;
  showOwnership?: boolean;
  actions?: DynamicCardAction[];
  userContext?: UserContext;
  itemOwnership?: ItemOwnership;
  layout?: "vertical" | "horizontal";

  onTrack?: (_jobId: string) => void;

  onUntrack?: (_jobId: string) => void;
  onView?: () => void;
  onActions?: () => void;
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
  onActions,
  extraMenuItems,
}: JobCardProps) {
  const { user, isAuthenticated } = useAuth();

  const ownership = "ownership" in job ? job.ownership : undefined;
  const isOwned =
    ownership === "owned" || (!ownership && job.userId === user?.id);
  const isTracked = ownership === "tracked";
  const canEdit = isOwned;

  // Local saved state so the bookmark toggles optimistically. For tracked lists
  // the card already knows via `ownership === "tracked"`; for public listings
  // we fall back to the job-service save/unsave endpoint.
  const [saved, setSaved] = useState(isTracked);
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
      toast.error("Please sign in to save jobs");
      return;
    }
    setSavingInFlight(true);
    try {
      if (saved) {
        if (onUntrack) {
          onUntrack(job.id);
        } else {
          await jobService.unsaveJob(job.id);
          toast.success("Job removed from saved");
        }
        setSaved(false);
      } else {
        if (onTrack) {
          onTrack(job.id);
        } else {
          await jobService.saveJob(job.id);
          toast.success("Job saved");
        }
        setSaved(true);
      }
    } catch {
      toast.error(saved ? "Failed to unsave job" : "Failed to save job");
    } finally {
      setSavingInFlight(false);
    }
  };

  // Prepare badges for header. Tracked state has moved to the bottom action row.
  const badges = [];

  if (canEdit && job.status === "draft") {
    badges.push({
      text: "Draft",
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

  // Use dynamic actions if provided and not empty, otherwise fallback to default actions
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
          window.location.href = `/jobs/${job.id}`;
        }
      },
    },
    buildTrackAction({
      isTracked: saved,
      disabled: savingInFlight,
      trackLabel: "Save",
      trackedLabel: "Saved",
      onToggle: (e) => {
        e.stopPropagation();
        void handleToggleTrack();
      },
    }),
    {
      id: "share",
      label: "Share",
      variant: "default",
      icon: Share,
      onClick: () => {
        if (onActions) {
          onActions();
        } else {
          const url = `${window.location.origin}/jobs/${job.id}`;
          navigator.clipboard
            .writeText(url)
            .then(() => toast.success("Job link copied to clipboard"))
            .catch(() => prompt("Copy this link:", url));
        }
      },
    },
  ];
  const cardActions = actions && actions.length > 0 ? actions : fallbackActions;

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
          <CardActions
            actions={cardActions}
            className="border-t-0 p-0 bg-transparent"
            extraMenuItems={extraMenuItems}
          />
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
              <Metric icon={Eye} value={job.views || 0} label="views" />
              <Metric icon={Users} value={job.applications || 0} label="applications" />
            </OwnerMetricsRow>
            <div className="text-xs text-muted-foreground">
              Posted {new Date(job.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      </CardContent>

      <CardActions actions={cardActions} extraMenuItems={extraMenuItems} />
    </BaseCard>
  );
}

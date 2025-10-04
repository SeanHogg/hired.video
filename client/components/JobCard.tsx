import {
  MapPin,
  DollarSign,
  Clock,
  Building2,
  Eye,
  Users,
  UserCheck,
  Edit,
  Share,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import CardHeaderWithAvatar from "@/components/ui/CardHeaderWithAvatar";
import CardActions from "@/components/ui/CardActions";
import SaveJobButton from "@/components/SaveJobButton";
import { useAuth } from "@/lib/auth";
import type { JobMetadata, JobWithOwnership } from "@/types/job";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";
import type { DynamicCardAction } from "@/lib/dynamic-actions";

interface JobCardProps {
  job: JobMetadata | JobWithOwnership;
  showOwnership?: boolean;
  actions?: DynamicCardAction[];
  userContext?: UserContext;
  itemOwnership?: ItemOwnership;
   
  onTrack?: (_jobId: string) => void;
   
  onUntrack?: (_jobId: string) => void;
  onView?: () => void;
  onActions?: () => void;
}

export default function JobCard({
  job,
  showOwnership = false,
  actions,
  userContext: _userContext,  
  itemOwnership: _itemOwnership,  
  onTrack: _onTrack,  
  onUntrack: _onUntrack,  
  onView,
  onActions,
}: JobCardProps) {
  const { user } = useAuth();

  const ownership = "ownership" in job ? job.ownership : undefined;
  const isOwned =
    ownership === "owned" || (!ownership && job.userId === user?.id);
  const isTracked = ownership === "tracked";
  const canEdit = isOwned;

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

  const getPrivacyIcon = (privacy: string) => {
    switch (privacy) {
      case "public":
        return null;
      case "company_only":
        return <Building2 className="h-3 w-3" />;
      case "recruiter_only":
        return <UserCheck className="h-3 w-3" />;
      case "private":
        return <Eye className="h-3 w-3" />;
      default:
        return null;
    }
  };

  // Prepare badges for header
  const badges = [];

  if (showOwnership && isTracked) {
    badges.push({
      text: "Tracked",
      variant: "outline" as const,
      className: "text-xs bg-blue-50 text-blue-700",
      icon: UserCheck,
    });
  }

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

  if (getPrivacyIcon(job.privacy)) {
    badges.push({
      text: "",
      variant: "outline" as const,
      className: "text-xs",
      icon: () => getPrivacyIcon(job.privacy),
    });
  }

  // Use dynamic actions if provided and not empty, otherwise fallback to default actions
  const cardActions =
    actions && actions.length > 0
      ? actions
      : [
          {
            id: "view",
            label: "View",
            variant: "outline" as const,
            icon: Eye,
            onClick: () => {
              if (onView) {
                onView();
              } else {
                window.location.href = `/jobs/${job.id}`;
              }
            },
          },
          {
            id: "share",
            label: "Share",
            variant: "default" as const,
            icon: Share,
            onClick: () => {
              if (onActions) {
                onActions();
              } else {
                // Default share functionality - copy link to clipboard
                const url = `${window.location.origin}/jobs/${job.id}`;
                navigator.clipboard
                  .writeText(url)
                  .then(() => {
                    // Could show a toast notification here
                    alert("Job link copied to clipboard!");
                  })
                  .catch(() => {
                    // Fallback for older browsers
                    prompt("Copy this link:", url);
                  });
              }
            },
          },
        ];

  return (
    <BaseCard>
      <CardHeaderWithAvatar
        title={job.title}
        subtitle={`${job.company}`}
        badges={badges}
        linkTo={`/jobs/${job.id}`}
        actions={
          <SaveJobButton
            jobId={job.id}
            initialSaved={false}
            variant="ghost"
            size="icon"
          />
        }
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
          <p className="text-sm text-muted-foreground line-clamp-2">
            {job.summary}
          </p>

          {/* Experience Level */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {job.experienceLevel}
            </Badge>
          </div>

          {/* Stats */}
          <div className="pt-2 border-t space-y-2">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {job.views || 0} views
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {job.applications || 0} applications
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Posted {new Date(job.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      </CardContent>

      <CardActions actions={cardActions} />
    </BaseCard>
  );
}

import {
  MapPin,
  DollarSign,
  Clock,
  Building2,
  Eye,
  Users,
  UserCheck,
  Edit,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import type { JobMetadata, JobWithOwnership } from "@/types/job";

interface JobCardProps {
  job: JobMetadata | JobWithOwnership;
  showOwnership?: boolean;
  onTrack?: (_jobId: string) => void;
  onUntrack?: (_jobId: string) => void;
}

export default function JobCard({
  job,
  showOwnership = false,
  onTrack,
  onUntrack,
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

  return (
    <Card className="hover:shadow-lg transition-shadow relative">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-lg hover:text-primary">
                <Link to={`/jobs/${job.id}`}>{job.title}</Link>
              </CardTitle>
              {showOwnership && isTracked && (
                <Badge
                  variant="outline"
                  className="text-xs bg-blue-50 text-blue-700"
                >
                  <UserCheck className="h-3 w-3 mr-1" />
                  Tracked
                </Badge>
              )}
              {canEdit && job.status === "draft" && (
                <Badge
                  variant="outline"
                  className="text-xs bg-orange-50 text-orange-700"
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Draft
                </Badge>
              )}
            </div>
            <CardDescription className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {job.company}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className={getStatusColor(job.status)}>
              {job.status}
            </Badge>
            {getPrivacyIcon(job.privacy) && (
              <Badge variant="outline" className="text-xs">
                {getPrivacyIcon(job.privacy)}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

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
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {job.views} views
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {job.applications} applications
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Posted {new Date(job.createdAt).toLocaleDateString()}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button asChild size="sm" className="flex-1">
              <Link to={`/jobs/${job.id}`}>
                View Details
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>

            {canEdit && (
              <Button asChild variant="outline" size="sm">
                <Link to={`/jobs/edit/${job.id}`}>
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Link>
              </Button>
            )}

            {!isOwned && user && (
              <div>
                {isTracked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUntrack?.(job.id)}
                  >
                    <BookmarkCheck className="h-3 w-3" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onTrack?.(job.id)}
                  >
                    <Bookmark className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

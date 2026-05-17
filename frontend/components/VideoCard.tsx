import { Play, Eye, Clock, User, Briefcase, Brain } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import { CardActions } from "@/components/ui/CardActions";
import { OwnerMetricsRow, Metric } from "@/components/ui/OwnerMetricsRow";
import { buildShareAction } from "@/lib/card-share-action";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
import type { UserContext, ItemOwnership } from "@/types/normalized-cards";

interface VideoCardProps {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  views: number;
  type: "resume" | "job_description";
  profession?: string;
  company?: string;
  createdAt: string;
  actions?: DynamicCardAction[];
  userContext?: UserContext;
  itemOwnership?: ItemOwnership;
  onView?: () => void;
}

export default function VideoCard({
  id,
  title,
  description,
  thumbnail,
  duration,
  views,
  type,
  profession,
  company,
  createdAt,
  actions,
  userContext: _userContext,
  itemOwnership,
  onView,
}: VideoCardProps) {
  const isOwner = itemOwnership?.ownership === "owned";
  const formatViews = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const formatDate = (date: string) => {
    if (!date) return "Unknown date";
    const now = new Date();
    const videoDate = new Date(date);
    if (isNaN(videoDate.getTime())) return "Invalid date";
    const diffTime = Math.abs(now.getTime() - videoDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return "1 day ago";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  // Use passed actions or fallback to default actions.
  // Share routes through the shared `buildShareAction` helper so the
  // copy-link + toast UX matches every other entity card on the platform.
  const cardActions: DynamicCardAction[] =
    actions && actions.length > 0
      ? actions
      : [
          {
            id: "view",
            label: "View",
            variant: "outline",
            icon: Eye,
            onClick: () => {
              if (onView) {
                onView();
              } else {
                window.location.href = `/v/${id}`;
              }
            },
          },
          buildShareAction({
            entityUrl: `/v/${id}`,
            copySuccessDescription: "Video link has been copied to your clipboard.",
          }),
        ];

  return (
    <BaseCard className="group cursor-pointer overflow-hidden">
      <CardContent className="p-0">
        {/* Video Thumbnail Section */}
        <div className="relative aspect-video bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
          {/* Thumbnail image */}
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            /* Thumbnail placeholder with gradient */
            <div className="absolute inset-0 bg-gradient-to-br from-brand-purple/20 to-brand-blue/20" />
          )}

          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors duration-300">
            <Button
              size="icon"
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/50 hover:bg-black/70 text-white rounded-full h-12 w-12"
            >
              <Play className="h-6 w-6 fill-current ml-1" />
            </Button>
          </div>

          {/* Duration badge */}
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
            {duration}
          </div>

          {/* Type badge */}
          <div className="absolute top-2 left-2">
            <Badge
              variant={type === "resume" ? "default" : "secondary"}
              className="text-xs"
            >
              {type === "resume" ? (
                <>
                  <User className="w-3 h-3 mr-1" />
                  Resume
                </>
              ) : (
                <>
                  <Briefcase className="w-3 h-3 mr-1" />
                  Job
                </>
              )}
            </Badge>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-sm line-clamp-2 leading-tight group-hover:text-primary transition-colors">
              {title}
            </h3>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Brain className="w-3 h-3" />
              <span>AI Generated</span>
            </div>

            {(profession || company) && (
              <div className="text-xs text-muted-foreground">
                {profession && <span>{profession}</span>}
                {profession && company && <span> • </span>}
                {company && <span>{company}</span>}
              </div>
            )}

            <p className="text-xs text-muted-foreground line-clamp-2">
              {description}
            </p>

            <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
              {/* View count is owner-only (engagement metric). Timestamp stays public. */}
              <OwnerMetricsRow isOwner={isOwner}>
                <Metric icon={Eye} value={formatViews(views)} label="views" />
              </OwnerMetricsRow>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{formatDate(createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>

      <CardActions actions={cardActions} />
    </BaseCard>
  );
}

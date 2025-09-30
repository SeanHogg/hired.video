import { Play, Image as ImageIcon, Eye, Calendar } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import CardHeaderWithAvatar from "@/components/ui/CardHeaderWithAvatar";
import CardActions from "@/components/ui/CardActions";
import { formatDate } from "@/lib/utils";
import { MetaType, type ResumeSectionMeta } from "@/types/resume";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
import { useNavigate } from "react-router-dom";

interface MediaCardProps {
  media: ResumeSectionMeta;
  resumeId?: string; // Add resumeId prop for navigation
  onView?: () => void;
  onPlay?: () => void;
}

export default function MediaCard({ media, resumeId, onView }: MediaCardProps) {
  const navigate = useNavigate();
  const isVideo = [MetaType.YouTube, MetaType.VideoMP4, MetaType.VideoWebM].includes(media.metaType);
  const isImage = media.metaType === MetaType.Image;

  const getMediaIcon = () => {
    if (isVideo) return Play;
    if (isImage) return ImageIcon;
    return Eye;
  };

  const getMediaTypeLabel = () => {
    switch (media.metaType) {
      case MetaType.YouTube:
        return "YouTube Video";
      case MetaType.VideoMP4:
      case MetaType.VideoWebM:
        return "Video Resume";
      case MetaType.Image:
        return "Image";
      default:
        return "Media";
    }
  };

  const getThumbnail = () => {
    if (media.metaType === MetaType.YouTube) {
      // Extract YouTube video ID and create thumbnail URL
      try {
        const url = new URL(media.url);
        let videoId = "";
        
        if (url.hostname.includes("youtu.be")) {
          videoId = url.pathname.split("/").filter(Boolean)[0];
        } else if (url.hostname.includes("youtube.com")) {
          videoId = url.searchParams.get("v") || "";
        }
        
        if (videoId) {
          return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        }
      } catch (error) {
        console.error("Error parsing YouTube URL:", error);
      }
    }
    
    if (isImage) {
      return media.url;
    }
    
    return null;
  };

  const thumbnail = getThumbnail();
  const MediaIcon = getMediaIcon();

  // Navigation handler for header and View button
  const handleNavigateToResume = () => {
    if (resumeId) {
      // Navigate to resume with section anchor if we have referenceId
      const url = media.referenceId
        ? `/resumes/${resumeId}#${media.referenceId}`
        : `/resumes/${resumeId}`;
      navigate(url);
    } else if (media.userId) {
      // If we have userId but no resumeId, navigate to user's profile page
      // The profile page will show their active resume
      navigate(`/people/${media.userId}`);
    } else if (onView) {
      onView();
    } else {
      // Fallback to opening media URL directly
      if (media.url) {
        window.open(media.url, "_blank");
      }
    }
  };

  const cardActions: DynamicCardAction[] = [
    {
      id: "view",
      label: isVideo ? "Play" : "View",
      variant: "default" as const,
      icon: MediaIcon,
      onClick: handleNavigateToResume,
    },
  ];

  return (
    <BaseCard>
      <CardHeaderWithAvatar
        title={media.name}
        subtitle=""
        avatar={{
          src: undefined,
          fallback: isVideo ? "▶" : isImage ? "🖼" : "📄",
          size: "md",
        }}
        badges={[
          {
            text: getMediaTypeLabel(),
            variant: isVideo ? "default" : isImage ? "secondary" : "outline",
          },
        ]}
        linkTo={resumeId ? (media.referenceId ? `/resumes/${resumeId}#${media.referenceId}` : `/resumes/${resumeId}`) :
                media.userId ? `/people/${media.userId}` :
                media.url ? media.url : undefined}
        titleClassName="cursor-pointer"
      />

      <CardContent className="space-y-4">

        {/* Media Preview */}
        {thumbnail && (
          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden group cursor-pointer"
               onClick={handleNavigateToResume}>
            <img
              src={thumbnail}
              alt={media.name}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
            />
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                <div className="bg-white/90 rounded-full p-3 group-hover:bg-white transition-colors">
                  <Play className="w-6 h-6 text-black fill-black" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {media.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {media.description}
          </p>
        )}

        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>ADDED</span>
            </div>
            <span className="font-medium text-foreground">
              {media.creationDateTime ? formatDate(media.creationDateTime) : "Recently"}
            </span>
          </div>
        </div>
      </CardContent>

      <CardActions actions={cardActions} />
    </BaseCard>
  );
}

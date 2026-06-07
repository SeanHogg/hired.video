import { Play, Image as ImageIcon, Eye, Calendar, ExternalLink } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import BaseCard from "@/components/ui/BaseCard";
import CardActions from "@/components/ui/CardActions";
import { formatDate, cn } from "@/lib/utils";
import { MetaType, type ResumeSectionMeta } from "@/types/resume";
import type { DynamicCardAction } from "@/lib/dynamic-actions";
import { Link, useNavigate } from "react-router-dom";

// Extended type for media with user information
interface MediaWithUser extends ResumeSectionMeta {
  userSlug?: string;
  slug?: string;
}

interface MediaCardProps {
  media: ResumeSectionMeta;
  resumeId?: string; // Add resumeId prop for navigation
  onView?: () => void;
  onPlay?: () => void;
}

export default function MediaCard({ media, resumeId, onView }: MediaCardProps) {
  const navigate = useNavigate();
  const isVideo = ([MetaType.YouTube, MetaType.VideoMP4, MetaType.VideoWebM] as number[]).includes(media.metaType as number);
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
      // Extract YouTube video ID and create high-quality thumbnail URL
      try {
        const url = new URL(media.url);
        let videoId = "";

        if (url.hostname.includes("youtu.be")) {
          videoId = url.pathname.split("/").filter(Boolean)[0];
        } else if (url.hostname.includes("youtube.com")) {
          videoId = url.searchParams.get("v") || "";
        }

        if (videoId) {
          // Use maxresdefault for higher quality, fallback to mqdefault if not available
          return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }
      } catch {
        // Silently handle YouTube URL parsing errors
      }
    }

    if (isImage) {
      return media.url;
    }

    return null;
  };

  const getYouTubeVideoId = () => {
    if (media.metaType !== MetaType.YouTube) return null;

    try {
      const url = new URL(media.url);
      if (url.hostname.includes("youtu.be")) {
        return url.pathname.split("/").filter(Boolean)[0];
      } else if (url.hostname.includes("youtube.com")) {
        return url.searchParams.get("v") || null;
      }
    } catch {
      // Silently handle YouTube URL parsing errors
    }
    return null;
  };

  const thumbnail = getThumbnail();
  const MediaIcon = getMediaIcon();
  const videoId = getYouTubeVideoId();

  // Resolve the single destination this media card points at, so the
  // card-level click, the footer "View"/"Play" action, and the title
  // hyperlink all route through one source of truth (DRY). The resume
  // section anchor wins, then the owner's profile, then the raw media
  // URL as an external fallback.
  const userSlug = (media as MediaWithUser).userSlug || (media as MediaWithUser).slug;
  const navTarget: { href: string; external: boolean } | null = resumeId
    ? {
        href: media.referenceId
          ? `/resumes/${resumeId}#${media.referenceId}`
          : `/resumes/${resumeId}`,
        external: false,
      }
    : media.userId
      ? { href: `/people/${userSlug || media.userId}`, external: false }
      : media.url
        ? { href: media.url, external: true }
        : null;

  // Navigation handler for media preview and actions. Internal targets
  // navigate in-app; when there's no concrete route we defer to onView
  // (e.g. a preview modal) before falling back to opening the raw URL.
  const handleNavigateToResume = () => {
    if (navTarget && !navTarget.external) {
      navigate(navTarget.href);
    } else if (onView) {
      onView();
    } else if (navTarget?.external) {
      window.open(navTarget.href, "_blank");
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
    ...(media.url && media.metaType === MetaType.YouTube ? [{
      id: "external",
      label: "YouTube",
      variant: "outline" as const,
      icon: ExternalLink,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        window.open(media.url, "_blank");
      },
    }] : []),
  ];

  return (
    <BaseCard className="group cursor-pointer overflow-hidden" hover={true} onClick={handleNavigateToResume}>
      {/* Enhanced Media Preview - Primary Visual Element */}
      <div className="relative">
        {thumbnail ? (
          <div className="relative aspect-video bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
            {/* Thumbnail Image */}
            <img
              src={thumbnail}
              alt={media.name}
              className="absolute inset-0 w-full h-full object-cover transition-all duration-300 group-hover:scale-105"
              onError={(e) => {
                // Fallback to medium quality thumbnail for YouTube if maxres fails
                if (media.metaType === MetaType.YouTube && videoId) {
                  const target = e.target as HTMLImageElement;
                  if (target.src.includes('maxresdefault')) {
                    target.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                  }
                }
              }}
            />

            {/* Video Play Button Overlay */}
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-all duration-300">
                <div className="bg-black/70 hover:bg-black/80 rounded-full p-4 transform scale-90 group-hover:scale-100 transition-all duration-300 shadow-lg">
                  <Play className="w-8 h-8 text-white fill-white ml-1" />
                </div>
              </div>
            )}

            {/* Image Overlay for Non-Videos */}
            {isImage && (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-300 flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 rounded-full p-3 shadow-lg">
                  <Eye className="w-6 h-6 text-black" />
                </div>
              </div>
            )}

            {/* Media Type Badge */}
            <div className="absolute top-3 left-3">
              <div className={cn(
                "px-2 py-1 rounded text-xs font-medium shadow-sm backdrop-blur-sm",
                isVideo ? "bg-red-600/90 text-white" : "bg-blue-600/90 text-white"
              )}>
                {getMediaTypeLabel()}
              </div>
            </div>

            {/* YouTube Duration Badge (if available) */}
            {media.metaType === MetaType.YouTube && (
              <div className="absolute bottom-3 right-3 bg-black/80 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                Video
              </div>
            )}
          </div>
        ) : (
          /* Fallback for media without thumbnails */
          <div className="aspect-video bg-gradient-to-br from-brand-purple/20 to-brand-blue/20 flex items-center justify-center">
            <div className="text-center">
              <MediaIcon className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{getMediaTypeLabel()}</p>
            </div>
          </div>
        )}
      </div>

      {/* Compact Content Section */}
      <CardContent className="p-4 space-y-3">
        {/* Title and Description */}
        <div className="space-y-2">
          <h3 className="font-semibold text-base line-clamp-2 leading-tight group-hover:text-primary transition-colors">
            {navTarget ? (
              navTarget.external ? (
                <a
                  href={navTarget.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {media.name}
                </a>
              ) : (
                <Link to={navTarget.href} onClick={(e) => e.stopPropagation()}>
                  {media.name}
                </Link>
              )
            ) : (
              media.name
            )}
          </h3>

          {media.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {media.description}
            </p>
          )}
        </div>

        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="w-3 h-3" />
            <span>
              {media.createdAt ? formatDate(media.createdAt) : "Recently added"}
            </span>
          </div>

          {/* Professional indicator */}
          <div className="flex items-center gap-1 text-primary/70">
            <span className="font-medium">Portfolio</span>
          </div>
        </div>
      </CardContent>

      <CardActions actions={cardActions} />
    </BaseCard>
  );
}

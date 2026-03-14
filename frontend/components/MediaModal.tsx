import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MetaType, type ResumeSectionMeta } from "@/types/resume";

interface MediaModalProps {
  media: ResumeSectionMeta | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MediaModal({ media, open, onOpenChange }: MediaModalProps) {
  if (!media) return null;

  const isVideo = [MetaType.YouTube, MetaType.VideoMP4, MetaType.VideoWebM].includes(media.metaType);
  const isImage = media.metaType === MetaType.Image;

  const getYouTubeEmbedUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      let videoId = "";
      
      if (urlObj.hostname.includes("youtu.be")) {
        videoId = urlObj.pathname.split("/").filter(Boolean)[0];
      } else if (urlObj.hostname.includes("youtube.com")) {
        videoId = urlObj.searchParams.get("v") || "";
      }
      
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
      }
    } catch (error) {
      console.error("Error parsing YouTube URL:", error);
    }
    return url;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{media.name}</DialogTitle>
          {media.description && (
            <DialogDescription>{media.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Media Content */}
          {isVideo && (
            <div className="aspect-video w-full">
              {media.metaType === MetaType.YouTube ? (
                <iframe
                  width="100%"
                  height="100%"
                  src={getYouTubeEmbedUrl(media.url)}
                  title={media.name}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="rounded-lg"
                />
              ) : (
                <video
                  controls
                  autoPlay
                  className="w-full h-full rounded-lg"
                  src={media.url}
                >
                  <source
                    src={media.url}
                    type={media.metaType === MetaType.VideoWebM ? "video/webm" : "video/mp4"}
                  />
                  Your browser does not support the video tag.
                </video>
              )}
            </div>
          )}

          {isImage && (
            <div className="w-full">
              <img
                src={media.url}
                alt={media.name}
                className="w-full h-auto max-h-[60vh] object-contain rounded-lg"
              />
            </div>
          )}

          {/* Fallback for other content types */}
          {!isVideo && !isImage && (
            <div className="p-8 text-center">
              <p className="text-muted-foreground mb-4">
                This content type is not supported for preview.
              </p>
              <a
                href={media.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Open in new tab
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

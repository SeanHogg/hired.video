import { Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserVideo } from "@/lib/services/studio-service";
import SectionEditButton from "./SectionEditButton";

interface VideoResumeSectionProps {
  videos: UserVideo[];
  isOwner?: boolean;
  onEdit?: () => void;
}

export default function VideoResumeSection({
  videos,
  isOwner = false,
  onEdit,
}: VideoResumeSectionProps) {
  const { t } = useTranslation();
  if (videos.length === 0 && !isOwner) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          {t("headings.videoResume")}
        </CardTitle>
        {isOwner && onEdit && <SectionEditButton onClick={onEdit} label={t("actions.manageVideos")} />}
      </CardHeader>
      <CardContent>
        {videos.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {t("messages.videoResumeEmpty")}
            {isOwner && t("messages.videoResumeOwnerCta")}
          </div>
        ) : (
          <div className="space-y-4">
            {videos.map((v) => (
              <VideoPlayer key={v.id} video={v} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VideoPlayer({ video }: { video: UserVideo }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg overflow-hidden border">
      {video.videoUrl ? (
        <video
          src={video.videoUrl}
          controls
          className="w-full aspect-video bg-black"
          poster={video.thumbnailUrl ?? undefined}
        />
      ) : video.youtubeVideoId ? (
        <div className="aspect-video">
          <iframe
            src={`https://www.youtube.com/embed/${video.youtubeVideoId}`}
            className="w-full h-full"
            allowFullScreen
            title={video.title ?? t("headings.videoResume")}
          />
        </div>
      ) : (
        <div className="aspect-video bg-muted flex items-center justify-center">
          <Video className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      {video.title && (
        <div className="p-3">
          <p className="font-medium text-sm">{video.title}</p>
          {video.description && (
            <p className="text-xs text-muted-foreground mt-1">{video.description}</p>
          )}
        </div>
      )}
    </div>
  );
}

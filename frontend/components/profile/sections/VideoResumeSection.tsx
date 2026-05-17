import { Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
import type { UserVideo } from "@/lib/services/studio-service";
import SectionEditButton from "./SectionEditButton";

interface VideoResumeSectionProps {
  // All of the user's published videos for the profile. This section
  // self-filters to those linked with subject_kind='resume' so only
  // videos the owner explicitly tied to one of their resumes show here.
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

  // Visibility (project.is_public) is enforced server-side; this filter
  // only narrows by subject association. A v2 NLE project may have a
  // null privacyStatus (no `videos` row yet) but is still public via
  // `studio_projects.is_public=true`.
  const resumeVideos = videos.filter((v) => (v.subjectKinds ?? []).includes("resume"));

  if (resumeVideos.length === 0 && !isOwner) return null;

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
        {resumeVideos.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {t("messages.videoResumeEmpty")}
            {isOwner && t("messages.videoResumeOwnerCta")}
          </div>
        ) : (
          <div className="space-y-4">
            {resumeVideos.map((v) => (
              <StudioVideoSurface
                key={v.id}
                mode="lazy"
                videoId={v.id}
                poster={v.thumbnailUrl ?? null}
                title={v.title ?? t("headings.videoResume")}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

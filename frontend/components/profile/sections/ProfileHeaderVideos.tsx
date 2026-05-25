import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
import type { UserVideo } from "@/lib/services/studio-service";
import { useProfileSectionVisibility } from "./profile-sections-context";

interface ProfileHeaderVideosProps {
  // All of the user's published videos. Self-filters to those linked
  // with subject_kind='profile'. Returns null when nothing qualifies
  // so the header's right column collapses cleanly.
  videos: UserVideo[];
}

export default function ProfileHeaderVideos({ videos }: ProfileHeaderVideosProps) {
  const sectionVisible = useProfileSectionVisibility("profileVideos");

  // Visibility (project.is_public) is enforced server-side; this filter
  // only narrows by subject association. A v2 NLE project may have a
  // null privacyStatus (no `videos` row yet) but is still public via
  // `studio_projects.is_public=true`.
  const profileVideos = videos.filter((v) => (v.subjectKinds ?? []).includes("profile"));

  if (!sectionVisible) return null;
  if (profileVideos.length === 0) return null;

  return (
    <div className="space-y-3">
      {profileVideos.map((v) => (
        <StudioVideoSurface
          key={v.id}
          mode="lazy"
          videoId={v.id}
          poster={v.thumbnailUrl ?? null}
          title={v.title ?? "Profile video"}
        />
      ))}
    </div>
  );
}

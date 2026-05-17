import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
import type { UserVideo } from "@/lib/services/studio-service";

interface ProfileHeaderVideosProps {
  // All of the user's published videos. Self-filters to those linked
  // with subject_kind='profile'. Returns null when nothing qualifies
  // so the header's right column collapses cleanly.
  videos: UserVideo[];
}

export default function ProfileHeaderVideos({ videos }: ProfileHeaderVideosProps) {
  const profileVideos = videos.filter(
    (v) => (v.subjectKinds ?? []).includes("profile") && v.privacyStatus === "public",
  );

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

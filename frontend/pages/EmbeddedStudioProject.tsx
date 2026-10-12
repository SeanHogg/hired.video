// Bare, chrome-less embed surface for a studio project (#696).
//
// The legacy embed snippet pointed an <iframe> at the public `/m/:id`
// page (full AppShell chrome) OR required a published `videos.id` render.
// This route mounts ONLY the unified <StudioVideoSurface/> player, which
// serves saved-but-unrendered projects straight from `studio_projects`,
// so any public project is embeddable — no render required.
//
// No AppShell / nav / footer: this page is meant to live inside an
// <iframe> on a third-party site, so it fills the frame and nothing else.

import { useParams } from "react-router-dom";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";

export default function EmbeddedStudioProject() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-sm text-white/70">
        No project specified.
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black">
      {/* lazy fetches by id then mounts the unified player; inside an
          iframe it's already in view, so it loads immediately. */}
      <StudioVideoSurface mode="lazy" videoId={projectId} className="h-full w-full" />
    </div>
  );
}

/**
 * useVideoEditor — the kit's ONE video editor, composed: the video as it plays
 * (useSceneVoiceovers lays each scene's narration over useBuildVideo's
 * canvas — the ONE canvas the frame, the Advanced editor and the post dock
 * all use), the frame editor on it (useFrameEditor), the music's presence
 * and volume (useTimelineAudio). (Advanced is the workspace depth, not
 * this hook's.) Uploads from the
 * frame (palette media, screenshots) share ONE guest-first gate; the host
 * renders its sheet (`<AuthGateSheet {...uploadGateSheet} />`).
 */
import { useMemo } from "react";
import type { ResumeContent } from "@shared/resume";
import { useSceneVoiceovers } from "./use-scene-voiceovers";
import { useFrameEditor } from "./use-frame-editor";
import { useTimelineAudio } from "./use-timeline-audio";
import { useGuestAnonGate } from "@/lib/studio/use-guest-anon-gate";
import type { BuildVideo } from "./use-build-video";
import type { Translate } from "./video-copy";
import { withCaptions } from "./captions";

interface Args {
  video: BuildVideo;
  content: ResumeContent | null;
  commit: (next: ResumeContent, group?: string) => void;
  t: Translate;
}

export function useVideoEditor({ video, content, commit, t }: Args) {
  const voiced = useSceneVoiceovers(video.canvas, video.plan);
  // Captions ride on the voiced canvas: they are timed to the narration.
  const canvas = useMemo(() => (voiced.canvas ? withCaptions(voiced.canvas, video.plan) : null), [voiced.canvas, video.plan]);
  const { value: uploadGate, sheet: uploadGateSheet } = useGuestAnonGate();
  const frame = useFrameEditor({
    canvas,
    content,
    plan: video.plan,
    commit,
    updatePlan: video.updatePlan,
    scene: video.selected,
    onSelectScene: video.select,
    uploadGate,
    t,
  });
  const audio = useTimelineAudio({
    canvas,
    plan: video.plan,
    updatePlan: video.updatePlan,
  });
  return {
    canvas,
    voiceoverStatus: voiced.status,
    frame,
    audio,
    uploadGateSheet,
  };
}

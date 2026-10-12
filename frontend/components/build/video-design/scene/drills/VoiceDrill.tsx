/**
 * Voice — who speaks over the video (Video board: "Who speaks over your
 * video"): this scene's words to say (VoiceoverField), then the whole
 * video's voice — an AI voice, your own takes, or one uploaded file — and
 * the mix (VoicePanel, the same panel the Media tool shows).
 */
import VoiceoverField from "@/components/build/VoiceoverField";
import VoicePanel from "@/components/build/voice/VoicePanel";
import type { SceneDrillProps } from "../types";

export default function VoiceDrill({ sceneId, video, onPatch }: SceneDrillProps) {
  return (
    <div className="flex flex-col gap-5">
      <VoiceoverField sceneId={sceneId} plan={video.plan} onPatch={onPatch} />
      <VoicePanel video={video} />
    </div>
  );
}

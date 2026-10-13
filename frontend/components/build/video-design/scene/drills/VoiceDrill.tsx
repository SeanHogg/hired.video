/**
 * Voice — the scene sheet's row for THIS scene only: the words said over
 * it (VoiceoverField), the owner's own take of it (SceneTake), and one row
 * naming the whole video's voice that opens Media › Sound, where it is
 * chosen (VoiceSummaryRow). The voice list and the mix are never repeated
 * here.
 */
import VoiceoverField from "@/components/build/VoiceoverField";
import SceneTake from "@/components/build/voice/SceneTake";
import VoiceSummaryRow from "@/components/build/voice/VoiceSummaryRow";
import type { SceneDrillProps } from "../types";

export default function VoiceDrill({ sceneId, video, onPatch, onOpenSound }: SceneDrillProps) {
  return (
    <div className="flex flex-col gap-5">
      <VoiceoverField sceneId={sceneId} plan={video.plan} onPatch={onPatch} />
      <SceneTake video={video} id={sceneId} />
      <VoiceSummaryRow video={video} onOpen={onOpenSound} />
    </div>
  );
}

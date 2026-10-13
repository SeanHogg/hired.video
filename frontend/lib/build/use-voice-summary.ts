/**
 * useNarrationVoices — the AI voices this device can narrate in (cached for
 * the session: the engine's list never changes while the page is open).
 * useVoiceSummary — the video's voice status, the picked voice's name and
 * the one status line every voice surface shows (voice-state.ts).
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { VideoPlan } from "@shared/video-plan";
import { listNarrationVoices } from "@/lib/studio/page-narration";
import { voiceStatus, voiceStatusLabel, type VoiceStatus } from "./voice-state";

export function useNarrationVoices() {
  return useQuery({ queryKey: ["narration-voices"], queryFn: listNarrationVoices, staleTime: Infinity });
}

export interface VoiceSummary {
  status: VoiceStatus;
  /** The AI voice that speaks (the picked one, else the engine's first). */
  voiceId: string | undefined;
  voiceName: string;
  label: string;
}

export function useVoiceSummary(plan: VideoPlan): VoiceSummary {
  const { t } = useTranslation();
  const voices = useNarrationVoices();
  const status = voiceStatus(plan);
  const list = voices.data ?? [];
  const voice = list.find((v) => v.voice_id === status.voiceId) ?? list[0];
  const voiceName = voice?.name ?? t("build.voice.tab.ai");
  return { status, voiceId: voice?.voice_id, voiceName, label: voiceStatusLabel(status, voiceName, t) };
}

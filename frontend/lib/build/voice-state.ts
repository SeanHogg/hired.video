/**
 * Voice state — the ONE answer to "who speaks over this video?", pure.
 *
 * What is audible follows the narration rules in scene-voiceover.ts: the AI
 * voice only speaks scenes with words, a recorded take only plays while the
 * source is "recorded", one uploaded file covers the whole video, and
 * "none" silences it while keeping every scene's words. The Sound panel's
 * status, the timeline's Voice row, the scene inspector's Voice hint and the
 * scene sheet's summary all read it from here, so they never disagree.
 *
 * The edits (`withVoice`, `withoutVoice`, …) each return ONE next plan, so
 * every voice change is one undo step.
 */
import { VIDEO_SCENE_IDS, patchScenePlan, type ScenePlan, type VideoPlan, type VideoSceneId } from "@shared/video-plan";
import type { VoiceClip } from "./use-voice-take";
import type { Translate } from "./video-copy";

/** Who speaks one scene. */
export type SceneSpeaker = "yours" | "uploaded" | "ai" | "none";
/** What the whole video sounds like. */
export type VoiceKind = "none" | "ai" | "recorded" | "upload";

export interface VoiceStatus {
  kind: VoiceKind;
  /** Scenes in the video (switched on). */
  scenes: number;
  /** Of those, scenes someone speaks over. */
  voiced: number;
  /** Of those, scenes with the owner's own take. */
  takes: number;
  /** The picked AI voice (absent = the engine's first voice). */
  voiceId?: string;
}

/** Same cap as the plan schema's `voiceover`. */
const VOICEOVER_MAX = 600;

const onScenes = (plan: VideoPlan): VideoSceneId[] => VIDEO_SCENE_IDS.filter((id) => !plan.scenes?.[id]?.off);

/** The picked AI voice, when the voice source carries one. */
export function pickedVoiceId(plan: VideoPlan): string | undefined {
  const v = plan.voice;
  return v?.source === "ai" || v?.source === "recorded" ? v.voiceId : undefined;
}

export function sceneSpeaker(plan: VideoPlan, scene: ScenePlan | undefined): SceneSpeaker {
  if (scene?.off) return "none";
  const source = plan.voice?.source;
  if (source === "upload") return "uploaded";
  if (source === "none") return "none";
  if (source === "recorded" && scene?.voiceClip) return "yours";
  return scene?.voiceover?.trim() ? "ai" : "none";
}

export function voiceStatus(plan: VideoPlan): VoiceStatus {
  const ids = onScenes(plan);
  const speakers = ids.map((id) => sceneSpeaker(plan, plan.scenes?.[id]));
  const voiced = speakers.filter((s) => s !== "none").length;
  const takes = speakers.filter((s) => s === "yours").length;
  const base = { scenes: ids.length, voiced, takes, voiceId: pickedVoiceId(plan) };
  if (plan.voice?.source === "upload") return { ...base, kind: "upload" };
  if (voiced === 0) return { ...base, kind: "none" };
  return { ...base, kind: takes > 0 ? "recorded" : "ai" };
}

/** "Heart (US Female) · 5 of 5 scenes", "Your voice · 2 of 5 scenes
 *  recorded", "Your uploaded file", or silent — the one wording for the
 *  Sound panel, the timeline row and the scene sheet. */
export function voiceStatusLabel(status: VoiceStatus, voiceName: string, t: Translate): string {
  switch (status.kind) {
    case "none":
      return t("build.voice.status.none");
    case "upload":
      return t("build.voice.status.upload");
    case "recorded":
      return t("build.voice.status.recorded", { takes: status.takes, count: status.scenes });
    case "ai":
      return t("build.voice.status.ai", { name: voiceName, voiced: status.voiced, count: status.scenes });
  }
}

/** The AI voice on: every scene in the video without words gets its
 *  on-screen line (`lines`) to say, so picking a voice is never silent.
 *  Recorded takes stay (the voice fills the scenes without one). */
export function withVoice(plan: VideoPlan, voiceId: string, lines: Partial<Record<VideoSceneId, string>>): VideoPlan {
  const worded = onScenes(plan).reduce((p, id) => {
    const line = lines[id]?.trim();
    return !p.scenes?.[id]?.voiceover?.trim() && line ? patchScenePlan(p, id, { voiceover: line.slice(0, VOICEOVER_MAX) }) : p;
  }, plan);
  return { ...worded, voice: { source: plan.voice?.source === "recorded" ? "recorded" : "ai", voiceId } };
}

/** Silence — the words stay, so picking a voice again brings them back. */
export function withoutVoice(plan: VideoPlan): VideoPlan {
  return { ...plan, voice: { source: "none" } };
}

/** The AI voice everywhere: the owner's takes give way to it. */
export function withAiEverywhere(plan: VideoPlan): VideoPlan {
  const cleared = VIDEO_SCENE_IDS.reduce((p, id) => (p.scenes?.[id]?.voiceClip ? patchScenePlan(p, id, { voiceClip: undefined }) : p), plan);
  return { ...cleared, voice: { source: "ai", voiceId: pickedVoiceId(plan) } };
}

/** The owner's take on one scene; the source switches to "recorded". */
export function withTake(plan: VideoPlan, id: VideoSceneId, clip: VoiceClip): VideoPlan {
  return { ...patchScenePlan(plan, id, { voiceClip: clip }), voice: { source: "recorded", voiceId: pickedVoiceId(plan) } };
}

/** One uploaded file carries the voice. */
export function withUploadedFile(plan: VideoPlan, clip: VoiceClip): VideoPlan {
  return { ...plan, voice: { source: "upload", url: clip.url, durationSeconds: clip.durationSeconds } };
}

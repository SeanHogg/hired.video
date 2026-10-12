/**
 * timeline-transcript — the on-screen words of a saved `kind='nle'` project,
 * one line per scene, for prompts that need to know what a video SAYS (the
 * Post dock's "Write it for me" caption).
 *
 * Reads the Timeline JSON the editor emits (`canvasStateToTimeline`): each
 * scene is a background clip on the first video track (its effect carries
 * the scene `label`), and every widget is a clip on the other video tracks
 * whose effect params carry its copy (`text`, `headline`, `chips`, …). A
 * widget belongs to the scene whose frame range contains its start frame.
 */
import type { ClipEffect, Timeline } from "./timeline.js";

const BACKGROUND_EFFECT = "canvas-v2:background";
/** Widget params that hold words a viewer reads, in reading order. */
const TEXT_PARAMS = ["title", "headline", "subheadline", "text", "takeaway", "ctaText"] as const;

/** A chip is a plain string or an object carrying its `label` / `text`. */
function chipLabel(chip: unknown): string | null {
  const raw =
    typeof chip === "string"
      ? chip
      : chip && typeof chip === "object"
        ? ((chip as Record<string, unknown>).label ?? (chip as Record<string, unknown>).text)
        : null;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function wordsOf(effect: ClipEffect): string[] {
  const params = effect.params ?? {};
  const words: string[] = [];
  for (const key of TEXT_PARAMS) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) words.push(value.trim());
  }
  const chips = params.chips;
  if (Array.isArray(chips)) {
    const labels = chips
      .map(chipLabel)
      .filter((label): label is string => !!label);
    if (labels.length) words.push(labels.join(", "));
  }
  return words;
}

function isTimeline(value: unknown): value is Timeline {
  return !!value && typeof value === "object" && Array.isArray((value as Timeline).tracks);
}

export function flattenTimelineTranscript(timelineSpec: unknown): string {
  if (!isTimeline(timelineSpec)) return "";
  const videoTracks = timelineSpec.tracks.filter((track) => track.kind === "video");
  const sceneTrack = videoTracks.find((track) =>
    track.clips.some((clip) => clip.effects?.some((e) => e.kind === BACKGROUND_EFFECT)),
  );
  if (!sceneTrack) return "";

  const scenes = sceneTrack.clips
    .map((clip) => {
      const bg = clip.effects?.find((e) => e.kind === BACKGROUND_EFFECT);
      const label = typeof bg?.params?.label === "string" ? bg.params.label.trim() : "";
      return { start: clip.startFrame, end: clip.startFrame + clip.durationFrames, label, words: [] as string[] };
    })
    .sort((a, b) => a.start - b.start);

  const widgetClips = videoTracks
    .filter((track) => track !== sceneTrack)
    .flatMap((track) => track.clips)
    .sort((a, b) => a.startFrame - b.startFrame);
  for (const clip of widgetClips) {
    const scene = scenes.find((s) => clip.startFrame >= s.start && clip.startFrame < s.end);
    if (!scene) continue;
    for (const effect of clip.effects ?? []) scene.words.push(...wordsOf(effect));
  }

  return scenes
    .map((scene) => {
      const words = [...new Set(scene.words)].join(" — ");
      if (!words) return "";
      return scene.label ? `${scene.label}: ${words}` : words;
    })
    .filter(Boolean)
    .join("\n");
}

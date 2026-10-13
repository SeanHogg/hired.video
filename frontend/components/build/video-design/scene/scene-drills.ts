/**
 * The scene inspector's rows, as data (A2 Video board, in its order).
 * Simple: Words on screen · Voice · Length. Advanced appends Background,
 * Filters & effects, Transition in, Director's notes, Format, Palette &
 * fonts, Motion, Export. Each row's hint, whether it reaches the whole
 * video, when it shows as changed, and the view it opens in the slot.
 * Adding a row is one entry here plus its view file.
 */
import type { TFunction } from "i18next";
import { defineDrills } from "@/components/workspace/inspector/inspector-drills";
import { sceneSpeaker } from "@/lib/build/voice-state";
import type { SceneDrillProps } from "./types";
import WordsDrill from "./drills/WordsDrill";
import VoiceDrill from "./drills/VoiceDrill";
import LengthDrill from "./drills/LengthDrill";
import BackgroundDrill from "./drills/BackgroundDrill";
import FiltersDrill from "./drills/FiltersDrill";
import TransitionDrill from "./drills/TransitionDrill";
import NotesDrill from "./drills/NotesDrill";
import FormatDrill from "./drills/FormatDrill";
import PaletteFontsDrill from "./drills/PaletteFontsDrill";
import MotionDrill from "./drills/MotionDrill";
import ExportDrill from "./drills/ExportDrill";

export const SCENE_DRILL_IDS = [
  "words",
  "voice",
  "length",
  "background",
  "filters",
  "transition",
  "notes",
  "format",
  "palette",
  "motion",
  "export",
] as const;
export type SceneDrillId = (typeof SCENE_DRILL_IDS)[number];

/** Who speaks this scene (voice-state.ts): yours, uploaded, AI, or nobody. Pure. */
export function sceneVoiceHint({ scene, video }: Pick<SceneDrillProps, "scene" | "video">, t: TFunction): string {
  return t(`build.sceneInspector.voiceHint.${sceneSpeaker(video.plan, scene)}`);
}

const VIDEO = "build.sceneInspector.wholeVideo";
const label = (id: string) => `build.sceneInspector.drill.${id}`;

export const SCENE_DRILLS = defineDrills<SceneDrillId, SceneDrillProps>(SCENE_DRILL_IDS, {
  words: {
    labelKey: "build.sceneInspector.words",
    depth: "simple",
    hint: ({ played }, t) => (played.scene.linked ? t("build.sceneInspector.wordsHint") : t("build.scene.videoOnly")),
    View: WordsDrill,
  },
  voice: { labelKey: "build.sceneInspector.voice", depth: "simple", hint: sceneVoiceHint, View: VoiceDrill },
  length: {
    labelKey: "build.sceneInspector.length",
    depth: "simple",
    hint: ({ scene, played }, t) =>
      scene.off ? t("build.sceneInspector.leftOut") : t("build.sceneInspector.seconds", { seconds: played.scene.duration }),
    View: LengthDrill,
  },
  background: { labelKey: label("background"), depth: "advanced", isSet: ({ scene }) => !!scene.background, View: BackgroundDrill },
  filters: {
    labelKey: label("filters"),
    depth: "advanced",
    isSet: ({ scene }) => !!scene.filters || !!scene.effects?.length,
    View: FiltersDrill,
  },
  transition: { labelKey: label("transition"), depth: "advanced", isSet: ({ scene }) => !!scene.transitionIn, View: TransitionDrill },
  notes: { labelKey: label("notes"), depth: "advanced", isSet: ({ scene }) => !!scene.notes?.trim(), View: NotesDrill },
  format: { labelKey: label("format"), depth: "advanced", tagKey: VIDEO, isSet: ({ video }) => !!video.plan.aspect, View: FormatDrill },
  palette: {
    labelKey: label("palette"),
    depth: "advanced",
    isSet: ({ scene }) => !!scene.look || !!scene.palette || !!scene.font,
    View: PaletteFontsDrill,
  },
  motion: { labelKey: label("motion"), depth: "advanced", isSet: ({ scene }) => !!scene.motion, View: MotionDrill },
  export: { labelKey: label("export"), depth: "advanced", tagKey: VIDEO, isSet: ({ video }) => !!video.plan.export, View: ExportDrill },
});

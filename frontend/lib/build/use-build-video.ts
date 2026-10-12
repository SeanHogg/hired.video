/**
 * useBuildVideo — the video half of the kit workspace: the owner's video
 * plan (stored on the résumé at `content.meta.video`), the outline and canvas
 * derived from résumé + plan, and which scene is selected.
 *
 * Every plan change goes through `commit` (useContentHistory), so a video edit
 * is saved with the draft and undone with the same Undo as a page edit.
 * Typing in one scene's wording coalesces into one undo step (`group`).
 *
 * Frame-level hand edits (moves, timing, wording, added widgets) live on the
 * plan as overrides (`plan.canvas`, see canvas-overrides.ts) and are layered
 * over the derived canvas, so the video keeps following the page while the
 * owner's edits stick. Callers build the next plan with those helpers and
 * hand it to `updatePlan`. The owner's hand music mix (`plan.musicMix`,
 * music-mix.ts) is laid over the derived music layer the same way.
 */
import { useCallback, useMemo, useState } from "react";
import type { ResumeContent } from "@shared/resume";
import {
  patchScenePlan,
  readVideoPlan,
  VIDEO_SCENE_IDS,
  withVideoPlan,
  type ScenePlan,
  type VideoExport,
  type VideoLookId,
  type VideoPlan,
  type VideoSceneId,
} from "@shared/video-plan";
import type { VideoAspect, VideoTargeting } from "@shared/video-targeting";
import type { VideoThemeId } from "@shared/video-themes";
import { useDefaultVideoTheme } from "@/hooks/use-default-video-theme";
import { useVideoPersonalization } from "@/hooks/use-video-personalization";
import { buildVideoOutline, DEFAULT_MUSIC, outlineDuration } from "./video-outline";
import { resumeMomentDates } from "./resume-moment-dates";
import { outlineToCanvasState } from "./video-canvas";
import { applyCanvasOverrides } from "./canvas-overrides";
import { resolutionScale } from "./resolution-scale";
import { applyMusicMix } from "./music-mix";
import type { Translate } from "./video-copy";

interface Args {
  content: ResumeContent | null;
  commit: (next: ResumeContent, group?: string) => void;
  t: Translate;
}

export type ScenePatch = Partial<Record<keyof ScenePlan, unknown>>;

export function useBuildVideo({ content, commit, t }: Args) {
  const plan = useMemo<VideoPlan>(() => (content ? readVideoPlan(content) : {}), [content]);
  // What the date and the person's Settings add: the default theme (their
  // fixed choice, else the calendar's pick) and their own sentence.
  const resume = useMemo(() => (content ? resumeMomentDates(content) : undefined), [content]);
  const { personalization } = useVideoPersonalization();
  const defaultTheme = useDefaultVideoTheme({ resume, speaksToHiringManager: plan.targeting?.audience === "hiringManager" });
  const outline = useMemo(
    () =>
      content
        ? buildVideoOutline(content, plan, { themeId: defaultTheme.themeId, line: defaultTheme.line, ownWords: personalization.ownWords })
        : null,
    [content, plan, defaultTheme.themeId, defaultTheme.line, personalization.ownWords],
  );
  // ONE composition for the player AND the post dock, so what is posted is
  // exactly what was watched.
  const canvas = useMemo(
    () =>
      outline
        ? applyMusicMix(
            // Hand edits sized for the export resolution, like the generated type.
            applyCanvasOverrides(outlineToCanvasState(outline, t), plan.canvas, resolutionScale(outline.export.resolution)),
            plan.musicMix,
          )
        : null,
    [outline, t, plan.canvas, plan.musicMix],
  );
  const [selected, setSelected] = useState<VideoSceneId>("hook");

  const save = useCallback(
    (next: VideoPlan, group?: string) => {
      if (content) commit(withVideoPlan(content, next), group);
    },
    [content, commit],
  );

  const patchScene = useCallback(
    (id: VideoSceneId, patch: ScenePatch, group?: string) => save(patchScenePlan(plan, id, patch), group),
    [plan, save],
  );

  /** One colour look for every scene (one undo step). */
  const setLookAll = useCallback(
    (look: VideoLookId) => save(VIDEO_SCENE_IDS.reduce((next, id) => patchScenePlan(next, id, { look }), plan)),
    [plan, save],
  );

  /** Who the video is made for (one undo step per change). */
  const setTargeting = useCallback(
    (patch: Partial<VideoTargeting>) => {
      const targeting = { ...(plan.targeting ?? {}), ...patch };
      (Object.keys(targeting) as (keyof VideoTargeting)[]).forEach((k) => targeting[k] === undefined && delete targeting[k]);
      save({ ...plan, targeting });
    },
    [plan, save],
  );

  /** Pick a theme for the whole video (null = back to the default). Scenes
   *  drop their own looks so the theme shows everywhere — one undo step. */
  const setTheme = useCallback(
    (themeId: VideoThemeId | null) => {
      const cleared = VIDEO_SCENE_IDS.reduce((next, id) => patchScenePlan(next, id, { look: undefined }), plan);
      const { themeId: _old, ...rest } = cleared;
      save(themeId ? { ...rest, themeId } : rest);
    },
    [plan, save],
  );

  /** Posting keeps the theme the video wears now (Calendar board: a live
   *  video keeps its theme when the season moves on). */
  const freezeTheme = useCallback(() => {
    const worn = outline?.theme?.id;
    if (worn && !plan.themeId) save({ ...plan, themeId: worn });
  }, [outline, plan, save]);

  /** The shape (16:9 · 9:16 · 1:1). */
  const setAspect = useCallback(
    (aspect: VideoAspect) => {
      const { aspect: _old, ...rest } = plan;
      save(aspect === "16:9" ? rest : { ...rest, aspect });
    },
    [plan, save],
  );

  /** Export settings (resolution · fps · codec); `undefined` clears one —
   *  one undo step per change. */
  const setExport = useCallback(
    (patch: Partial<Record<keyof VideoExport, unknown>>) => {
      const merged = { ...(plan.export ?? {}), ...patch } as Record<string, unknown>;
      Object.keys(merged).forEach((k) => merged[k] === undefined && delete merged[k]);
      const { export: _old, ...rest } = plan;
      save(Object.keys(merged).length > 0 ? { ...rest, export: merged as VideoExport } : rest);
    },
    [plan, save],
  );

  const setMusic = useCallback(
    (track: string) => {
      const { music: _music, ...rest } = plan;
      save(track === DEFAULT_MUSIC ? rest : { ...rest, music: track });
    },
    [plan, save],
  );

  return {
    plan,
    outline,
    canvas,
    seconds: outline ? outlineDuration(outline) : 0,
    selected,
    select: setSelected,
    patchScene,
    setLookAll,
    setMusic,
    setTargeting,
    setTheme,
    setAspect,
    setExport,
    freezeTheme,
    /** The theme the video wears by default (and what else is in season). */
    defaultTheme,
    /** Save a whole next plan (e.g. one built with the canvas-override helpers). */
    updatePlan: save,
  };
}

export type BuildVideo = ReturnType<typeof useBuildVideo>;

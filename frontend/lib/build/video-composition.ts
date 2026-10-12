/**
 * The kit video's visual design — outline + copy → VideoScript.
 *
 * Built to stop the scroll: every scene has its own bold gradient and accent,
 * and nothing is static — the kicker slides in, the headline rises, body lines
 * and skill pills arrive one after another. Timing is element data
 * (`appearAt` + `motion`), so the kit player, the Advanced editor and the
 * posted video all run the same animation (script-to-canvas maps both onto
 * the widget).
 *
 * Pure: the same outline + `t` always yields the same script, so the kit
 * player, the Advanced editor and the Post dock share ONE composition.
 */
import type { SceneType } from "@shared/scene-types";
import { findMusicTrack } from "@/lib/studio/music-catalog";
import type { MotionKind, WidgetMotion } from "@/lib/studio/editor-v2/widget-motion";
import type { SceneElement, SceneScript, VideoScript } from "@/types/video-script";
import { initialsOf, rolePeriod, sceneCopy, type SceneCopy, type Translate } from "./video-copy";
import { toHeadline, type VideoOutline, type VideoOutlineRole, type VideoOutlineScene, type VideoSceneId } from "./video-outline";
import { canvasSceneId } from "./scene-voiceover";
import { SCENE_LOOKS, type SceneLook } from "./scene-palette";
import { VIDEO_LAYOUTS, type Box, type VideoLayout } from "./video-layout";
import { sceneGround, withResolution, withSceneFont, withSceneMotion } from "./scene-overrides";

export { SCENE_LOOKS, type SceneLook };

const SCENE_TYPE: Record<VideoSceneId, SceneType> = {
  hook: "achievement",
  who: "intro",
  proof: "achievement",
  skills: "skills",
  next: "closing",
};

const WHITE = "#FFFFFF";
const PAPER_INK = "#0F172A";
const PAPER_MUTED = "#475569";
const PAPER_LABEL = "#64748B";

const MUSIC_VOLUME = 0.5;
const INITIALS_PX = 80;

function enter(kind: MotionKind, durationSeconds = 0.6): WidgetMotion {
  return {
    enter: { kind, durationSeconds, easing: "ease-out" },
    exit: { kind: "none", durationSeconds: 0.4, easing: "ease-in" },
  };
}

/** Type size (canvas px) scaled to the shape. */
const px = (L: VideoLayout, size: number) => Math.round(size * L.font);

/** Headline size (16:9 px) that keeps a long hook inside its box. */
function headingPx(text: string): number {
  if (text.length <= 32) return 112;
  if (text.length <= 60) return 92;
  return 78;
}

/** Box width (% of canvas) for a one-line pill of `text` at `fontPx`. */
function pillWidth(L: VideoLayout, text: string, fontPx: number, max: number): number {
  const perChar = (fontPx * 0.6 * 100) / L.width;
  return Math.min(max, 3 + text.length * perChar);
}

function decor(L: VideoLayout, sceneId: VideoSceneId): SceneElement {
  return {
    id: `build-${sceneId}-decor`,
    kind: "text",
    text: "",
    box: { ...L.decor },
    z: 1,
    style: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 9999 },
    motion: enter("scale", 1.2),
  };
}

function avatar(L: VideoLayout, sceneId: VideoSceneId, outline: VideoOutline, look: SceneLook): SceneElement[] {
  const id = (part: string) => `build-${sceneId}-${part}`;
  const ring = { borderColor: look.accent, borderWidth: 8, borderRadius: 9999 };
  const box = L.avatar;
  if (outline.photo) {
    return [
      { id: id("photo"), kind: "image", url: outline.photo, fit: "cover", box: { ...box }, z: 6, style: ring, appearAt: 0.2, motion: enter("scale", 0.6) },
    ];
  }
  const initials = initialsOf(outline.name);
  if (!initials) return [];
  // Text boxes are top-aligned, so the initials get a one-line box centred
  // inside the circle (no padding — it was what wrapped "SH" onto two lines).
  const fontSize = px(L, INITIALS_PX);
  const lineH = ((fontSize * 1.1) / L.height) * 100;
  return [
    { id: id("avatar"), kind: "text", text: "", box: { ...box }, z: 6, style: { ...ring, backgroundColor: "rgba(255,255,255,0.16)" }, appearAt: 0.2, motion: enter("scale", 0.6) },
    {
      id: id("initials"),
      kind: "text",
      text: initials,
      box: { x: box.x, y: box.y + (box.h - lineH) / 2, w: box.w, h: lineH },
      z: 7,
      fontSize,
      fontWeight: "bold",
      color: WHITE,
      align: "center",
      appearAt: 0.2,
      motion: enter("scale", 0.6),
    },
  ];
}

function kicker(L: VideoLayout, sceneId: VideoSceneId, label: string, look: SceneLook): SceneElement {
  const text = label.toUpperCase();
  const fontSize = px(L, 34);
  return {
    id: `build-${sceneId}-kicker`,
    kind: "text",
    text,
    box: { x: L.margin, y: L.kicker.y, w: pillWidth(L, text, fontSize, L.kicker.maxW) + 1.5, h: L.kicker.h },
    z: 6,
    fontSize,
    fontWeight: "bold",
    color: look.accent,
    align: "center",
    style: { backgroundColor: "rgba(0,0,0,0.22)", borderRadius: 9999, padding: 12 },
    motion: enter("slide-left", 0.5),
  };
}

function heading(sceneId: VideoSceneId, text: string, box: SceneElement["box"], fontSize: number, kind: MotionKind = "slide-up"): SceneElement {
  return {
    id: `build-${sceneId}-heading`,
    kind: "text",
    text,
    box,
    z: 6,
    fontSize,
    fontWeight: "bold",
    color: WHITE,
    appearAt: 0.3,
    motion: enter(kind, 0.7),
  };
}

function accentBar(L: VideoLayout, sceneId: VideoSceneId, look: SceneLook, y: number): SceneElement {
  return {
    id: `build-${sceneId}-bar`,
    kind: "text",
    text: "",
    box: { x: L.margin, y, w: L.bar.w, h: 1.1 },
    z: 6,
    style: { backgroundColor: look.accent, borderRadius: 9999 },
    appearAt: 0.8,
    motion: enter("slide-left", 0.5),
  };
}

/** Body lines, each its own element so they arrive one after another. */
function bodyLines(L: VideoLayout, sceneId: VideoSceneId, lines: string[], look: SceneLook): SceneElement[] {
  return lines.slice(0, 3).map((line, i) => ({
    id: `build-${sceneId}-body-${i}`,
    kind: "text",
    text: toHeadline(line, 70),
    box: { x: L.margin, y: L.body.y + i * L.body.step, w: L.body.w, h: L.body.h },
    z: 6,
    fontSize: px(L, 42),
    fontWeight: i === 0 ? "bold" : "normal",
    color: i === 0 ? look.accent : WHITE,
    appearAt: 1 + i * 0.35,
    motion: enter("slide-left", 0.5),
  }));
}

/** Skill pills laid out in rows, popping in one by one. */
function skillPills(L: VideoLayout, sceneId: VideoSceneId, skills: string[], look: SceneLook): SceneElement[] {
  const out: SceneElement[] = [];
  const fontSize = px(L, 36);
  let x = L.margin;
  let row = 0;
  skills.forEach((skill, i) => {
    const text = toHeadline(skill, 28);
    const w = pillWidth(L, text, fontSize, 40) + 2;
    if (x + w > L.skills.xMax) {
      x = L.margin;
      row += 1;
    }
    if (row > 2) return;
    out.push({
      id: `build-${sceneId}-skill-${i}`,
      kind: "text",
      text,
      box: { x, y: L.skills.y + row * L.skills.rowStep, w, h: L.skills.h },
      z: 6,
      fontSize,
      fontWeight: "bold",
      color: WHITE,
      align: "center",
      style: { backgroundColor: "rgba(255,255,255,0.18)", borderColor: look.accent, borderWidth: 3, borderRadius: 9999, padding: 14 },
      appearAt: 0.9 + i * 0.22,
      motion: enter("pulse", 0.5),
    });
    x += w + 1.5;
  });
  return out;
}

function caption(L: VideoLayout, sceneId: VideoSceneId, text: string): SceneElement {
  return {
    id: `build-${sceneId}-caption`,
    kind: "text",
    text,
    box: { ...L.caption },
    z: 7,
    fontSize: px(L, 36),
    color: WHITE,
    align: "center",
    style: { backgroundColor: "rgba(0,0,0,0.28)", borderRadius: 18, padding: 14 },
    appearAt: 1.8,
    motion: enter("slide-up", 0.5),
  };
}

/** The résumé itself, as a page sliding up beside (or under) the Proof
 *  headline: the chosen roles, then the skills. Positions are the 16:9
 *  design's, mapped into the shape's page box. */
function resumePage(L: VideoLayout, page: Box, outline: VideoOutline, look: SceneLook, t: Translate): SceneElement[] {
  const id = (part: string) => `build-proof-page-${part}`;
  // The 16:9 page spans y 7 → 93 (h 86): map its rows into `page`.
  const py = (y: number) => page.y + ((y - 7) / 86) * page.h;
  const ph = (h: number) => (h / 86) * page.h;
  const x = page.x + 2.5;
  const w = page.w - 5;
  const els: SceneElement[] = [
    { id: id("page"), kind: "text", text: "", box: { ...page }, z: 3, style: { backgroundColor: WHITE, borderRadius: 20 }, appearAt: 0.2, motion: enter("slide-up", 0.7) },
  ];
  const head = (part: string, text: string, y: number, h: number, fontSize: number, color: string, bold: boolean, at: number): SceneElement => ({
    id: id(part), kind: "text", text, box: { x, y: py(y), w, h: ph(h) }, z: 4, fontSize: px(L, fontSize), fontWeight: bold ? "bold" : "normal", color, appearAt: at, motion: enter("fade", 0.4),
  });
  if (outline.name) els.push(head("name", outline.name, 11, 6, 46, PAPER_INK, true, 0.6));
  if (outline.role) els.push(head("role", outline.role, 17.5, 4.5, 28, look.to, true, 0.7));
  els.push({ id: id("rule"), kind: "text", text: "", box: { x, y: py(23.5), w, h: 0.4 }, z: 4, style: { backgroundColor: "#CBD5E1" }, appearAt: 0.75, motion: enter("slide-left", 0.4) });
  if (outline.history.length > 0) {
    els.push(head("experience", t("build.video.resumeExperience").toUpperCase(), 25.5, 3.5, 22, PAPER_LABEL, true, 0.8));
    outline.history.forEach((role: VideoOutlineRole, i) => {
      const y = 30 + i * 10;
      const at = 1 + i * 0.3;
      const meta = [role.company, rolePeriod(role, t)].filter(Boolean).join(" · ");
      els.push(
        { id: id(`role-${i}`), kind: "text", text: toHeadline(role.position || role.company, 48), box: { x, y: py(y), w, h: ph(4) }, z: 4, fontSize: px(L, 26), fontWeight: "bold", color: PAPER_INK, appearAt: at, motion: enter("slide-up", 0.45) },
        { id: id(`meta-${i}`), kind: "text", text: toHeadline(meta, 56), box: { x, y: py(y + 4.2), w, h: ph(3.8) }, z: 4, fontSize: px(L, 22), color: PAPER_MUTED, appearAt: at, motion: enter("slide-up", 0.45) },
      );
    });
  }
  if (outline.skills.length > 0) {
    els.push(head("skills-label", t("build.video.scene.skills").toUpperCase(), 70.5, 3.5, 22, PAPER_LABEL, true, 2));
    els.push({ id: id("skills"), kind: "chips", chips: outline.skills, box: { x, y: py(75), w, h: ph(14) }, z: 4, fontSize: px(L, 22), chipColor: "#EEF2FF", textColor: "#3730A3", direction: "row", appearAt: 2.2, motion: enter("fade", 0.5) });
  }
  return els;
}

/** Proof: the headline + company + top bullets, with the résumé page listing
 *  the chosen roles beside (16:9) or under (9:16) it. */
function proofElements(L: VideoLayout, copy: SceneCopy, outline: VideoOutline, look: SceneLook, t: Translate): SceneElement[] {
  const P = L.proof;
  const els: SceneElement[] = [
    heading("proof", copy.heading, { ...P.heading }, px(L, copy.heading.length <= 28 ? 80 : 64)),
    accentBar(L, "proof", look, P.barY),
  ];
  copy.body.slice(0, 3).forEach((line, i) => {
    els.push({
      id: `build-proof-body-${i}`,
      kind: "text",
      text: toHeadline(line, 64),
      box: { x: P.heading.x, y: P.body.y + i * P.body.step, w: P.body.w, h: P.body.h },
      z: 6,
      fontSize: px(L, i === 0 ? 38 : 32),
      fontWeight: i === 0 ? "bold" : "normal",
      color: i === 0 ? look.accent : WHITE,
      appearAt: 0.9 + i * 0.35,
      motion: enter("slide-left", 0.5),
    });
  });
  return P.page ? [...els, ...resumePage(L, P.page, outline, look, t)] : els;
}

function sceneElements(L: VideoLayout, scene: VideoOutlineScene, copy: SceneCopy, outline: VideoOutline, t: Translate): SceneElement[] {
  const sceneId = scene.id;
  const look = scene.palette;
  const els: SceneElement[] = [decor(L, sceneId), kicker(L, sceneId, copy.kicker ?? copy.label, look)];
  if (sceneId === "proof") return [...els, ...proofElements(L, copy, outline, look, t)];
  els.push(...avatar(L, sceneId, outline, look));
  if (copy.heading) {
    els.push(heading(sceneId, copy.heading, { ...L.heading }, px(L, headingPx(copy.heading)), sceneId === "next" ? "scale" : "slide-up"));
    els.push(accentBar(L, sceneId, look, L.bar.y));
  }
  els.push(...(sceneId === "skills" ? skillPills(L, sceneId, copy.body, look) : bodyLines(L, sceneId, copy.body, look)));
  if (copy.caption) els.push(caption(L, sceneId, copy.caption));
  return els;
}

/** Outline → v1 VideoScript, the shape `scriptToCanvasState` converts to the
 *  v2 canvas (see video-canvas.ts). Scenes carry NO title/text slots — their whole
 *  layout is `sceneElements` so nothing is placed twice. */
export function outlineToVideoScript(outline: VideoOutline, t: Translate): VideoScript {
  const L = VIDEO_LAYOUTS[outline.aspect];
  let cursor = 0;
  const scenes: SceneScript[] = outline.scenes.map((scene): SceneScript => {
    const copy = sceneCopy(scene, outline, t);
    const look = scene.palette;
    const own = scene.overrides;
    const ground = sceneGround(look, own.background);
    const start = cursor;
    cursor += scene.duration;
    // The owner's look overrides (scene-overrides.ts): font, motion, then the
    // export resolution's pixel scale.
    const els = withResolution(
      withSceneMotion(withSceneFont(sceneElements(L, scene, copy, outline, t), own.font), own.motion),
      outline.export.resolution,
    );
    return {
      id: canvasSceneId(scene.id),
      start,
      duration: scene.duration,
      type: SCENE_TYPE[scene.id],
      // The plan role names the scene ("Hook", "Proof"), so the chip, the rail
      // and the on-frame kicker agree; the v1 type is only render semantics
      // (two roles share "achievement") (#2349).
      label: copy.label,
      title: "",
      accentColor: ground.fill,
      ...(ground.effect ? { backgroundEffect: ground.effect } : {}),
      ...(own.transitionIn ? { transitionIn: own.transitionIn } : {}),
      ...(own.effects?.length ? { effects: own.effects.map((e) => ({ kind: e.kind, params: { ...e.params } })) } : {}),
      sceneElements: els,
    };
  });
  // Background music: a stock track from lib/studio/music-catalog.ts
  // (procedural, no asset to host); "none" or an unknown id → silent.
  const track = outline.music === "none" ? null : findMusicTrack(outline.music);
  const first = outline.scenes[0]?.palette ?? SCENE_LOOKS.violet;
  return {
    video: {
      duration: cursor,
      fps: outline.export.fps ?? 30,
      resolution: outline.export.resolution ?? "1080p",
      ...(outline.export.codec ? { codec: outline.export.codec } : {}),
      aspect: outline.aspect,
      theme: {
        colorPalette: [first.from, first.to, WHITE],
        fontFamily: "Geist, Inter, sans-serif",
        motion: "moderate",
        transition: "fade",
        background: "gradient",
      },
      ...(track ? { audio: { track: track.id, label: track.label, volume: MUSIC_VOLUME } } : {}),
      purpose: "resume",
    },
    scenes,
  };
}

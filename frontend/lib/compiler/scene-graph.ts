// scene-graph.ts — builds a SceneNode tree from a SceneScript + VideoTheme.
// One builder function per scene type.

import type { SceneScript, VideoTheme, AnimationSpec, ImagePosition, TextAlign } from "../../types/video-script";
import { normaliseSceneEffect } from "../../types/video-script";
import type { SceneNode, Transform2D, NodeStyle } from "./types";
import { compileAnimation } from "./animation-graph";

// ─── Default animations ───────────────────────────────────────────────────────
// When the script doesn't specify animation specs, generate sensible defaults
// based on the motion style. `order` controls stagger delay (0 = first node).

function defaultAnim(motion: VideoTheme["motion"], order: number): AnimationSpec {
  const delay = order * 0.22;
  switch (motion) {
    case "minimal":
      return { type: "fadeIn", start: delay, duration: 0.4, easing: "easeOut" };
    case "cinematic":
      return order === 0
        ? { type: "scaleIn",  start: 0,     duration: 0.7, easing: "spring" }
        : { type: "slideUp",  start: delay, duration: 0.65, easing: "easeOut" };
    default: // moderate
      return { type: "slideUp", start: delay, duration: 0.5, easing: "easeOut" };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function identity(): Transform2D {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1 };
}

function baseStyle(theme: VideoTheme, overrides: Partial<NodeStyle> = {}): NodeStyle {
  return {
    color: "#ffffff",
    fontSize: 32,
    fontFamily: theme.fontFamily || "Inter, sans-serif",
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 1.4,
    padding: 0,
    ...overrides,
  };
}

let _nodeIdCounter = 0;
function nodeId(prefix: string): string {
  return `${prefix}-${++_nodeIdCounter}`;
}

function makeNode(
  type: SceneNode["type"],
  content: string | undefined,
  transform: Partial<Transform2D>,
  style: Partial<NodeStyle>,
  theme: VideoTheme,
  scene: SceneScript,
  animOrder: number,
  animKey?: keyof NonNullable<SceneScript["animation"]>,
  items?: string[],
): SceneNode {
  const explicit = animKey ? scene.animation?.[animKey] : undefined;
  const spec = explicit ?? defaultAnim(theme.motion, animOrder);
  const animations = spec.type === "none" ? [] : compileAnimation(spec);

  // Per-scene text colour override — applies to text and textGroup nodes only.
  // The scene's `textColor` overrides any colour the builder passed in `style`.
  const finalStyle: Partial<NodeStyle> =
    (type === "text" || type === "textGroup") && scene.textColor
      ? { ...style, color: scene.textColor }
      : style;

  return {
    id: nodeId(type),
    type,
    transform: { ...identity(), ...transform },
    style: baseStyle(theme, finalStyle),
    content,
    items,
    animations,
  };
}

/** Optional translucent card behind text — drawn when scene.cardBackgroundColor or cardBorderColor is set. */
function cardBackgroundNode(scene: SceneScript, theme: VideoTheme): SceneNode | null {
  if (!scene.cardBackgroundColor && !scene.cardBorderColor) return null;
  return {
    id: nodeId("card"),
    type: "overlay",
    transform: identity(),
    style: baseStyle(theme, {
      background: scene.cardBackgroundColor ?? "rgba(0,0,0,0.4)",
      borderRadius: 18, // forces "card" rendering mode in canvas-nodes
      ...(scene.cardBorderColor ? { borderColor: scene.cardBorderColor, borderWidth: 2 } : {}),
    }),
    animations: [],
  };
}

// ─── Background helper ────────────────────────────────────────────────────────

function backgroundNode(theme: VideoTheme, palette: string[], scene: SceneScript): SceneNode {
  const primary = palette[0] ?? "#7c3aed";
  const secondary = palette[1] ?? "#2563eb";

  const sceneBgUrl = scene.backgroundImage;
  const sceneBgType = scene.backgroundMediaType ?? "image";
  const sceneBgPos = scene.backgroundImagePosition;

  // Per-scene full-screen media takes priority over the global theme background.
  // "full" (or no position) → media replaces the background entirely.
  const useSceneAsBg = sceneBgUrl && (!sceneBgPos || sceneBgPos === "full");

  let bgContent: string;
  if (useSceneAsBg) {
    bgContent = sceneBgType === "video"
      ? `customVideo:${sceneBgUrl}`
      : `custom:${sceneBgUrl}`;
  } else if (theme.customBackground) {
    const themeType = theme.customBackgroundType ?? "image";
    bgContent = themeType === "video"
      ? `customVideo:${theme.customBackground}`
      : `custom:${theme.customBackground}`;
  } else if (theme.background === "solid") {
    bgContent = primary;
  } else if (theme.background === "dark-tech-grid") {
    bgContent = "dark-tech-grid:" + primary;
  } else if (theme.background === "particles") {
    bgContent = "particles:" + primary;
  } else {
    bgContent = `gradient:${primary}:${secondary}`;
  }

  return {
    id: nodeId("background"),
    type: "background",
    transform: identity(),
    style: baseStyle(theme, { background: bgContent }),
    content: bgContent,
    animations: [],
  };
}

/** Image overlay node for non-full positions (legacy backgroundImage path). */
function imageOverlayNode(url: string, position: ImagePosition, theme: VideoTheme, animation?: string, mediaType: "image" | "video" = "image"): SceneNode {
  const content = mediaType === "video"
    ? `video:${position}:${url}`
    : `${position}:${url}`;
  return {
    id: nodeId("image"),
    type: "image",
    transform: identity(),
    style: baseStyle(theme, { background: content }),
    content,
    kenBurns: animation && animation !== "none" ? animation : undefined,
    animations: [],
  };
}

/** New explicit overlay node — drawn on top of the scene background. */
function overlayMediaNode(scene: SceneScript, theme: VideoTheme): SceneNode | null {
  if (!scene.overlayMediaUrl) return null;
  const position = scene.overlayMediaPosition ?? "full";
  const mediaType = scene.overlayMediaType ?? "image";
  return imageOverlayNode(scene.overlayMediaUrl, position, theme, scene.overlayMediaAnimation, mediaType);
}

/** Particles overlay — rendered on top of whatever the background is (including custom images). */
function particlesNode(theme: VideoTheme): SceneNode {
  return {
    id: nodeId("particles"),
    type: "particles",
    transform: identity(),
    style: baseStyle(theme),
    animations: [],
  };
}

/** Returns true when particles should be rendered (regardless of whether a custom image is set). */
function shouldAddParticles(theme: VideoTheme, scene: SceneScript): boolean {
  if (theme.background === "particles") return true;
  // Also apply particles if the user has an image + a particles scene effect.
  // Effects route through `normaliseSceneEffect` so legacy `{type}` rows and
  // new `{kind, params}` rows both resolve to the same predicate.
  if (
    scene.backgroundImage &&
    scene.effects?.some((e) => normaliseSceneEffect(e).kind === "particles")
  ) {
    return true;
  }
  return false;
}

// ─── Scene builders ───────────────────────────────────────────────────────────

function buildIntroGraph(scene: SceneScript, theme: VideoTheme): SceneNode[] {
  const effectivePalette = scene.accentColor
    ? [scene.accentColor, ...theme.colorPalette.slice(1)]
    : theme.colorPalette;
  const pos = scene.backgroundImagePosition;
  const nodes: SceneNode[] = [backgroundNode(theme, effectivePalette, scene)];
  // Legacy: backgroundImage with a non-full position is treated as an overlay
  if (scene.backgroundImage && pos && pos !== "full") {
    nodes.push(imageOverlayNode(scene.backgroundImage, pos, theme, scene.imageAnimation, scene.backgroundMediaType ?? "image"));
  }
  // New: explicit overlay media (independent of the background)
  const overlay = overlayMediaNode(scene, theme);
  if (overlay) nodes.push(overlay);

  if (shouldAddParticles(theme, scene)) {
    nodes.push(particlesNode(theme));
  }

  const card = cardBackgroundNode(scene, theme);
  if (card) nodes.push(card);

  let order = 0;
  if (scene.title) {
    nodes.push(makeNode("text", scene.title, { y: -50 }, { fontSize: 52, fontWeight: "bold", textAlign: (scene.textAlign ?? "center") as TextAlign }, theme, scene, order++, "titleEnter"));
  }
  if (scene.subtitle) {
    nodes.push(makeNode("text", scene.subtitle, { y: 20 }, { fontSize: 26, fontWeight: "normal", color: effectivePalette[2] ?? "#e2e8f0", textAlign: (scene.textAlign ?? "center") as TextAlign }, theme, scene, order++, "subtitleEnter"));
  }
  if (scene.text) {
    const body = Array.isArray(scene.text) ? scene.text.join(" ") : scene.text;
    nodes.push(makeNode("text", body, { y: 90 }, { fontSize: 18, fontWeight: "normal", color: effectivePalette[3] ?? "#c4b5fd", lineHeight: 1.5, textAlign: (scene.textAlign ?? "center") as TextAlign }, theme, scene, order++, "subtitleEnter"));
  }
  return nodes;
}

function buildAchievementGraph(scene: SceneScript, theme: VideoTheme): SceneNode[] {
  const effectivePalette = scene.accentColor
    ? [scene.accentColor, ...theme.colorPalette.slice(1)]
    : theme.colorPalette;
  const pos = scene.backgroundImagePosition;
  const nodes: SceneNode[] = [backgroundNode(theme, effectivePalette, scene)];
  // Legacy: backgroundImage with a non-full position is treated as an overlay
  if (scene.backgroundImage && pos && pos !== "full") {
    nodes.push(imageOverlayNode(scene.backgroundImage, pos, theme, scene.imageAnimation, scene.backgroundMediaType ?? "image"));
  }
  // New: explicit overlay media (independent of the background)
  const overlay = overlayMediaNode(scene, theme);
  if (overlay) nodes.push(overlay);

  if (shouldAddParticles(theme, scene)) {
    nodes.push(particlesNode(theme));
  }

  const card = cardBackgroundNode(scene, theme);
  if (card) nodes.push(card);

  let order = 0;
  if (scene.title) {
    nodes.push(makeNode("text", scene.title, { y: -80 }, { fontSize: 38, fontWeight: "bold", textAlign: (scene.textAlign ?? "center") as TextAlign }, theme, scene, order++, "titleEnter"));
  }

  const items = scene.items ?? (scene.text ? (Array.isArray(scene.text) ? scene.text : [scene.text]) : []);
  if (items.length > 0) {
    nodes.push(makeNode("textGroup", undefined, { y: 20 }, { fontSize: 22, textAlign: (scene.textAlign ?? "center") as TextAlign }, theme, scene, order++, "textEnter", items));
  }
  return nodes;
}

function buildSkillsGraph(scene: SceneScript, theme: VideoTheme): SceneNode[] {
  const effectivePalette = scene.accentColor
    ? [scene.accentColor, ...theme.colorPalette.slice(1)]
    : theme.colorPalette;
  const pos = scene.backgroundImagePosition;
  const nodes: SceneNode[] = [backgroundNode(theme, effectivePalette, scene)];
  // Legacy: backgroundImage with a non-full position is treated as an overlay
  if (scene.backgroundImage && pos && pos !== "full") {
    nodes.push(imageOverlayNode(scene.backgroundImage, pos, theme, scene.imageAnimation, scene.backgroundMediaType ?? "image"));
  }
  // New: explicit overlay media (independent of the background)
  const overlay = overlayMediaNode(scene, theme);
  if (overlay) nodes.push(overlay);

  if (shouldAddParticles(theme, scene)) {
    nodes.push(particlesNode(theme));
  }

  const card = cardBackgroundNode(scene, theme);
  if (card) nodes.push(card);

  let order = 0;
  if (scene.title) {
    nodes.push(makeNode("text", scene.title, { y: -100 }, { fontSize: 38, fontWeight: "bold", textAlign: (scene.textAlign ?? "center") as TextAlign }, theme, scene, order++, "titleEnter"));
  }

  const skills = scene.skills ?? [];
  if (skills.length > 0) {
    nodes.push(makeNode("skillBubble", undefined, { y: 20 }, { fontSize: 20, background: effectivePalette[1] ?? "#2563eb" }, theme, scene, order++, "textEnter", skills));
  }
  return nodes;
}

function buildClosingGraph(scene: SceneScript, theme: VideoTheme): SceneNode[] {
  const effectivePalette = scene.accentColor
    ? [scene.accentColor, ...theme.colorPalette.slice(1)]
    : theme.colorPalette;
  const pos = scene.backgroundImagePosition;
  const nodes: SceneNode[] = [backgroundNode(theme, effectivePalette, scene)];
  // Legacy: backgroundImage with a non-full position is treated as an overlay
  if (scene.backgroundImage && pos && pos !== "full") {
    nodes.push(imageOverlayNode(scene.backgroundImage, pos, theme, scene.imageAnimation, scene.backgroundMediaType ?? "image"));
  }
  // New: explicit overlay media (independent of the background)
  const overlay = overlayMediaNode(scene, theme);
  if (overlay) nodes.push(overlay);

  if (shouldAddParticles(theme, scene)) {
    nodes.push(particlesNode(theme));
  }

  nodes.push({
    id: nodeId("overlay"),
    type: "overlay",
    transform: { ...identity(), alpha: 0.4 },
    style: baseStyle(theme, { background: "#000000" }),
    animations: [],
  });

  const card = cardBackgroundNode(scene, theme);
  if (card) nodes.push(card);

  let order = 0;
  if (scene.title) {
    nodes.push(makeNode("text", scene.title, { y: -70 }, { fontSize: 42, fontWeight: "bold", textAlign: (scene.textAlign ?? "center") as TextAlign }, theme, scene, order++, "titleEnter"));
  }
  if (scene.text) {
    const body = Array.isArray(scene.text) ? scene.text.join(" ") : scene.text;
    nodes.push(makeNode("text", body, { y: 0 }, { fontSize: 20, fontWeight: "normal", color: effectivePalette[2] ?? "#e2e8f0", lineHeight: 1.5, textAlign: (scene.textAlign ?? "center") as TextAlign }, theme, scene, order++, "titleEnter"));
  }
  if (scene.subtitle) {
    nodes.push(makeNode("text", scene.subtitle, { y: 65 }, { fontSize: 20, fontWeight: "normal", color: effectivePalette[2] ?? "#e2e8f0", textAlign: (scene.textAlign ?? "center") as TextAlign }, theme, scene, order++, "subtitleEnter"));
  }
  return nodes;
}

/** Convert each free-form scene element into a render node. Z-ordered ascending. */
function buildElementNodes(scene: SceneScript, theme: VideoTheme): SceneNode[] {
  if (!scene.sceneElements?.length) return [];
  // Sort by z (default 0) so higher z values draw on top
  const sorted = [...scene.sceneElements].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  return sorted.map((el): SceneNode => ({
    id: nodeId("element"),
    type: "element",
    transform: identity(),
    style: baseStyle(theme),
    element: el,
    animations: [],
  }));
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function buildSceneGraph(scene: SceneScript, theme: VideoTheme): SceneNode[] {
  _nodeIdCounter = 0; // reset per scene for deterministic IDs

  // If the scene has migrated to the new sceneElements model, render only
  // the theme background + the elements. The legacy text/image nodes are
  // skipped since the elements own all the visual content.
  if (scene.sceneElements && scene.sceneElements.length > 0) {
    const effectivePalette = scene.accentColor
      ? [scene.accentColor, ...theme.colorPalette.slice(1)]
      : theme.colorPalette;
    const nodes: SceneNode[] = [backgroundNode(theme, effectivePalette, scene)];
    if (shouldAddParticles(theme, scene)) nodes.push(particlesNode(theme));
    return [...nodes, ...buildElementNodes(scene, theme)];
  }

  let baseNodes: SceneNode[];
  switch (scene.type) {
    case "intro":       baseNodes = buildIntroGraph(scene, theme); break;
    case "achievement": baseNodes = buildAchievementGraph(scene, theme); break;
    case "skills":      baseNodes = buildSkillsGraph(scene, theme); break;
    case "closing":     baseNodes = buildClosingGraph(scene, theme); break;
    default:            baseNodes = buildIntroGraph(scene, theme); break;
  }
  // Legacy path: render canonical layout + any additive elements on top
  return [...baseNodes, ...buildElementNodes(scene, theme)];
}

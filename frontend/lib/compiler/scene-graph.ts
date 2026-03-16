// scene-graph.ts — builds a SceneNode tree from a SceneScript + VideoTheme.
// One builder function per scene type.

import type { SceneScript, VideoTheme } from "../../types/video-script";
import type { SceneNode, Transform2D, NodeStyle } from "./types";
import { compileAnimation } from "./animation-graph";

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
  animKey?: keyof NonNullable<SceneScript["animation"]>,
  items?: string[],
): SceneNode {
  const animations = animKey && scene.animation?.[animKey]
    ? compileAnimation(scene.animation[animKey]!)
    : [];

  return {
    id: nodeId(type),
    type,
    transform: { ...identity(), ...transform },
    style: baseStyle(theme, style),
    content,
    items,
    animations,
  };
}

// ─── Background helper ────────────────────────────────────────────────────────

function backgroundNode(theme: VideoTheme, palette: string[]): SceneNode {
  const primary = palette[0] ?? "#7c3aed";
  const secondary = palette[1] ?? "#2563eb";
  const bgContent =
    theme.background === "solid"
      ? primary
      : theme.background === "dark-tech-grid"
      ? "dark-tech-grid:" + primary
      : theme.background === "particles"
      ? "particles:" + primary
      : `gradient:${primary}:${secondary}`;

  return {
    id: nodeId("background"),
    type: "background",
    transform: identity(),
    style: baseStyle(theme, { background: bgContent }),
    content: bgContent,
    animations: [],
  };
}

// ─── Scene builders ───────────────────────────────────────────────────────────

function buildIntroGraph(scene: SceneScript, theme: VideoTheme): SceneNode[] {
  const palette = theme.colorPalette;
  const nodes: SceneNode[] = [backgroundNode(theme, palette)];

  if (theme.background === "particles") {
    nodes.push({
      id: nodeId("particles"),
      type: "particles",
      transform: identity(),
      style: baseStyle(theme),
      animations: [],
    });
  }

  if (scene.title) {
    nodes.push(makeNode("text", scene.title, { y: -50 }, { fontSize: 52, fontWeight: "bold" }, theme, scene, "titleEnter"));
  }
  if (scene.subtitle) {
    nodes.push(makeNode("text", scene.subtitle, { y: 20 }, { fontSize: 26, fontWeight: "normal", color: palette[2] ?? "#e2e8f0" }, theme, scene, "subtitleEnter"));
  }
  if (scene.text) {
    const body = Array.isArray(scene.text) ? scene.text.join(" ") : scene.text;
    nodes.push(makeNode("text", body, { y: 90 }, { fontSize: 18, fontWeight: "normal", color: palette[3] ?? "#c4b5fd", lineHeight: 1.5 }, theme, scene, "subtitleEnter"));
  }
  return nodes;
}

function buildAchievementGraph(scene: SceneScript, theme: VideoTheme): SceneNode[] {
  const palette = theme.colorPalette;
  const nodes: SceneNode[] = [backgroundNode(theme, palette)];

  if (scene.title) {
    nodes.push(makeNode("text", scene.title, { y: -80 }, { fontSize: 38, fontWeight: "bold" }, theme, scene, "titleEnter"));
  }

  const items = scene.items ?? (scene.text ? (Array.isArray(scene.text) ? scene.text : [scene.text]) : []);
  if (items.length > 0) {
    nodes.push(makeNode("textGroup", undefined, { y: 20 }, { fontSize: 22, textAlign: "left" }, theme, scene, "textEnter", items));
  }
  return nodes;
}

function buildSkillsGraph(scene: SceneScript, theme: VideoTheme): SceneNode[] {
  const palette = theme.colorPalette;
  const nodes: SceneNode[] = [backgroundNode(theme, palette)];

  if (scene.title) {
    nodes.push(makeNode("text", scene.title, { y: -100 }, { fontSize: 38, fontWeight: "bold" }, theme, scene, "titleEnter"));
  }

  const skills = scene.skills ?? [];
  if (skills.length > 0) {
    nodes.push(makeNode("skillBubble", undefined, { y: 20 }, { fontSize: 20, background: palette[1] ?? "#2563eb" }, theme, scene, "textEnter", skills));
  }
  return nodes;
}

function buildClosingGraph(scene: SceneScript, theme: VideoTheme): SceneNode[] {
  const palette = theme.colorPalette;
  const nodes: SceneNode[] = [backgroundNode(theme, palette)];

  nodes.push({
    id: nodeId("overlay"),
    type: "overlay",
    transform: { ...identity(), alpha: 0.4 },
    style: baseStyle(theme, { background: "#000000" }),
    animations: [],
  });

  if (scene.title) {
    nodes.push(makeNode("text", scene.title, { y: -70 }, { fontSize: 42, fontWeight: "bold" }, theme, scene, "titleEnter"));
  }
  if (scene.text) {
    const body = Array.isArray(scene.text) ? scene.text.join(" ") : scene.text;
    nodes.push(makeNode("text", body, { y: 0 }, { fontSize: 20, fontWeight: "normal", color: palette[2] ?? "#e2e8f0", lineHeight: 1.5 }, theme, scene, "titleEnter"));
  }
  if (scene.subtitle) {
    nodes.push(makeNode("text", scene.subtitle, { y: 65 }, { fontSize: 20, fontWeight: "normal", color: palette[2] ?? "#e2e8f0" }, theme, scene, "subtitleEnter"));
  }
  return nodes;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function buildSceneGraph(scene: SceneScript, theme: VideoTheme): SceneNode[] {
  _nodeIdCounter = 0; // reset per scene for deterministic IDs
  switch (scene.type) {
    case "intro":       return buildIntroGraph(scene, theme);
    case "achievement": return buildAchievementGraph(scene, theme);
    case "skills":      return buildSkillsGraph(scene, theme);
    case "closing":     return buildClosingGraph(scene, theme);
    default:            return buildIntroGraph(scene, theme);
  }
}

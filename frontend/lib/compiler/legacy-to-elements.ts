// legacy-to-elements.ts — convert a scene's legacy fields into the new
// free-form sceneElements model so the user gets a unified editing experience.
//
// Existing scenes have:
//   - title / subtitle / text  → text elements
//   - items                    → text element with newline-separated bullets
//   - skills                   → text element with comma-separated chips
//   - backgroundImage + position + animation → image/video element
//   - overlayMediaUrl + position + animation → image/video element
//
// We map each of those into a SceneElement with the same visual layout the
// canonical scene compiler used to produce.

import type {
  SceneScript, SceneElement, ElementBox,
} from "@/types/video-script";

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Convert an ImagePosition (canvas-relative keyword) into a percentage box. */
function positionToBox(position?: string): ElementBox {
  switch (position) {
    case "half-left":   return { x: 0,  y: 0,  w: 50,  h: 100 };
    case "half-right":  return { x: 50, y: 0,  w: 50,  h: 100 };
    case "small-left":  return { x: 5,  y: 20, w: 42,  h: 60 };
    case "small-right": return { x: 53, y: 20, w: 42,  h: 60 };
    case "corner-tl":   return { x: 3,  y: 3,  w: 36,  h: 36 };
    case "corner-tr":   return { x: 61, y: 3,  w: 36,  h: 36 };
    case "corner-bl":   return { x: 3,  y: 61, w: 36,  h: 36 };
    case "corner-br":   return { x: 61, y: 61, w: 36,  h: 36 };
    default:            return { x: 0,  y: 0,  w: 100, h: 100 }; // full
  }
}

/** Build a centered text box at a given vertical position with a height for the text. */
function textBox(verticalSlot: "top" | "middle" | "bottom"): ElementBox {
  if (verticalSlot === "top")    return { x: 5, y: 8,  w: 90, h: 20 };
  if (verticalSlot === "middle") return { x: 5, y: 38, w: 90, h: 24 };
  return { x: 5, y: 72, w: 90, h: 20 };
}

/** Convert one scene's legacy fields into an array of SceneElements. */
export function legacySceneToElements(scene: SceneScript): SceneElement[] {
  // If the scene already has elements, don't migrate — they're authoritative.
  if (scene.sceneElements && scene.sceneElements.length > 0) {
    return scene.sceneElements;
  }

  const elements: SceneElement[] = [];
  let z = 0;

  // 1. Background media (image or video) — z=0, lowest layer
  if (scene.backgroundImage) {
    const pos = scene.backgroundImagePosition;
    elements.push({
      id: makeId("el-bg"),
      kind: scene.backgroundMediaType === "video" ? "video" : "image",
      url: scene.backgroundImage,
      box: positionToBox(pos),
      fit: "cover",
      animation: scene.imageAnimation,
      z: z++,
    } as SceneElement);
  }

  // 2. Overlay media (image or video) — z=1
  if (scene.overlayMediaUrl) {
    elements.push({
      id: makeId("el-ovl"),
      kind: scene.overlayMediaType === "video" ? "video" : "image",
      url: scene.overlayMediaUrl,
      box: positionToBox(scene.overlayMediaPosition ?? "half-right"),
      fit: "cover",
      animation: scene.overlayMediaAnimation,
      z: z++,
    } as SceneElement);
  }

  // 3. Text elements — title (top), subtitle/body (middle), items/skills (middle/bottom)
  const baseTextStyle = {
    color: scene.textColor ?? "#ffffff",
    align: (scene.textAlign ?? "center") as "left" | "center" | "right",
    verticalAlign: "middle" as const,
    style: scene.cardBackgroundColor || scene.cardBorderColor
      ? {
          backgroundColor: scene.cardBackgroundColor,
          borderColor: scene.cardBorderColor,
          borderWidth: scene.cardBorderColor ? 2 : undefined,
          borderRadius: 12,
          padding: 16,
        }
      : undefined,
  };

  if (scene.title) {
    elements.push({
      id: makeId("el-title"),
      kind: "text",
      text: scene.title,
      box: textBox("top"),
      fontSize: 48,
      fontWeight: "bold",
      ...baseTextStyle,
      z: z++,
    });
  }

  if (scene.subtitle) {
    elements.push({
      id: makeId("el-subtitle"),
      kind: "text",
      text: scene.subtitle,
      box: { x: 5, y: 30, w: 90, h: 12 },
      fontSize: 24,
      fontWeight: "normal",
      ...baseTextStyle,
      z: z++,
    });
  }

  // text (string or string[]) → joined paragraph
  if (scene.text) {
    const body = Array.isArray(scene.text) ? scene.text.join("\n") : scene.text;
    elements.push({
      id: makeId("el-text"),
      kind: "text",
      text: body,
      box: textBox("middle"),
      fontSize: 20,
      fontWeight: "normal",
      ...baseTextStyle,
      z: z++,
    });
  }

  // items → bullet list
  if (scene.items?.length) {
    const bullets = scene.items.map((it) => `• ${it}`).join("\n");
    elements.push({
      id: makeId("el-items"),
      kind: "text",
      text: bullets,
      box: textBox("middle"),
      fontSize: 22,
      fontWeight: "normal",
      ...baseTextStyle,
      align: "left",
      z: z++,
    });
  }

  // skills → comma-separated, bottom
  if (scene.skills?.length) {
    elements.push({
      id: makeId("el-skills"),
      kind: "text",
      text: scene.skills.join(" • "),
      box: textBox("bottom"),
      fontSize: 22,
      fontWeight: "bold",
      ...baseTextStyle,
      z: z++,
    });
  }

  return elements;
}

/** Migrate every scene in a script and clear the legacy fields once converted. */
export function migrateScriptToElements(script: { scenes: SceneScript[] }): { scenes: SceneScript[] } {
  return {
    ...script,
    scenes: script.scenes.map((scene) => {
      // Skip scenes that already have elements
      if (scene.sceneElements && scene.sceneElements.length > 0) return scene;

      const elements = legacySceneToElements(scene);
      if (elements.length === 0) return scene;

      // Clear legacy fields that have been migrated. We keep `title`/`text`
      // metadata around for the script-level features that may still query
      // them (chapters, voiceover text builder, etc.) but the renderer will
      // now use `sceneElements`.
      return {
        ...scene,
        sceneElements: elements,
        // Clear visual-only legacy fields so they don't double-render
        backgroundImage: undefined,
        backgroundMediaType: undefined,
        backgroundImagePosition: undefined,
        imageAnimation: undefined,
        overlayMediaUrl: undefined,
        overlayMediaType: undefined,
        overlayMediaPosition: undefined,
        overlayMediaAnimation: undefined,
        cardBackgroundColor: undefined,
        cardBorderColor: undefined,
      };
    }),
  };
}

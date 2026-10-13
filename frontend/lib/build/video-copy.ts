/**
 * Localized copy for the kit video outline — ONE place that turns outline
 * DATA into on-screen text. The visual design (palette, layout, motion) that
 * places this copy lives in video-composition.ts.
 */
import type { VideoOutline, VideoOutlineRole, VideoOutlineScene, VideoSceneId } from "./video-outline";

/** Minimal translate signature (react-i18next's `t` satisfies it). */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

export interface SceneCopy {
  /** Chip label, e.g. "Hook". */
  label: string;
  heading: string;
  body: string[];
  /** One-line caption under the slide. */
  caption: string;
  /** The on-frame kicker when it differs from the label (the Hook's
   *  "CONTRACT · FOR THE HIRING MANAGER" badge). */
  kicker?: string;
}

/** "Contract · For the hiring manager" from the video's targeting, or "". */
export function targetingBadge(outline: VideoOutline, t: Translate): string {
  const { goal, audience } = outline.targeting;
  return [goal ? t(`build.video.badge.goal.${goal}`) : "", audience ? t(`build.video.badge.audience.${audience}`) : ""]
    .filter(Boolean)
    .join(" · ");
}

/** "Available immediately" / "Available from Nov 3" from the start, or "". */
export function startLine(outline: VideoOutline, t: Translate): string {
  const { start, startDate } = outline.targeting;
  if (!start || start === "hidden") return "";
  if (start === "date") {
    if (!startDate) return "";
    const date = new Date(`${startDate}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
    return t("build.video.start.date", { date });
  }
  return t(`build.video.start.${start}`);
}

export const SCENE_LABEL_KEYS: Record<VideoSceneId, string> = {
  hook: "build.video.scene.hook",
  who: "build.video.scene.who",
  proof: "build.video.scene.proof",
  skills: "build.video.scene.skills",
  next: "build.video.scene.next",
};

/** On-screen copy of a scene. An unlinked scene (wording set in the video
 *  plan) shows exactly what the owner typed; a linked one is composed from
 *  the résumé here. */
export function sceneCopy(scene: VideoOutlineScene, outline: VideoOutline, t: Translate): SceneCopy {
  const label = t(SCENE_LABEL_KEYS[scene.id]);
  if (!scene.linked) {
    return { label, heading: scene.title, body: scene.lines, caption: "" };
  }
  const { name, role } = outline;
  switch (scene.id) {
    case "hook": {
      // The badge says who it's for; the theme's opening line sits under the
      // headline (a caption repeating the headline is never shown).
      const badge = targetingBadge(outline, t);
      return { label, heading: scene.title, body: [], caption: outline.theme?.line ?? "", ...(badge ? { kicker: badge } : {}) };
    }
    case "who":
      return {
        label,
        heading: scene.title,
        body: scene.lines,
        // Their own sentence, exactly as they wrote it, wins the caption.
        caption: outline.ownWords || (name && role ? t("build.video.caption.who", { name, role }) : scene.title),
      };
    case "proof":
      // No caption: the résumé page beside the proof fills the frame.
      return { label, heading: scene.title, body: scene.lines, caption: "" };
    case "skills":
      return {
        label,
        heading: t("build.video.skillsHeading"),
        body: scene.lines,
        caption: scene.lines.slice(0, 3).join(" · "),
      };
    case "next": {
      const line = role ? t("build.video.nextLine", { role }) : t("build.video.nextHeading");
      const when = startLine(outline, t);
      return { label, heading: t("build.video.nextHeading"), body: [role ? line : "", when].filter(Boolean), caption: when || line };
    }
  }
}

/** What a narrator says over each scene when the owner wrote nothing: the
 *  scene's heading, then its caption (else its lines), as sentences. */
export function spokenLines(outline: VideoOutline, t: Translate): Partial<Record<VideoSceneId, string>> {
  const out: Partial<Record<VideoSceneId, string>> = {};
  for (const scene of outline.scenes) {
    const copy = sceneCopy(scene, outline, t);
    const parts = [copy.heading, copy.caption || copy.body.join(". ")]
      .map((p) => p.replace(/\s+·\s+/g, ", ").trim())
      .filter((p, i, all) => p && all.indexOf(p) === i);
    if (parts.length) out[scene.id] = parts.map((p) => (/[.!?]$/.test(p) ? p : `${p}.`)).join(" ");
  }
  return out;
}

/** "Dana Okafor" → "DO"; one name → its first letter; empty → "". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** "2019–2023" / "2022–Present" — a role's years for the résumé page. */
export function rolePeriod(role: VideoOutlineRole, t: Translate): string {
  const end = role.endYear || t("build.video.present");
  if (!role.startYear) return role.endYear;
  return role.startYear === role.endYear ? role.startYear : `${role.startYear}–${end}`;
}

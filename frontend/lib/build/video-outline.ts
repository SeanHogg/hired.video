/**
 * Resume (+ the owner's video plan) → the 5-scene video outline for the kit workspace.
 *
 * Pure + deterministic (no LLM): the preview must appear the instant a resume
 * is parsed. Scenes carry DATA only (strings lifted from the resume); every
 * localized label/caption is composed in video-copy.ts through `t()`, so this
 * module stays testable and language-neutral.
 *
 *   hook   — the strongest quantified bullet (fallback: summary's first
 *            sentence, then the headline), cut to an on-screen headline
 *            (HOOK_MAX) — a full résumé bullet overflows the video title box
 *   who    — name, headline, location
 *   proof  — Work Experience: the chosen roles (default: the latest
 *            PROOF_ROLES_MAX); headline = the first one, its company and the
 *            top bullets, beside the résumé page listing those roles. It
 *            absorbed the former separate "Résumé" scene, which repeated the
 *            same jobs.
 *   skills — up to six skills
 *   next   — the role they want next (headline)
 *
 * The plan (shared/video-plan.ts, stored at `content.meta.video`) switches
 * scenes off, sets lengths and looks, picks the Proof roles, and can
 * "unlink" a scene's wording from the page. Everything it doesn't set follows
 * the résumé, so page edits flow into linked scenes.
 */
import type { ResumeContent } from "@shared/resume";
import { isQuantified, parseResumeMonth } from "@shared/resume-insights";
import {
  PROOF_ROLES_MAX,
  readVideoPlan,
  sceneOverrides,
  VIDEO_SCENE_IDS,
  workItemKey,
  type SceneOverrides,
  type VideoExport,
  type VideoLookId,
  type VideoPlan,
  type VideoSceneId,
} from "@shared/video-plan";
import type { VideoAspect, VideoTargeting } from "@shared/video-targeting";
import type { VideoThemeId } from "@shared/video-themes";
import { DEFAULT_SCENE_LOOKS, resolveScenePalette, type SceneLook } from "./scene-palette";

export { VIDEO_SCENE_IDS };
export type { VideoSceneId };

export interface VideoOutlineScene {
  id: VideoSceneId;
  /** Main on-screen line (resume data; may be empty). */
  title: string;
  /** Supporting lines (resume data). */
  lines: string[];
  /** Seconds — sums to the outline duration. */
  duration: number;
  look: VideoLookId;
  /** The colours the scene wears (its own look, else the theme). */
  palette: SceneLook;
  /** False when the plan overrides the wording (page edits no longer flow in). */
  linked: boolean;
  /** The owner's look overrides (background, filters, transition, font,
   *  motion, notes …) — video-composition applies them. */
  overrides: SceneOverrides;
}

/** One role on the résumé page beside the Proof scene. Years only — the page
 *  is read at a glance. */
export interface VideoOutlineRole {
  position: string;
  company: string;
  startYear: string;
  /** "" while the role is current (copy renders the localized "Present"). */
  endYear: string;
}

export interface VideoOutline {
  name: string;
  role: string;
  company: string;
  location: string;
  /** Résumé photo URL (basics.image); "" → the video shows initials. */
  photo: string;
  /** The Proof roles, in the order its résumé page lists them. */
  history: VideoOutlineRole[];
  /** Up to six skills (the Skills scene and the Proof page's chips). */
  skills: string[];
  /** Stock music track id; "none" = silent. */
  music: string;
  /** Scenes switched ON, in play order. */
  scenes: VideoOutlineScene[];
  /** The video's theme and the calendar event's opening line ("" for none). */
  theme: { id: VideoThemeId; line: string } | null;
  /** Who it is made for (audience · goal · start). */
  targeting: VideoTargeting;
  aspect: VideoAspect;
  /** The person's own sentence (Settings › Video personalization). */
  ownWords: string;
  /** Export settings (resolution · fps · codec); empty = the defaults. */
  export: VideoExport;
}

/** What the person's settings and the date add to every video. */
export interface OutlineDefaults {
  /** The default theme (Settings choice or the calendar's pick). */
  themeId?: VideoThemeId | null;
  /** The calendar event's opening line for that theme. */
  line?: string;
  ownWords?: string;
}

export const DEFAULT_SCENE_SECONDS: Record<VideoSceneId, number> = { hook: 5, who: 6, proof: 7, skills: 6, next: 4 };
export const DEFAULT_MUSIC = "corporate-inspire";

/** The résumé section each scene is built from (an editable section key). */
export const SCENE_SOURCE_SECTION: Record<VideoSceneId, string> = {
  hook: "work",
  who: "basics",
  proof: "work",
  skills: "skills",
  next: "basics",
};

type WorkItem = NonNullable<ResumeContent["work"]>[number];

/** A role the Proof scene can show. */
export interface ProofRoleOption {
  key: string;
  position: string;
  company: string;
}

function yearOf(date: string | undefined): string {
  return (date ?? "").match(/\d{4}/)?.[0] ?? "";
}

/** Work entries newest first (by start date; undated keep authored order),
 *  each with its stable key. */
function workNewestFirst(content: ResumeContent): Array<{ key: string; item: WorkItem }> {
  return (content.work ?? [])
    .map((item, i) => ({ item, i, key: workItemKey(item, i), start: parseResumeMonth(item.startDate) }))
    .filter((x) => (x.item.position ?? "").trim() || (x.item.name ?? "").trim())
    .sort((a, b) =>
      a.start !== null && b.start !== null && a.start !== b.start ? b.start - a.start : a.i - b.i,
    )
    .map(({ key, item }) => ({ key, item }));
}

/** Every role the Proof scene can show, newest first. */
export function proofRoleOptions(content: ResumeContent): ProofRoleOption[] {
  return workNewestFirst(content).map(({ key, item }) => ({
    key,
    position: (item.position ?? "").trim(),
    company: (item.name ?? "").trim(),
  }));
}

/** The Proof roles in effect: the plan's picks that still exist, else the
 *  latest PROOF_ROLES_MAX. */
export function selectedProofRoleKeys(content: ResumeContent, plan: VideoPlan): string[] {
  const all = proofRoleOptions(content).map((r) => r.key);
  const picked = (plan.scenes?.proof?.roles ?? []).filter((k) => all.includes(k));
  return picked.length > 0 ? picked : all.slice(0, PROOF_ROLES_MAX);
}

/** Score a bullet: quantified first, then more numbers, then length (capped)
 *  so a punchy metric wins over a long vague sentence. */
function bulletScore(text: string): number {
  const numbers = (text.match(/\d/g) ?? []).length;
  return (isQuantified(text) ? 100 : 0) + Math.min(numbers, 10) * 2 + Math.min(text.length, 120) / 60;
}

/** Longest hook that still fits the title box at the studio's title size. */
export const HOOK_MAX = 90;

/**
 * A résumé bullet → an on-screen headline: the first clause when it fits
 * (bullets often run "result; how; context"), else a word-boundary cut with
 * an ellipsis. Shared by the kit preview and the studio because both play
 * the same canvas — fixing length here fixes it everywhere.
 */
export function toHeadline(text: string, max = HOOK_MAX): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const clause = dropOpenParen(clean.split(/\s*(?:;|\s[—–-]\s|:\s)/)[0] ?? "");
  if (clause.length >= 20 && clause.length <= max) return clause.replace(/[,.]$/, "");
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const words = dropOpenParen(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut);
  return `${words.replace(/[,;:.\s]+$/, "")}…`;
}

/** "Grew team 60→75 (offshore & MSP" → "Grew team 60→75": a cut that lands
 *  inside a parenthetical must not leave it dangling open on screen. */
function dropOpenParen(text: string): string {
  const trimmed = text.trim();
  const open = trimmed.lastIndexOf("(");
  return open > trimmed.lastIndexOf(")") ? trimmed.slice(0, open).trim() : trimmed;
}

function firstSentence(text: string): string {
  const s = text.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  return s.length > 160 ? `${s.slice(0, 157).trimEnd()}…` : s;
}

export function buildVideoOutline(
  content: ResumeContent,
  plan: VideoPlan = readVideoPlan(content),
  defaults: OutlineDefaults = {},
): VideoOutline {
  const themeId = plan.themeId ?? defaults.themeId ?? null;
  // The opening line belongs to the calendar event, so it rides only on the
  // default theme (a theme the person picked by hand has no event line).
  const line = themeId && themeId === defaults.themeId && !plan.themeId ? (defaults.line ?? "") : "";
  const basics = content.basics;
  const work = workNewestFirst(content);
  const latest = work[0]?.item;

  const name = (basics?.name ?? "").trim();
  const role = ((latest?.position ?? "").trim() || (basics?.label ?? "").trim());
  const company = (latest?.name ?? "").trim();
  const loc = basics?.location;
  const location = [loc?.city, loc?.region].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");

  const bullets = work.flatMap(({ item }) => (item.highlights ?? []).map((h) => h.trim())).filter(Boolean);
  const strongest = [...bullets].sort((a, b) => bulletScore(b) - bulletScore(a))[0];
  const hook = strongest ?? firstSentence(basics?.summary ?? "");

  const proofRoles = selectedProofRoleKeys(content, plan)
    .map((key) => work.find((w) => w.key === key)?.item)
    .filter((w): w is WorkItem => Boolean(w));
  const lead = proofRoles[0];
  const proofBullets = proofRoles
    .flatMap((w) => (w.highlights ?? []).map((h) => h.trim()))
    .filter(Boolean)
    .sort((a, b) => bulletScore(b) - bulletScore(a))
    .slice(0, 2);

  const skillNames = (content.skills ?? []).map((s) => (s.name ?? "").trim()).filter(Boolean);
  const keywords = (content.skills ?? []).flatMap((s) => s.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  const skills = Array.from(new Set([...skillNames, ...keywords])).slice(0, 6);

  const derived: Record<VideoSceneId, { title: string; lines: string[] }> = {
    hook: { title: hook ? toHeadline(hook) : role, lines: [] },
    who: { title: name || role, lines: [name ? role : "", location].filter(Boolean) },
    proof: {
      title: (lead?.position ?? "").trim() || role,
      lines: [(lead?.name ?? "").trim(), ...proofBullets].filter(Boolean),
    },
    skills: { title: "", lines: skills },
    next: { title: name, lines: role ? [role] : [] },
  };

  const all = VIDEO_SCENE_IDS.map((id) => {
    const p = plan.scenes?.[id] ?? {};
    const scene: VideoOutlineScene = {
      id,
      title: p.title ?? derived[id].title,
      lines: p.lines ?? derived[id].lines,
      duration: p.duration ?? DEFAULT_SCENE_SECONDS[id],
      look: p.look ?? DEFAULT_SCENE_LOOKS[id],
      palette: resolveScenePalette(plan, id, themeId),
      linked: p.title === undefined && p.lines === undefined,
      overrides: sceneOverrides(p),
    };
    return { scene, off: p.off === true };
  });
  // The video always keeps at least one scene.
  const on = all.some((s) => !s.off) ? all.filter((s) => !s.off) : all;

  const history: VideoOutlineRole[] = proofRoles.map((w) => ({
    position: (w.position ?? "").trim(),
    company: (w.name ?? "").trim(),
    startYear: yearOf(w.startDate),
    endYear: yearOf(w.endDate),
  }));
  const photo = (basics?.image ?? "").trim();

  return {
    name,
    role,
    company,
    location,
    photo,
    history,
    skills,
    music: plan.music ?? DEFAULT_MUSIC,
    scenes: on.map((s) => s.scene),
    theme: themeId ? { id: themeId, line } : null,
    targeting: plan.targeting ?? {},
    aspect: plan.aspect ?? "16:9",
    ownWords: (defaults.ownWords ?? "").trim(),
    export: plan.export ?? {},
  };
}

export function outlineDuration(outline: VideoOutline): number {
  return outline.scenes.reduce((sum, s) => sum + s.duration, 0);
}

/** Start offset (seconds) of every scene, in outline order. */
export function sceneStarts(outline: VideoOutline): number[] {
  let cursor = 0;
  return outline.scenes.map((s) => {
    const start = cursor;
    cursor += s.duration;
    return start;
  });
}

/** Seconds → "m:ss" for the preview's timecodes ("0:08", "1:00"). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Scene text → résumé: editing a video scene's words edits the PAGE.
 *
 * The kit video is derived from the résumé (video-outline.ts), so a linked
 * scene's text has a source on the page. `writeSceneText` sends an edit back
 * to that source — the bullet the hook was cut from, the name, the lead
 * Proof role, a skill — and the scene follows because it is re-derived. Only
 * where there is no clean source (the location line, the localized "next"
 * copy, the Skills heading, a line the scene doesn't have yet) does the edit
 * fall back to an "unlinked" override in the video plan, which is also how an
 * already-unlinked scene keeps being edited.
 *
 * Pure and `t`-free: it works on the outline's DATA (scene title/lines), not
 * the localized copy. Callers that show localized-only copy (Next, the Skills
 * heading) freeze that copy into the plan first if they want to keep it.
 *
 * `sceneTextFieldOfWidget` maps a canvas text widget (ids from
 * video-composition.ts) to the same field, so click-to-edit on the video
 * shares this one write path with the scene inspector.
 */
import { BasicsSchema, type ResumeContent } from "@shared/resume";
import {
  patchScenePlan,
  readVideoPlan,
  SCENE_LINES_MAX,
  VIDEO_SCENE_IDS,
  withVideoPlan,
  workItemKey,
  type VideoSceneId,
} from "@shared/video-plan";
import {
  buildVideoOutline,
  proofRoleOptions,
  selectedProofRoleKeys,
  toHeadline,
  type VideoOutline,
  type VideoOutlineScene,
} from "./video-outline";

export type SceneTextField = { kind: "heading" } | { kind: "line"; index: number };

/** Longest override the video plan accepts (ScenePlanSchema) — a longer one
 *  would fail validation and drop the whole plan. */
const OVERRIDE_TEXT_MAX = 160;

const WIDGET_ID = new RegExp(`^build-(${VIDEO_SCENE_IDS.join("|")})-(?:(heading)|body-(\\d+)|skill-(\\d+))$`);

/** "build-proof-body-1" → { proof, line 1 }; "build-skills-skill-4" → { skills,
 *  line 4 }. Decor, kicker, caption, avatar and the Proof résumé page are not
 *  scene text → null. */
export function sceneTextFieldOfWidget(widgetId: string): { sceneId: VideoSceneId; field: SceneTextField } | null {
  const m = WIDGET_ID.exec(widgetId);
  if (!m) return null;
  const sceneId = VIDEO_SCENE_IDS.find((id) => id === m[1]);
  if (!sceneId) return null;
  if (m[2]) return { sceneId, field: { kind: "heading" } };
  // Skills lays its lines out as pills; every other scene as body lines.
  const index = sceneId === "skills" ? m[4] : m[3];
  return index === undefined ? null : { sceneId, field: { kind: "line", index: Number(index) } };
}

/** What the scene shows on screen (its localized `SceneCopy`), for freezing. */
export interface ShownSceneCopy {
  heading: string;
  body: string[];
}

/**
 * Typing `text` into a field of the scene AS SHOWN — the ONE write used by
 * the scene inspector and the on-frame editor. Next and the Skills heading
 * (and a new Skills line) show localized copy, not résumé text: typing there
 * unlinks the scene, so the copy on screen is frozen into the plan first and
 * the other fields keep reading the way they did. Then `writeSceneText`.
 */
export function writeShownSceneText(
  content: ResumeContent,
  sceneId: VideoSceneId,
  field: SceneTextField,
  text: string,
  shown: ShownSceneCopy,
): ResumeContent {
  const plan = readVideoPlan(content);
  const scene = buildVideoOutline(content, patchScenePlan(plan, sceneId, { off: undefined })).scenes.find(
    (s) => s.id === sceneId,
  );
  const showsLocalizedCopy =
    scene !== undefined &&
    scene.linked &&
    (sceneId === "next" || (sceneId === "skills" && (field.kind === "heading" || field.index >= scene.lines.length)));
  const base = showsLocalizedCopy
    ? withVideoPlan(content, patchScenePlan(plan, sceneId, { title: shown.heading, lines: shown.body.slice(0, SCENE_LINES_MAX) }))
    : content;
  return writeSceneText(base, sceneId, field, text);
}

type WorkItem = ResumeContent["work"][number];
type Skill = ResumeContent["skills"][number];

/** The résumé with one edit applied, or null when the field has no source. */
type SourceWrite = ResumeContent | null;

/** `source` with its on-screen `headline` replaced by `text`, keeping the rest
 *  of the source (toHeadline always cuts a prefix of the whitespace-collapsed
 *  source, maybe ending "…"). Null when `headline` isn't its prefix. */
function replaceHeadlinePrefix(source: string, headline: string, text: string): string | null {
  const cut = headline.endsWith("…");
  const prefix = cut ? headline.slice(0, -1) : headline;
  const typed = cut ? text.replace(/…$/, "") : text;
  const raw = source.trim();
  if (raw.startsWith(prefix)) return typed + raw.slice(prefix.length);
  const clean = raw.replace(/\s+/g, " ");
  return clean.startsWith(prefix) ? typed + clean.slice(prefix.length) : null;
}

function withBasics(content: ResumeContent, patch: Partial<NonNullable<ResumeContent["basics"]>>): ResumeContent {
  return { ...content, basics: { ...(content.basics ?? BasicsSchema.parse({})), ...patch } };
}

function withWork(content: ResumeContent, index: number, patch: Partial<WorkItem>): ResumeContent {
  return { ...content, work: (content.work ?? []).map((w, i) => (i === index ? { ...w, ...patch } : w)) };
}

function workIndexOfKey(content: ResumeContent, key: string | undefined): number {
  return key === undefined ? -1 : (content.work ?? []).findIndex((w, i) => workItemKey(w, i) === key);
}

/** Replace the first highlight (among `indices`' work items) `edit` accepts. */
function editHighlight(
  content: ResumeContent,
  indices: number[],
  edit: (highlight: string) => string | null,
): SourceWrite {
  for (const wi of indices) {
    const current = content.work?.[wi]?.highlights ?? [];
    const hi = current.findIndex((h) => edit(h) !== null);
    if (hi >= 0) {
      const highlights = current.map((h, i) => (i === hi ? (edit(h) ?? h) : h));
      return withWork(content, wi, { highlights });
    }
  }
  return null;
}

/** Hook: the strongest bullet it was cut from, else the summary's first
 *  sentence; the role fallback has no source of its own. */
function writeHook(content: ResumeContent, scene: VideoOutlineScene, text: string): SourceWrite {
  const roles = (content.work ?? [])
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => (w.position ?? "").trim() || (w.name ?? "").trim());
  const hasBullets = roles.some(({ w }) => (w.highlights ?? []).some((h) => h.trim()));
  if (hasBullets) {
    return editHighlight(
      content,
      roles.map(({ i }) => i),
      (h) => (h.trim() && toHeadline(h) === scene.title ? replaceHeadlinePrefix(h, scene.title, text) : null),
    );
  }
  const summary = content.basics?.summary ?? "";
  if (!summary.trim() || !scene.title) return null;
  const next = replaceHeadlinePrefix(summary, scene.title, text);
  return next === null ? null : withBasics(content, { summary: next });
}

/** Who: heading = name; line 0 = the headline role (latest position, else
 *  basics.label) when there is a name to sit under. */
function writeWho(content: ResumeContent, outline: VideoOutline, field: SceneTextField, text: string): SourceWrite {
  if (field.kind === "heading") return withBasics(content, { name: text });
  if (field.index !== 0 || !outline.name || !outline.role) return null;
  const latest = proofRoleOptions(content)[0];
  const index = latest?.position ? workIndexOfKey(content, latest.key) : -1;
  return index >= 0 ? withWork(content, index, { position: text }) : withBasics(content, { label: text });
}

/** Proof: heading = the lead role's position, line 0 = its company, bullet
 *  lines = the matching highlight among the chosen roles. */
function writeProof(content: ResumeContent, scene: VideoOutlineScene, field: SceneTextField, text: string): SourceWrite {
  const indices = selectedProofRoleKeys(content, readVideoPlan(content))
    .map((key) => workIndexOfKey(content, key))
    .filter((i) => i >= 0);
  const lead = indices[0];
  if (lead === undefined) return null;
  if (field.kind === "heading") return withWork(content, lead, { position: text });
  const line = scene.lines[field.index];
  if (line === undefined) return null;
  if (field.index === 0 && (content.work?.[lead]?.name ?? "").trim() === line) return withWork(content, lead, { name: text });
  return editHighlight(content, indices, (h) => (h.trim() === line ? text : null));
}

/** Skills: line i = a skill name or keyword — every exact occurrence is
 *  renamed, so the de-duplicated list keeps one entry for it. */
function writeSkill(content: ResumeContent, scene: VideoOutlineScene, field: SceneTextField, text: string): SourceWrite {
  if (field.kind !== "line") return null;
  const line = scene.lines[field.index];
  if (line === undefined) return null;
  const rename = (s: string) => (s.trim() === line ? text : s);
  const hit = (s: Skill) => (s.name ?? "").trim() === line || (s.keywords ?? []).some((k) => k.trim() === line);
  const skills = content.skills ?? [];
  if (!skills.some(hit)) return null;
  return {
    ...content,
    skills: skills.map((s) => (hit(s) ? { ...s, name: rename(s.name ?? ""), keywords: (s.keywords ?? []).map(rename) } : s)),
  };
}

/** The scene's wording kept in the video plan (video only): `text` in the
 *  edited field, the scene's current wording in the other. */
function writeOverride(content: ResumeContent, scene: VideoOutlineScene, field: SceneTextField, text: string): ResumeContent {
  const value = text.slice(0, OVERRIDE_TEXT_MAX);
  const lines = scene.lines.slice(0, SCENE_LINES_MAX);
  if (field.kind === "line") {
    while (lines.length <= field.index) lines.push("");
    lines[field.index] = value;
  }
  const title = field.kind === "heading" ? value : scene.title;
  return withVideoPlan(content, patchScenePlan(readVideoPlan(content), scene.id, { title, lines }));
}

/**
 * The résumé after typing `text` into one field of a scene: written to the
 * résumé field the scene shows when the scene follows the résumé and the
 * field has a source; otherwise kept as the scene's own (unlinked) wording.
 */
export function writeSceneText(
  content: ResumeContent,
  sceneId: VideoSceneId,
  field: SceneTextField,
  text: string,
): ResumeContent {
  const plan = readVideoPlan(content);
  // Built with the scene on, so a switched-off scene can still be edited.
  const outline = buildVideoOutline(content, patchScenePlan(plan, sceneId, { off: undefined }));
  const scene = outline.scenes.find((s) => s.id === sceneId);
  if (!scene) return content;
  if (scene.linked) {
    const written = linkedWrite(content, outline, scene, field, text);
    if (written) return written;
  }
  // The plan holds at most SCENE_LINES_MAX lines; a later one has nowhere to go.
  if (field.kind === "line" && field.index >= SCENE_LINES_MAX) return content;
  return writeOverride(content, scene, field, text);
}

function linkedWrite(
  content: ResumeContent,
  outline: VideoOutline,
  scene: VideoOutlineScene,
  field: SceneTextField,
  text: string,
): SourceWrite {
  switch (scene.id) {
    case "hook":
      return field.kind === "heading" ? writeHook(content, scene, text) : null;
    case "who":
      return writeWho(content, outline, field, text);
    case "proof":
      return writeProof(content, scene, field, text);
    case "skills":
      return writeSkill(content, scene, field, text);
    case "next":
      // Localized copy ("I'm looking for …"), not résumé text.
      return null;
  }
}

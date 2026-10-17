/**
 * Social captions — the ONE module for every caption writer:
 *
 *  - `generateSocialCaption(source, target, aiCaller)` — the posting agent
 *    (#2300, Worker/cron). Never throws: when `aiCaller` is null (out of
 *    tokens, or the planner has no LLM budget) or the model answer is
 *    unusable, it falls back to a template: resume headline / first
 *    transcript line + a watch link + the five preset hashtags.
 *  - `generateProjectSocialCaption(project, target, callAI)` — the studio
 *    Post dock's "Write it for me" (#203, #2045): a hook, caption and
 *    hashtags written from what the project's video SAYS, fitted to the
 *    tightest text limit of the picked networks. Throws when a model
 *    answered but not with a usable post.
 */
import { z } from "zod";
import type { VideoPublishPlatform } from "./social-platforms.js";
import { SOCIAL_PLATFORM_META, sharedPostTextLimit } from "./social-platforms.js";
import { flattenTimelineTranscript } from "./timeline-transcript.js";
import { extractJson } from "./extract-json.js";

/** Tones the studio Post dock offers. */
export const CAPTION_TONES = ["professional", "casual", "bold", "story"] as const;
export type CaptionTone = (typeof CAPTION_TONES)[number];

export interface CaptionSource {
  transcript: string;
  resumeText: string;
}

export interface CaptionTarget {
  platforms: readonly VideoPublishPlatform[];
  tone: CaptionTone | "exciting";
  maxLength?: number;
}

export interface SocialCaption {
  hook: string;
  caption: string;
  hashtags: string[];
}

/** Single-prompt model port (posting agent). */
export type AiTextCaller = (prompt: string) => Promise<string>;
/** System + user model port (studio Post dock) — matches the api's
 *  `services/adapters/ai-text-caller` AiTextCaller. */
export type ChatTextCaller = (systemPrompt: string, userMessage: string) => Promise<string>;

const PRESET_HASHTAGS = ["hiring", "career", "videoresume", "jobsearch", "openforwork"] as const;

function firstLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  );
}

/** Template caption used when the LLM is unavailable or out of tokens. */
export function buildTemplateCaption(source: CaptionSource, link?: string): SocialCaption {
  const hook = (
    firstLine(source.resumeText) ||
    firstLine(source.transcript) ||
    "New video on hired.video"
  ).slice(0, 200);
  return {
    hook,
    caption: link ? `Watch: ${link}` : "Watch the full story on hired.video.",
    hashtags: [...PRESET_HASHTAGS],
  };
}

function budgetFor(target: CaptionTarget): number {
  const platforms = target.platforms.length > 0 ? target.platforms : (["linkedin"] as const);
  const platformBudget = sharedPostTextLimit(platforms);
  return target.maxLength != null ? Math.min(target.maxLength, platformBudget) : platformBudget;
}

export async function generateSocialCaption(
  source: CaptionSource,
  target: CaptionTarget,
  aiCaller: AiTextCaller | null,
): Promise<SocialCaption> {
  const budget = budgetFor(target);
  const platforms = target.platforms.length > 0 ? target.platforms : (["linkedin"] as const);

  if (aiCaller) {
    try {
      const prompt = [
        `Write a ${target.tone} social caption for ${platforms.join(", ")}.`,
        `Max ${budget} characters including hashtags.`,
        'Return JSON: {"hook":"...","caption":"...","hashtags":["a","b"]}',
        "Use only facts from this source — never invent an employer.",
        `Transcript:\n${source.transcript.slice(0, 2000)}`,
        `Resume:\n${source.resumeText.slice(0, 1000)}`,
      ].join("\n\n");
      const raw = await aiCaller(prompt);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<SocialCaption>;
        if (parsed.hook && parsed.caption) {
          return {
            hook: String(parsed.hook).slice(0, 200),
            caption: String(parsed.caption).slice(0, budget),
            hashtags: Array.isArray(parsed.hashtags)
              ? parsed.hashtags.map(String).slice(0, 8)
              : [...PRESET_HASHTAGS],
          };
        }
      }
    } catch {
      // fall through to template
    }
  }

  return buildTemplateCaption(source);
}

// ─── Studio Post dock (project → caption) ──────────────────────────────────

/** The project fields a studio caption reads. */
export interface ProjectCaptionSource {
  kind: string;
  storyboard: unknown;
  timelineSpec: unknown;
  resumeText: string;
}

/** Below this budget the post is short-form (X): hook + a tag or two. */
const SHORT_FORM_BUDGET = 600;

const SocialPostSchema = z.object({
  hook: z.string().min(1).max(280),
  caption: z.string().max(2000).default(""),
  // Models often write "#Hiring" or "video-resume" despite the prompt — keep
  // the word, drop what the networks can't tag, rather than failing the post.
  hashtags: z
    .array(z.string().transform((tag) => tag.replace(/[^A-Za-z0-9_]/g, "")))
    .transform((tags) => tags.filter(Boolean).slice(0, 10))
    .pipe(z.array(z.string()).min(1)),
});

/**
 * Collapses the legacy storyboard JSON into one line per scene so the model
 * has the narrative without the structural noise.
 */
export function flattenStoryboardTranscript(storyboard: unknown): string {
  const raw = (storyboard as { scenes?: unknown } | null | undefined)?.scenes;
  const scenes = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  return scenes
    .map((s) => [s.title, s.subtitle, s.text].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join("\n");
}

/** What the project's video says, whichever editor surface stored it. */
export function projectTranscript(
  project: Pick<ProjectCaptionSource, "kind" | "storyboard" | "timelineSpec">,
): string {
  // An "nle" row with no timeline yet (a script saved from the Chrome
  // extension, before Studio stamps the timeline after the render upload)
  // still has its words in the storyboard.
  const fromTimeline = project.kind === "nle" ? flattenTimelineTranscript(project.timelineSpec) : "";
  return fromTimeline || flattenStoryboardTranscript(project.storyboard);
}

/** The no-model studio post: first transcript line (or résumé) as the hook. */
export function buildHeuristicCaption(transcript: string, resumeText: string): SocialCaption {
  // Truthiness check — `?? resumeText` would not fire for an empty
  // first-line string, leaving us with an empty hook. Cascade to resume,
  // then to the generic fallback.
  const fromTranscript = transcript.split("\n")[0]?.trim() ?? "";
  const fromResume = resumeText.trim();
  const hook =
    (fromTranscript || fromResume).slice(0, 200) ||
    "Just published a new video resume on hired.video.";
  return {
    hook,
    caption: "Watch the full story below — feedback always welcome.",
    hashtags: [...PRESET_HASHTAGS],
  };
}

/** The post as the dock lays it out: hook, caption, then #tags. */
export function composedLength(post: SocialCaption): number {
  const tags = post.hashtags.map((h) => `#${h}`).join(" ");
  return [post.hook, post.caption, tags].filter(Boolean).join("\n\n").length;
}

/**
 * Fit a post into `budget` characters, cutting the least important part
 * first: the caption body, then hashtags down to one, then the hook itself.
 */
export function fitCaptionToBudget(post: SocialCaption, budget: number): SocialCaption {
  let out = { ...post, hashtags: [...post.hashtags] };
  if (composedLength(out) <= budget) return out;
  out = { ...out, caption: "" };
  while (out.hashtags.length > 1 && composedLength(out) > budget) out.hashtags.pop();
  if (composedLength(out) > budget) {
    const tagsLen = out.hashtags.length ? out.hashtags.map((h) => `#${h}`).join(" ").length + 2 : 0;
    out = { ...out, hook: out.hook.slice(0, Math.max(0, budget - tagsLen)).trimEnd() };
  }
  return out;
}

function projectSystemPrompt(platforms: readonly VideoPublishPlatform[], budget: number): string {
  const networks = platforms.map((p) => SOCIAL_PLATFORM_META[p].label).join(", ");
  const shape =
    budget < SHORT_FORM_BUDGET
      ? `The whole post — hook, caption and hashtags — must fit in ${budget} characters: write one punchy hook, leave the caption empty or one short line, and pick 1-2 hashtags.`
      : `Keep the hook under 280 characters and front-load the most arresting line. The caption is 2-4 short paragraphs separated by blank lines. Pick 5-7 hashtags. The whole post must stay under ${budget} characters.`;
  return `You write social posts that promote a video, for: ${networks}. Output strictly the JSON shape requested. ${shape} Hashtags are bare words (no # prefix) that match the topic and the requested tone. Never invent facts not present in the transcript.`;
}

/**
 * Write the studio caption. `callAI` is null when no model is available at
 * all — then (or when the video has no words to write from) the heuristic
 * post. Either way the result fits the target networks' shared text budget.
 * Throws when a model answered but not with a usable post.
 */
export async function generateProjectSocialCaption(
  project: ProjectCaptionSource,
  target: CaptionTarget,
  callAI: ChatTextCaller | null,
): Promise<SocialCaption> {
  const platforms = target.platforms.length > 0 ? target.platforms : (["linkedin"] as const);
  const budget = budgetFor(target);
  const transcript = projectTranscript(project);
  const resumeText = project.resumeText ?? "";
  if (!callAI || (!transcript && !resumeText.trim())) {
    return fitCaptionToBudget(buildHeuristicCaption(transcript, resumeText), budget);
  }

  const userMessage = `Tone: ${target.tone}\n\nVideo transcript (one line per scene):\n${transcript || resumeText.slice(0, 2000)}\n\nReturn JSON: { "hook": string, "caption": string, "hashtags": string[] }`;
  const raw = await callAI(projectSystemPrompt(platforms, budget), userMessage);
  const post = SocialPostSchema.parse(extractJson(raw));
  return fitCaptionToBudget({ hook: post.hook, caption: post.caption, hashtags: post.hashtags ?? [] }, budget);
}

export { sharedPostTextLimit };

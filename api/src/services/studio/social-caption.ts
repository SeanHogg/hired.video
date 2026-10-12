/**
 * Social caption use case — the Post dock's "Write it for me" (#203, #2045):
 * a hook, caption and hashtags written from what the project's video SAYS,
 * sized for the networks the post goes to. The dock writes ONE caption for
 * every picked channel, so the text budget is the tightest of their limits
 * (`sharedPostTextLimit` — X's 280 when X is picked, LinkedIn's 3,000 alone).
 *
 * Pure: the model call is an injected `AiTextCaller` (gateway first, Workers
 * AI fallback), so a dead gateway key degrades instead of failing, and tests
 * fake it with a function.
 */
import { z } from "zod";
import { flattenTimelineTranscript } from "../../../../shared/timeline-transcript.js";
import {
  SOCIAL_PLATFORM_META,
  sharedPostTextLimit,
  type VideoPublishPlatform,
} from "../../../../shared/social-platforms.js";
import type { AiTextCaller } from "../adapters/ai-text-caller.js";
import { extractJson } from "../resume/parse.js";

export const CAPTION_TONES = ["professional", "casual", "bold", "story"] as const;
export type CaptionTone = (typeof CAPTION_TONES)[number];

export interface SocialCaption {
  hook: string;
  caption: string;
  hashtags: string[];
}

/** The project fields a caption reads. */
export interface CaptionSource {
  kind: string;
  storyboard: unknown;
  timelineSpec: unknown;
  resumeText: string;
}

export interface CaptionTarget {
  tone: CaptionTone;
  /** Where the post goes; the caption fits the tightest of their limits. */
  platforms: readonly VideoPublishPlatform[];
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
export function projectTranscript(project: Pick<CaptionSource, "kind" | "storyboard" | "timelineSpec">): string {
  return project.kind === "nle"
    ? flattenTimelineTranscript(project.timelineSpec)
    : flattenStoryboardTranscript(project.storyboard);
}

/** The no-model post: first transcript line (or résumé) as the hook. */
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
    hashtags: ["hiring", "career", "videoresume", "jobsearch", "openforwork"],
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

function systemPrompt(target: CaptionTarget, budget: number): string {
  const networks = target.platforms.map((p) => SOCIAL_PLATFORM_META[p].label).join(", ");
  const shape =
    budget < SHORT_FORM_BUDGET
      ? `The whole post — hook, caption and hashtags — must fit in ${budget} characters: write one punchy hook, leave the caption empty or one short line, and pick 1-2 hashtags.`
      : `Keep the hook under 280 characters and front-load the most arresting line. The caption is 2-4 short paragraphs separated by blank lines. Pick 5-7 hashtags. The whole post must stay under ${budget} characters.`;
  return `You write social posts that promote a video, for: ${networks}. Output strictly the JSON shape requested. ${shape} Hashtags are bare words (no # prefix) that match the topic and the requested tone. Never invent facts not present in the transcript.`;
}

/**
 * Write the caption. `callAI` is null when no model is available at all —
 * then (or when the video has no words to write from) the heuristic post.
 * Either way the result fits the target networks' shared text budget.
 * Throws when a model answered but not with a usable post.
 */
export async function generateSocialCaption(
  project: CaptionSource,
  target: CaptionTarget,
  callAI: AiTextCaller | null,
): Promise<SocialCaption> {
  const platforms = target.platforms.length > 0 ? target.platforms : (["linkedin"] as const);
  const budget = sharedPostTextLimit(platforms);
  const transcript = projectTranscript(project);
  const resumeText = project.resumeText ?? "";
  if (!callAI || (!transcript && !resumeText.trim())) {
    return fitCaptionToBudget(buildHeuristicCaption(transcript, resumeText), budget);
  }

  const userMessage = `Tone: ${target.tone}\n\nVideo transcript (one line per scene):\n${transcript || resumeText.slice(0, 2000)}\n\nReturn JSON: { "hook": string, "caption": string, "hashtags": string[] }`;
  const raw = await callAI(systemPrompt({ ...target, platforms }, budget), userMessage);
  const post = SocialPostSchema.parse(extractJson(raw));
  return fitCaptionToBudget({ hook: post.hook, caption: post.caption, hashtags: post.hashtags ?? [] }, budget);
}

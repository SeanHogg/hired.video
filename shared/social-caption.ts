/**
 * LLM + heuristic social captions for the posting agent (#2300).
 *
 * `generateSocialCaption(source, target, aiCaller)` — the studio's
 * `services/studio/social-caption.ts` is the in-browser caller; this
 * module is the Worker/cron copy so the planner doesn't pull React.
 *
 * When `aiCaller` is null (out of tokens, or the planner has no LLM
 * budget) we fall back to a template: resume headline / first transcript
 * line + a watch link + the five preset hashtags.
 */
import type { VideoPublishPlatform } from "./social-platforms.js";
import { sharedPostTextLimit } from "./social-platforms.js";

export interface CaptionSource {
  transcript: string;
  resumeText: string;
}

export interface CaptionTarget {
  platforms: readonly VideoPublishPlatform[];
  tone: "professional" | "casual" | "exciting" | "bold" | "story";
  maxLength?: number;
}

export interface SocialCaption {
  hook: string;
  caption: string;
  hashtags: string[];
}

export type AiTextCaller = (prompt: string) => Promise<string>;

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

export { sharedPostTextLimit };

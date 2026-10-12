/**
 * One-bullet rewrites through a single editorial lens (#375): the
 * "add a metric" and "strengthen the verb" wands. Same shape as the
 * shorten wand — the caller routes `{ original, improved }` through the
 * apply_resume_rewrite matcher, so there is one persistence path.
 *
 * Honest by construction: the metric lens never invents a number. Where the
 * bullet has none it writes a bracketed placeholder ("[N]%", "[$X]") the
 * person fills in before applying.
 */
import type { LLMClient, LLMCallOpts } from "../adapters/llm-client.js";
import {
  RewriteBulletResponseSchema,
  type BulletRewriteMode,
  type RewriteBulletResponse,
} from "../../../../shared/tool-schemas.js";

const COMMON_RULES = `RULES (strict):
- Keep every proper noun, product name, acronym, number, currency and date from the input verbatim.
- Do NOT invent employers, tools, team sizes, outcomes or numbers.
- One bullet, past tense, ≤ 240 characters. Plain text. No leading "-" or "•". No markdown.

Return ONLY a JSON object, no prose, no markdown fence: { "improved": "<the rewritten bullet>" }`;

export const BULLET_REWRITE_PROMPTS: Readonly<Record<BulletRewriteMode, string>> = {
  metric: `You are an expert resume editor. Rewrite the ONE resume bullet the user gives you so it leads with a measurable outcome (how much, how many, how fast, how big).

If the bullet already states a number, put it to work in the outcome. If it states none, write the outcome with a bracketed placeholder the candidate will fill in — "[N]%", "[$X]", "[N] users", "[N] hours/week" — never a made-up figure.

${COMMON_RULES}`,
  verbs: `You are an expert resume editor. Rewrite the ONE resume bullet the user gives you so it opens with a strong, specific past-tense action verb (Built, Led, Cut, Launched, Negotiated, Automated, Scaled…) instead of a weak opening ("Responsible for", "Helped", "Worked on", "Assisted with", "Involved in", "Duties included").

Keep the meaning and scope exactly — a stronger verb, not a bigger claim. "Helped launch" stays a contribution ("Co-led", "Supported the launch of"), never "Led".

${COMMON_RULES}`,
};

export async function rewriteBullet(
  llm: LLMClient,
  original: string,
  mode: BulletRewriteMode,
  opts?: LLMCallOpts,
): Promise<RewriteBulletResponse> {
  const { data } = await llm.callJson(
    `resume_rewrite_bullet_${mode}`,
    {
      useCase: "resume_consolidate_highlights",
      systemPrompt: BULLET_REWRITE_PROMPTS[mode],
      userMessage: `Bullet: ${original}\n\nReturn the rewritten bullet as JSON.`,
    },
    RewriteBulletResponseSchema,
    opts,
  );
  return data;
}

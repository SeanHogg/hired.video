/**
 * AI pre-screen for the promotion queue (#2046, PRD §5.3 step 2). Runs on
 * submit, before a SuperAdmin sees the item, because the content would post
 * under hired.video's brand.
 *
 *   block       → auto-rejected with the classifier's reason
 *   flag        → queued, highlighted for the reviewer
 *   pass        → queued
 *   unscreened  → queued (classifier unavailable). Fails OPEN to human
 *                 review, never to auto-publish: every item is still approved
 *                 by a person.
 */
import { z } from "zod";
import type { LLMClient } from "../adapters/llm-client.js";
import { logger } from "../../lib/logger.js";

export type ScreeningVerdict = "pass" | "flag" | "block" | "unscreened";

const ScreeningSchema = z.object({
  verdict: z.enum(["pass", "flag", "block"]),
  reason: z.string().max(400),
});

const SYSTEM_PROMPT = `You screen short videos that creators ask a professional job-search platform
to repost on its own brand social channels. You see the title, the post text and the video's script.

Return JSON {"verdict": "pass" | "flag" | "block", "reason": "<one sentence>"}:
  - block — hate, harassment of a named person, sexual content, violence, illegal services,
            spam/scams, or anything that would embarrass a professional brand if reposted
  - flag  — borderline: profanity, heavy self-promotion, off-topic for careers, unverifiable claims
  - pass  — professional, career-related, safe to feature
The reason is shown to the creator when blocked and to a human reviewer otherwise. Return ONLY JSON.`;

const SCRIPT_LIMIT = 6000;

export async function screenPromotion(args: {
  llm: LLMClient;
  title: string;
  description: string;
  script: string;
}): Promise<{ verdict: ScreeningVerdict; notes: string | null }> {
  try {
    const { data } = await args.llm.callJson(
      "promotion_screening",
      {
        useCase: "promotion_screening",
        systemPrompt: SYSTEM_PROMPT,
        userMessage: `Title: ${args.title}\n\nPost text: ${args.description || "(none)"}\n\nScript:\n${args.script.slice(0, SCRIPT_LIMIT) || "(none)"}`,
        responseFormat: "json_object",
      },
      ScreeningSchema,
    );
    return { verdict: data.verdict, notes: data.reason };
  } catch (err) {
    logger.warn("[promotions] screening unavailable", err);
    return { verdict: "unscreened", notes: null };
  }
}

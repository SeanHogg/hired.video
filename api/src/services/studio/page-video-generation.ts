/**
 * SuperAdmin "turn this marketing page into a Studio video" use case
 * (#1860) behind POST /api/studio/generate-from-page. The client's AI Brain
 * harvests the live page (DOM text + images + CTAs + the matched PAGE_SEO
 * entry); we enrich it with server-known route facts and run
 * `scaffoldPageVideo()`. Token metering happens inside `LLMClient.callJson`.
 * Split out of routes/studio.ts (W2-3a).
 */
import { z } from "zod";
import type { JwtPayload } from "../../types/index.js";
import { createLLMClient, type LLMEnv } from "../adapters/llm-client.js";
import {
  PRO_MONTHLY_PRICE,
  PRO_YEARLY_PRICE,
  PRO_AI_MONTHLY_TOKENS,
  FREE_AI_MONTHLY_TOKENS,
  FREE_PUBLISHED_VIDEOS_LIMIT,
  FREE_INTERVIEW_SESSIONS_PER_MONTH,
  TOKEN_PACKS,
} from "../../../../shared/pricing.js";
import { toGenerationDomainError } from "./ai-generation-error.js";

export const HarvestedPageSchema = z.object({
  url: z.string().max(2048).default(""),
  pathname: z.string().max(512).default("/"),
  title: z.string().max(300).default(""),
  metaDescription: z.string().max(1000).default(""),
  headings: z
    .array(z.object({ level: z.number().int().min(1).max(6), text: z.string().max(300) }))
    .max(60)
    .default([]),
  sections: z
    .array(
      z.object({
        level: z.number().int().min(1).max(6),
        heading: z.string().max(300),
        text: z.string().max(4000).default(""),
      }),
    )
    .max(40)
    .default([]),
  images: z
    .array(
      z.object({
        url: z.string().max(2048),
        alt: z.string().max(500).default(""),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .max(50)
    .default([]),
  ctas: z
    .array(z.object({ text: z.string().max(200), href: z.string().max(2048) }))
    .max(20)
    .default([]),
  seoTitle: z.string().max(300).optional(),
  seoDescription: z.string().max(1000).optional(),
  bodyText: z.string().max(20000).default(""),
  colors: z
    .object({
      background: z.string().max(32).optional(),
      text: z.string().max(32).optional(),
      accent: z.string().max(32).optional(),
    })
    .optional(),
});
export type HarvestedPageInput = z.infer<typeof HarvestedPageSchema>;

/** Server-known facts for a route, appended to the scaffolder's prompt as
 *  authoritative signal (preferred over possibly-stale DOM text). Sourced
 *  from the canonical [shared/pricing.ts](../../../../shared/pricing.ts)
 *  constants so a promo video never quotes a stale price scraped from the
 *  DOM. Add a route arm here as new marketing surfaces gain authoritative
 *  server facts. */
export function buildPageVideoServerFacts(pathname: string): string[] {
  const facts: string[] = [
    "Brand: hired.video — an AI-native hiring + creator platform where people make video resumes, employers post video jobs, and a built-in Studio renders video client-side at $0 infra cost.",
  ];

  const p = pathname.toLowerCase();
  // Pricing facts ground hook/stat/cta scenes for the pricing + homepage
  // surfaces (where price/value claims are the whole point).
  if (p === "/" || p.startsWith("/pricing")) {
    const cheapestPack = TOKEN_PACKS.reduce((lo, t) => (t.price < lo.price ? t : lo), TOKEN_PACKS[0]);
    facts.push(
      `Pricing: Pro is $${PRO_MONTHLY_PRICE.toFixed(2)}/month (or $${PRO_YEARLY_PRICE.toFixed(2)}/year — 20% off).`,
      `AI tokens: Free includes ${FREE_AI_MONTHLY_TOKENS.toLocaleString("en-US")}/month; Pro includes ${PRO_AI_MONTHLY_TOKENS.toLocaleString("en-US")}/month.`,
      `Free tier also includes ${FREE_PUBLISHED_VIDEOS_LIMIT} published video and ${FREE_INTERVIEW_SESSIONS_PER_MONTH} interview-practice sessions per month.`,
      `One-off token packs start at $${cheapestPack.price.toFixed(2)} (${(cheapestPack.tokens / 1000).toLocaleString("en-US")}K tokens).`,
    );
  }

  return facts;
}

/** Scaffold a PageVideoSpec from a harvested page. Failures throw a
 *  DomainError (typed AI_* envelope, or 500 GENERATION_FAILED). */
export async function generatePageVideo(
  env: LLMEnv | undefined,
  user: JwtPayload,
  page: HarvestedPageInput,
) {
  const llm = createLLMClient(env, user);
  try {
    const { scaffoldPageVideo } = await import("./page-video-scaffolder.js");
    const { spec } = await scaffoldPageVideo(llm, {
      page,
      serverFacts: buildPageVideoServerFacts(page.pathname),
    });
    return { spec, sourcePath: page.pathname };
  } catch (err) {
    throw toGenerationDomainError(err, "[studio/generate-from-page]", "Page-to-video generation failed");
  }
}

/**
 * Page → video scaffolder (#1830).
 *
 * Single entry point: `scaffoldPageVideo()`. Takes a `HarvestedPage`
 * (the live DOM the SuperAdmin's Brain captured) plus any server-known
 * route facts and returns a fully-populated `PageVideoSpec` the Studio
 * editor can mount as-is.
 *
 * Boundary: this module owns the LLM prompt + the LLM-output →
 * `PageVideoSpec` mapping. The route handler
 * (`POST /api/studio/generate-from-page`) owns auth + the SuperAdmin
 * gate + route-fact enrichment + persistence; it inlines NO prompt or
 * spec-shape logic.
 *
 * Mirrors `services/comics/scaffolder.ts`: the LLM emits a deliberately
 * FLAT shape and only ever references images by INDEX into the harvested
 * list — never a URL — so the route resolves indices back to the
 * already-trusted asset URLs and the model can't hallucinate sources.
 */

import { z } from "zod";
import {
  PAGE_VIDEO_DEFAULT_PALETTE,
  type HarvestedPage,
  type PageVideoScene,
  type PageVideoSpec,
} from "../../../../shared/page-video-spec.js";
import type { LLMClient } from "../adapters/llm-client.js";

// ─── Public input ────────────────────────────────────────────────────────────

export interface PageVideoScaffoldInput {
  page: HarvestedPage;
  /** Server-resolved facts for the page's route (e.g. live pricing,
   *  brand positioning) appended verbatim to the user message so the
   *  model grounds the script in authoritative numbers, not stale DOM. */
  serverFacts: string[];
}

// ─── LLM-side schema ─────────────────────────────────────────────────────────
// What the model is asked to emit. FLAT (no nested widget arrays) so
// free-tier models stay on schema — `assembleSpec()` expands each beat
// into a `PageVideoScene` deterministically.

const SceneSchema = z.object({
  kind: z.enum(["hook", "point", "stat", "cta"]),
  /** On-screen headline — short + punchy. */
  headline: z.string().min(1).max(90),
  /** Optional supporting line ("" = none). */
  subhead: z.string().max(160).default(""),
  /** Up to 4 short bullets — only meaningful for "point" scenes. */
  bullets: z.array(z.string().max(80)).max(4).default([]),
  /** Big figure for "stat" scenes ("" otherwise). */
  stat: z.string().max(24).default(""),
  statCaption: z.string().max(80).default(""),
  /** Index into the supplied image list, or -1 for no image. The route
   *  resolves this back to the real URL — the model never emits a URL. */
  imageIndex: z.number().int().min(-1).max(50).default(-1),
  /** Button label for "cta" scenes ("" otherwise). */
  ctaText: z.string().max(40).default(""),
});

const ScaffoldedSchema = z.object({
  title: z.string().min(1).max(80),
  aspect: z.enum(["portrait", "landscape", "square"]).default("portrait"),
  scenes: z.array(SceneSchema).min(3).max(7),
});

export type ScaffoldedPageVideo = z.infer<typeof ScaffoldedSchema>;

// ─── Prompt builders ─────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return [
    `You are a senior social-video director. You turn a marketing web page into a SHORT, punchy vertical video (15–40s) that makes a scroller stop, understand the value, and want to act.`,
    ``,
    `Produce 3–7 scenes following this arc (don't merge beats):`,
    `  1. ONE "hook" scene — the single most compelling promise on the page, as a bold 4–8 word headline. No fluff.`,
    `  2. 2–4 "point" scenes — each a distinct concrete value/benefit pulled from the page, with 1–4 tight bullets.`,
    `  3. OPTIONAL one "stat" scene — only if the page has a real number worth dramatising (price, count, %). Put the figure in "stat" and the context in "statCaption".`,
    `  4. ONE "cta" scene — restate the offer and give a clear call to action ("Start free", "See pricing", "Try it now").`,
    ``,
    `Rules:`,
    `- Write for the eye and ear: every headline reads in under 2 seconds.`,
    `- Use ONLY facts present in the page content or the SERVER FACTS block. NEVER invent prices, numbers, claims, or features. If the page is thin, keep copy abstract rather than fabricating.`,
    `- Prefer SERVER FACTS over page text when they conflict (the DOM may be stale).`,
    `- For each scene, optionally set "imageIndex" to the most relevant image from the IMAGES list (by its [n] index). Use -1 when no image fits. Don't reuse the same image on every scene.`,
    `- Choose "aspect": "portrait" for feed/social (default), "landscape" only if the page is clearly a desktop product demo.`,
    `- Output strict JSON conforming to the supplied schema. No prose around the JSON.`,
  ].join("\n");
}

function buildUserMessage(input: PageVideoScaffoldInput): string {
  const { page, serverFacts } = input;
  const lines: string[] = [];

  lines.push(`PAGE: ${page.title || page.pathname}`);
  if (page.seoTitle) lines.push(`POSITIONING: ${page.seoTitle}`);
  if (page.seoDescription || page.metaDescription) {
    lines.push(`SUMMARY: ${page.seoDescription || page.metaDescription}`);
  }
  lines.push("");

  if (page.sections.length > 0) {
    lines.push("SECTIONS:");
    for (const s of page.sections.slice(0, 12)) {
      const body = s.text.trim().slice(0, 400);
      lines.push(`- [h${s.level}] ${s.heading}${body ? `: ${body}` : ""}`);
    }
    lines.push("");
  } else if (page.headings.length > 0) {
    lines.push("HEADINGS:");
    for (const h of page.headings.slice(0, 16)) {
      lines.push(`- [h${h.level}] ${h.text}`);
    }
    lines.push("");
  }

  // The model only sees indices — never gets a chance to emit a URL.
  if (page.images.length > 0) {
    lines.push("IMAGES (reference by [n]):");
    page.images.slice(0, 20).forEach((img, i) => {
      const dims = img.width && img.height ? ` ${img.width}x${img.height}` : "";
      lines.push(`  [${i}]${dims} ${img.alt || "(no alt text)"}`);
    });
    lines.push("");
  }

  if (page.ctas.length > 0) {
    lines.push("EXISTING CTAS:");
    for (const c of page.ctas.slice(0, 8)) lines.push(`- "${c.text}" → ${c.href}`);
    lines.push("");
  }

  if (serverFacts.length > 0) {
    lines.push("SERVER FACTS (authoritative — prefer over page text):");
    for (const f of serverFacts) lines.push(`- ${f}`);
    lines.push("");
  }

  // Fallback signal when the structured fields above were thin.
  if (page.sections.length === 0 && page.bodyText) {
    lines.push("PAGE TEXT:");
    lines.push(page.bodyText.trim().slice(0, 4000));
    lines.push("");
  }

  lines.push("Return the video script as JSON only.");
  return lines.join("\n");
}

// ─── Spec assembly ───────────────────────────────────────────────────────────
// Resolve the model's flat output into the canonical `PageVideoSpec`.
// Image indices become real URLs here; per-kind durations are applied so
// every AI-built draft has sane pacing on first paint.

function durationFor(kind: PageVideoScene["kind"]): number {
  switch (kind) {
    case "hook":
      return 3;
    case "stat":
      return 3.5;
    case "cta":
      return 4;
    case "point":
    default:
      return 5;
  }
}

function labelFor(kind: PageVideoScene["kind"], index: number): string {
  switch (kind) {
    case "hook":
      return "Hook";
    case "stat":
      return "By the numbers";
    case "cta":
      return "Call to action";
    case "point":
    default:
      return `Point ${index}`;
  }
}

function assembleSpec(
  data: ScaffoldedPageVideo,
  page: HarvestedPage,
): PageVideoSpec {
  let pointCount = 0;
  // Fall back to the page's primary CTA href for any cta scene the model
  // didn't pair with an existing link.
  const fallbackCtaUrl = page.ctas[0]?.href ?? page.url;

  const scenes: PageVideoScene[] = data.scenes.map((s) => {
    if (s.kind === "point") pointCount += 1;
    const img =
      s.imageIndex >= 0 && s.imageIndex < page.images.length
        ? page.images[s.imageIndex]
        : null;
    return {
      kind: s.kind,
      label: labelFor(s.kind, pointCount),
      headline: s.headline,
      subhead: s.subhead,
      bullets: s.kind === "point" ? s.bullets : [],
      stat: s.kind === "stat" ? s.stat : "",
      statCaption: s.kind === "stat" ? s.statCaption : "",
      imageUrl: img?.url ?? null,
      ctaText: s.kind === "cta" ? s.ctaText || "Learn more" : "",
      ctaUrl: s.kind === "cta" ? fallbackCtaUrl : "",
      durationSeconds: durationFor(s.kind),
    };
  });

  return {
    title: data.title,
    palette: PAGE_VIDEO_DEFAULT_PALETTE,
    aspect: data.aspect,
    scenes,
  };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function scaffoldPageVideo(
  llm: LLMClient,
  input: PageVideoScaffoldInput,
): Promise<{ spec: PageVideoSpec }> {
  const { data } = await llm.callJson(
    "page_video_scaffold",
    {
      useCase: "studio_script",
      systemPrompt: buildSystemPrompt(),
      userMessage: buildUserMessage(input),
      responseFormat: "json_object",
    },
    ScaffoldedSchema,
  );

  return { spec: assembleSpec(data, input.page) };
}

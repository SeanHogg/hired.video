/**
 * Page → video scaffolder tests (#1867).
 *
 * Boundary under test: `scaffoldPageVideo()` — the orchestration between
 * the LLM and the editor canvas. The LLM client is stubbed so tests stay
 * deterministic + DB-free (matches the comic scaffolder test convention).
 *
 * Coverage:
 *   - The LLM only ever picks an image INDEX; the scaffolder resolves it
 *     to the harvested URL (and null for -1 / out-of-range) — the model
 *     can't emit a URL.
 *   - Per-kind fields are honoured (bullets only on points, stat only on
 *     stats, cta gets a fallback URL from the page's CTAs).
 *   - System prompt + user message carry the harvested structure +
 *     server facts.
 *   - Reuses the `studio_script` use case + `page_video_scaffold` key.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/page-video-scaffolder.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { z } from "zod";
import { scaffoldPageVideo } from "../page-video-scaffolder.js";
import type { HarvestedPage } from "../../../../../shared/page-video-spec.js";
import type {
  LLMClient,
  LLMUsage,
  LLMOptions,
  LLMResult,
  LLMCallOpts,
  LLMMessagesOptions,
  LenientIngest,
} from "../../adapters/llm-client.js";

function fakePage(over: Partial<HarvestedPage> = {}): HarvestedPage {
  return {
    url: "https://hired.video/pricing",
    pathname: "/pricing",
    title: "Pricing — hired.video",
    metaDescription: "Simple pricing.",
    headings: [{ level: 1, text: "Pricing" }],
    sections: [{ level: 1, heading: "Pricing", text: "Pro is cheap." }],
    images: [
      { url: "https://cdn.hired.video/a.png", alt: "hero", width: 1200, height: 800 },
      { url: "https://cdn.hired.video/b.png", alt: "chart", width: 600, height: 400 },
    ],
    ctas: [{ text: "Start free", href: "https://hired.video/signup" }],
    seoTitle: "Pricing that scales",
    seoDescription: "Free and Pro.",
    bodyText: "Pricing body text.",
    ...over,
  };
}

/** Model output shaped to the scaffolder's Zod schema. */
function fakeLlmResponse(over: { scenes?: unknown[]; aspect?: string } = {}): unknown {
  return {
    title: "Why hired.video",
    aspect: over.aspect ?? "portrait",
    scenes: over.scenes ?? [
      { kind: "hook", headline: "Get hired faster", subhead: "", bullets: [], stat: "", statCaption: "", imageIndex: 0, ctaText: "" },
      { kind: "point", headline: "Video resumes", subhead: "", bullets: ["Stand out", "No editing"], stat: "", statCaption: "", imageIndex: 1, ctaText: "" },
      { kind: "stat", headline: "Scale", subhead: "", bullets: [], stat: "1M tokens", statCaption: "every month on Pro", imageIndex: -1, ctaText: "" },
      { kind: "cta", headline: "Ready?", subhead: "", bullets: [], stat: "", statCaption: "", imageIndex: 9, ctaText: "Start free" },
    ],
  };
}

function makeStubLlm(payload: unknown): { llm: LLMClient; calls: { featureKey: string; options: LLMOptions }[] } {
  const calls: { featureKey: string; options: LLMOptions }[] = [];
  const usage: LLMUsage = { promptTokens: 10, completionTokens: 20, totalTokens: 30, model: "stub/model" };
  const llm: LLMClient = {
    async callJson<T>(featureKey: string, options: LLMOptions, schema: z.ZodType<T>, _opts?: LLMCallOpts) {
      calls.push({ featureKey, options });
      const parsed = schema.safeParse(payload);
      if (!parsed.success) throw new Error(`Stub payload did not satisfy schema: ${parsed.error.message}`);
      return { data: parsed.data, usage };
    },
    async callJsonLenient<Wire, Canonical>(_f: string, _o: LLMOptions, _s: LenientIngest<Wire, Canonical>, _c?: LLMCallOpts): Promise<{ data: Canonical; usage: LLMUsage }> {
      throw new Error("scaffoldPageVideo should not call callJsonLenient");
    },
    async callText(_f: string, _o: LLMOptions, _c?: LLMCallOpts) {
      throw new Error("scaffoldPageVideo should not call callText");
    },
    async callMessages(_f: string, _o: LLMMessagesOptions, _c?: LLMCallOpts): Promise<LLMResult> {
      throw new Error("scaffoldPageVideo should not call callMessages");
    },
  };
  return { llm, calls };
}

describe("scaffoldPageVideo()", () => {
  it("resolves image INDEX → harvested URL, and null for -1 / out-of-range", async () => {
    const { llm } = makeStubLlm(fakeLlmResponse());
    const page = fakePage();
    const { spec } = await scaffoldPageVideo(llm, { page, serverFacts: [] });
    assert.equal(spec.scenes[0].imageUrl, page.images[0].url); // index 0
    assert.equal(spec.scenes[1].imageUrl, page.images[1].url); // index 1
    assert.equal(spec.scenes[2].imageUrl, null); // -1
    assert.equal(spec.scenes[3].imageUrl, null); // 9 out of range
  });

  it("keeps bullets only on point scenes and stat only on stat scenes", async () => {
    const { llm } = makeStubLlm(fakeLlmResponse());
    const { spec } = await scaffoldPageVideo(llm, { page: fakePage(), serverFacts: [] });
    assert.deepEqual(spec.scenes[1].bullets, ["Stand out", "No editing"]);
    assert.deepEqual(spec.scenes[0].bullets, []); // hook drops bullets
    assert.equal(spec.scenes[2].stat, "1M tokens");
    assert.equal(spec.scenes[0].stat, ""); // hook drops stat
  });

  it("gives cta scenes a fallback URL from the page's primary CTA", async () => {
    const { llm } = makeStubLlm(fakeLlmResponse());
    const page = fakePage();
    const { spec } = await scaffoldPageVideo(llm, { page, serverFacts: [] });
    const cta = spec.scenes.find((s) => s.kind === "cta");
    assert.ok(cta);
    assert.equal(cta!.ctaText, "Start free");
    assert.equal(cta!.ctaUrl, page.ctas[0].href);
  });

  it("threads harvested structure + server facts into the prompt, on the studio_script use case", async () => {
    const { llm, calls } = makeStubLlm(fakeLlmResponse());
    await scaffoldPageVideo(llm, {
      page: fakePage(),
      serverFacts: ["Pricing: Pro is $9.95/month."],
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].featureKey, "page_video_scaffold");
    assert.equal(calls[0].options.useCase, "studio_script");
    const user = calls[0].options.userMessage;
    assert.ok(user.includes("Pricing"), "heading/section missing from user message");
    assert.ok(user.includes("[0]"), "image index list missing");
    assert.ok(user.includes("Pro is $9.95/month"), "server fact missing");
    assert.ok(user.includes("Start free"), "existing CTA missing");
  });

  it("defaults aspect to portrait", async () => {
    const { llm } = makeStubLlm(fakeLlmResponse({ aspect: "portrait" }));
    const { spec } = await scaffoldPageVideo(llm, { page: fakePage(), serverFacts: [] });
    assert.equal(spec.aspect, "portrait");
  });

  it("themes the palette to the page's harvested brand colours (#1864)", async () => {
    const { llm } = makeStubLlm(fakeLlmResponse());
    const page = fakePage({ colors: { background: "#101820", text: "#f5f5f5", accent: "#ff5a36" } });
    const { spec } = await scaffoldPageVideo(llm, { page, serverFacts: [] });
    assert.equal(spec.palette.background, "#101820");
    assert.equal(spec.palette.text, "#f5f5f5");
    assert.equal(spec.palette.accent, "#ff5a36");
  });

  it("falls back to the default palette when harvested colours are missing/invalid", async () => {
    const { llm } = makeStubLlm(fakeLlmResponse());
    // Missing the text colour + a non-hex accent → unsafe to reskin.
    const page = fakePage({ colors: { background: "#101820", accent: "rgb(1,2,3)" } });
    const { spec } = await scaffoldPageVideo(llm, { page, serverFacts: [] });
    assert.equal(spec.palette.background, "#0f172a"); // PAGE_VIDEO_DEFAULT_PALETTE
  });
});

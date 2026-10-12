/**
 * Comic AI scaffolder tests.
 *
 * Boundary under test: `scaffoldComic()` — the pure orchestration layer
 * between the LLM and the editor canvas. We stub the LLM client so the
 * tests stay deterministic + DB-free (matches the repo's API test
 * convention; see `jobs-create-from-file.test.ts` for the pattern).
 *
 * Coverage:
 *   - System prompt + user message contain the genre's tone /
 *     narrative-beat shaping + the user's source text.
 *   - The returned `ComicSpec` carries the canonical layout + palette
 *     + stock-asset URLs resolved server-side (DRY: same SoT both the
 *     editor seed and the AI path stamp on every page).
 *   - Unknown genre id falls back to the catalog default ("hero").
 *
 * Run: node --import tsx --test src/services/comics/__tests__/scaffolder.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { z } from "zod";
import { scaffoldComic } from "../scaffolder.js";
import { getComicGenre } from "../../../../../shared/comic-genres.js";
import { COMIC_DEFAULT_LAYOUT } from "../../../../../shared/comic-spec.js";
import type {
  LLMClient,
  LLMUsage,
  LLMOptions,
  LLMResult,
  LLMCallOpts,
  LLMMessagesOptions,
  LenientIngest,
} from "../../adapters/llm-client.js";

/** Build a usable 6-page response shaped to the scaffolder's Zod schema. */
function fakeLlmResponse(over: {
  title?: string;
  protagonistLines?: string[];
  sfx?: string[];
  otherLines?: string[];
} = {}): unknown {
  const protagonistLines =
    over.protagonistLines ?? [
      "The case lands on my desk.",
      "I open the file.",
      "First lead — a name.",
      "Wait. Something doesn't add up.",
      "I put it all together.",
      "Hire me to close the next one.",
    ];
  const sfx = over.sfx ?? ["", "", "TAP", "", "DRIP", ""];
  const otherLines = over.otherLines ?? ["", "", "", "", "", ""];
  return {
    title: over.title ?? "The Recruiter Files",
    pages: protagonistLines.map((line, i) => ({
      pageNumber: i + 1,
      caption: `BEAT ${i + 1}`,
      protagonistLine: line,
      protagonistMode: i === 3 ? "thought" : "speech",
      otherLine: otherLines[i],
      otherLabel: otherLines[i] ? "Client" : "",
      sfx: sfx[i] ?? "",
      visualBrief: `Brief for beat ${i + 1}`,
    })),
  };
}

/** Build a stubbed LLMClient that records the call options it sees and
 *  returns the supplied JSON payload. The other methods throw — every
 *  scaffolder test path should go through `callJson` only. */
interface StubCall {
  featureKey: string;
  options: LLMOptions;
}

function makeStubLlm(payload: unknown): { llm: LLMClient; calls: StubCall[] } {
  const calls: StubCall[] = [];
  const usage: LLMUsage = {
    promptTokens: 100,
    completionTokens: 200,
    totalTokens: 300,
    model: "stub/model",
  };
  const llm: LLMClient = {
    async callJson<T>(
      featureKey: string,
      options: LLMOptions,
      schema: z.ZodType<T>,
      _opts?: LLMCallOpts,
    ): Promise<{ data: T; usage: LLMUsage }> {
      calls.push({ featureKey, options });
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Stub payload did not satisfy schema: ${parsed.error.message}`);
      }
      return { data: parsed.data, usage };
    },
    async callJsonLenient<Wire, Canonical>(
      _featureKey: string,
      _options: LLMOptions,
      _spec: LenientIngest<Wire, Canonical>,
      _opts?: LLMCallOpts,
    ): Promise<{ data: Canonical; usage: LLMUsage }> {
      throw new Error("scaffoldComic should not call callJsonLenient");
    },
    async callText(
      _featureKey: string,
      _options: LLMOptions,
      _opts?: LLMCallOpts,
    ): Promise<{ content: string; usage: LLMUsage }> {
      throw new Error("scaffoldComic should not call callText");
    },
    async callMessages(
      _featureKey: string,
      _options: LLMMessagesOptions,
      _opts?: LLMCallOpts,
    ): Promise<LLMResult> {
      throw new Error("scaffoldComic should not call callMessages");
    },
  };
  return { llm, calls };
}

describe("scaffoldComic()", () => {
  it("threads the genre's tone + art direction + protagonist name into the system prompt", async () => {
    const { llm, calls } = makeStubLlm(fakeLlmResponse());
    await scaffoldComic(llm, {
      prompt: "land my next investigator role",
      genreId: "noir",
      protagonistName: "Cassandra Vale",
      sourceText: "10 years at a private firm.",
      sourceKind: "resume",
    });
    assert.equal(calls.length, 1);
    const sys = calls[0].options.systemPrompt;
    const noir = getComicGenre("noir");
    for (const tone of noir.tone) {
      assert.ok(sys.includes(tone), `system prompt missing tone token "${tone}"`);
    }
    assert.ok(sys.includes(noir.artDirection), "system prompt missing art direction");
    assert.ok(sys.includes("Cassandra Vale"), "protagonist name not in system prompt");
  });

  it("threads the source artefact body into the user message under a kind-labelled section", async () => {
    const { llm, calls } = makeStubLlm(fakeLlmResponse());
    await scaffoldComic(llm, {
      prompt: "lead with the strongest beat",
      genreId: "hero",
      protagonistName: "Alex",
      sourceText: "Senior React engineer · 7 years · climate-tech focus.",
      sourceKind: "profile",
    });
    const user = calls[0].options.userMessage;
    assert.ok(user.includes("PROFILE:"), "source-kind label not stamped");
    assert.ok(user.includes("Senior React engineer"), "source body missing");
    assert.ok(user.includes("lead with the strongest beat"), "prompt missing");
  });

  it("falls back to the hero genre for unknown ids without throwing", async () => {
    const { llm } = makeStubLlm(fakeLlmResponse());
    const { spec } = await scaffoldComic(llm, {
      prompt: "make me a pitch",
      genreId: "nonexistent-genre" as never,
      protagonistName: "",
      sourceText: "",
      sourceKind: "auto",
    });
    assert.equal(spec.genreId, "hero");
    assert.equal(spec.palette.paper, getComicGenre("hero").palette.paper);
  });

  it("uses the studio_script use case (shares pricing + model with storyboard)", async () => {
    // The scaffolder must NOT introduce a parallel LLMUseCase entry —
    // it reuses `studio_script` so token billing, model selection, and
    // fallback chain are identical to the existing storyboard route.
    const { llm, calls } = makeStubLlm(fakeLlmResponse());
    await scaffoldComic(llm, {
      prompt: "p",
      genreId: "manga",
      protagonistName: "Yuki",
      sourceText: "s",
      sourceKind: "auto",
    });
    assert.equal(calls[0].options.useCase, "studio_script");
    assert.equal(calls[0].featureKey, "comic_scaffold");
  });

  it("stamps the canonical layout on the returned spec (DRY: same layout as the seed path)", async () => {
    const { llm } = makeStubLlm(fakeLlmResponse());
    const { spec } = await scaffoldComic(llm, {
      prompt: "p",
      genreId: "hero",
      protagonistName: "",
      sourceText: "",
      sourceKind: "auto",
    });
    assert.deepEqual(spec.layout, COMIC_DEFAULT_LAYOUT);
  });

  it("resolves stock asset URLs server-side for every page", async () => {
    const { llm } = makeStubLlm(fakeLlmResponse());
    const { spec } = await scaffoldComic(llm, {
      prompt: "p",
      genreId: "hero",
      protagonistName: "",
      sourceText: "",
      sourceKind: "auto",
    });
    assert.equal(spec.pages.length, 6);
    for (const page of spec.pages) {
      assert.ok(
        page.assets.backgroundUrl?.startsWith("/comics/hero/"),
        `page ${page.pageNumber} missing or wrong background`,
      );
      assert.ok(
        page.assets.characterUrl?.startsWith("/comics/hero/"),
        `page ${page.pageNumber} missing or wrong character`,
      );
    }
  });

  it("only resolves an SFX URL on pages whose model output included an SFX word", async () => {
    const { llm } = makeStubLlm(
      fakeLlmResponse({ sfx: ["", "", "", "", "POW!", ""] }),
    );
    const { spec } = await scaffoldComic(llm, {
      prompt: "p",
      genreId: "hero",
      protagonistName: "",
      sourceText: "",
      sourceKind: "auto",
    });
    const withSfx = spec.pages.filter((p) => p.assets.sfxUrl !== null);
    assert.equal(withSfx.length, 1);
    assert.equal(withSfx[0].sfx, "POW!");
  });

  it("preserves the LLM's protagonistMode (speech | thought) per page", async () => {
    const { llm } = makeStubLlm(fakeLlmResponse());
    const { spec } = await scaffoldComic(llm, {
      prompt: "p",
      genreId: "hero",
      protagonistName: "",
      sourceText: "",
      sourceKind: "auto",
    });
    // Page 4 was emitted as thought in the fake response.
    assert.equal(spec.pages[3].protagonistMode, "thought");
    assert.equal(spec.pages[0].protagonistMode, "speech");
  });
});

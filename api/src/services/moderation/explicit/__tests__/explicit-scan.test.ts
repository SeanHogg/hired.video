/**
 * Explicit-scan domain: verdict merge, fail-closed behaviour, the text scan
 * (deterministic floor + classifier), the image classifier chain, the video
 * input collector, and the public feed's scan gate.
 *
 * Run: cd api && node --import tsx --test src/services/moderation/explicit/__tests__/explicit-scan.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isPubliclyVisible,
  mergeVerdicts,
  ownerStatusOf,
  type ExplicitVerdict,
} from "../../../../../../shared/moderation/explicit.js";
import { parseClassifierVerdict } from "../classifierPrompt.js";
import { explicitTextFloor, scanTextExplicit } from "../textScan.js";
import {
  classifyImages,
  gatewaySource,
  gatewayVisionClassifier,
  isLicenceNotAcceptedError,
  isScannableImage,
  isVisionModel,
  workersAiSource,
  workersAiVisionClassifier,
  type ImageClassifier,
  type ImageInput,
} from "../imageClassifier.js";
import { ExplicitContentError } from "../errors.js";
import {
  classifyDownscaleError,
  cloudflareImagesDownscaler,
  createImageDownscaler,
  needsScanCopy,
  withScanCopy,
  type ImagesTransformBinding,
} from "../imageDownscaler.js";
import { LEGACY_APPROVAL_REASON, keepsLegacyApproval, legacyInputHash } from "../videoScan.js";
import { fetchScanImage } from "../imageScan.js";
import { videosNeedingScanQuery } from "../review.js";
import { collectVideoScanInputs } from "../videoScanInputs.js";
import type { LLMClient } from "../../../adapters/llm-client.js";
import { getDb } from "../../../../db/index.js";
import { publicVideoFeedQuery } from "../../../studio/public-video-feed.js";

const PASS: ExplicitVerdict = { verdict: "pass", categories: [], reason: null };
const UNSCREENED: ExplicitVerdict = { verdict: "unscreened", categories: [], reason: "classifier down" };
const block = (...categories: ExplicitVerdict["categories"]): ExplicitVerdict => ({ verdict: "block", categories, reason: "found" });

const JPEG: ImageInput = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), mime: "image/jpeg" };

describe("mergeVerdicts", () => {
  it("no parts → pass", () => assert.equal(mergeVerdicts([]).verdict, "pass"));
  it("all pass → pass", () => assert.equal(mergeVerdicts([PASS, PASS]).verdict, "pass"));
  it("any block blocks, categories unioned in canonical order", () => {
    const v = mergeVerdicts([PASS, block("weapons"), UNSCREENED, block("sexual", "weapons")]);
    assert.equal(v.verdict, "block");
    assert.deepEqual(v.categories, ["sexual", "weapons"]);
  });
  it("unscreened beats pass (fails closed)", () => {
    const v = mergeVerdicts([PASS, UNSCREENED]);
    assert.equal(v.verdict, "unscreened");
    assert.deepEqual(v.categories, []);
  });
});

describe("public visibility (fail closed)", () => {
  it("only an effective pass is public", () => {
    assert.equal(isPubliclyVisible(null), false);
    assert.equal(isPubliclyVisible(undefined), false);
    assert.equal(isPubliclyVisible({ verdict: "unscreened" }), false);
    assert.equal(isPubliclyVisible({ verdict: "block" }), false);
    assert.equal(isPubliclyVisible({ verdict: "pass" }), true);
  });
  it("a SuperAdmin override wins either way", () => {
    assert.equal(isPubliclyVisible({ verdict: "block", overrideVerdict: "pass" }), true);
    assert.equal(isPubliclyVisible({ verdict: "pass", overrideVerdict: "block" }), false);
  });
  it("the owner sees categories only while not passing", () => {
    assert.deepEqual(ownerStatusOf({ verdict: "block", categories: ["drugs"] }), { verdict: "block", categories: ["drugs"] });
    assert.deepEqual(ownerStatusOf({ verdict: "block", overrideVerdict: "pass", categories: ["drugs"] }), { verdict: "pass", categories: [] });
  });
});

describe("parseClassifierVerdict", () => {
  it("reads JSON wrapped in prose / fences", () => {
    const v = parseClassifierVerdict('Sure:\n```json\n{"verdict":"block","categories":["Weapons","nonsense"],"reason":"a rifle"}\n```');
    assert.deepEqual(v, { verdict: "block", categories: ["weapons"], reason: "a rifle" });
  });
  it("pass drops categories", () => {
    assert.deepEqual(parseClassifierVerdict('{"verdict":"pass","categories":["sexual"]}'), PASS);
  });
  it("throws on garbage (callers map that to unscreened, never pass)", () => {
    assert.throws(() => parseClassifierVerdict("I think it's fine"));
    assert.throws(() => parseClassifierVerdict('{"verdict":"maybe"}'));
  });
});

describe("scanTextExplicit", () => {
  const passing = async () => '{"verdict":"pass","categories":[],"reason":"ok"}';
  const blocking = async () => '{"verdict":"block","categories":["drugs"],"reason":"drug use"}';
  const failing = async () => { throw new Error("gateway 503"); };

  it("empty text passes without a model call", async () => {
    assert.equal((await scanTextExplicit("   ", null)).verdict, "pass");
  });
  it("a lexicon hit blocks without calling the classifier", async () => {
    let called = false;
    const v = await scanTextExplicit("check my new gun", async () => { called = true; return ""; });
    assert.equal(v.verdict, "block");
    assert.deepEqual(v.categories, ["weapons"]);
    assert.equal(called, false);
  });
  it("prompt-guard contextual rules feed the floor (violence)", () => {
    const floor = explicitTextFloor("people shooting guns at each other");
    assert.ok(floor);
    assert.ok(floor.categories.includes("violence"));
  });
  it("clean career copy goes to the classifier", async () => {
    assert.equal((await scanTextExplicit("Shooting for goals in my next role", passing)).verdict, "pass");
    assert.equal((await scanTextExplicit("Shooting for goals in my next role", blocking)).verdict, "block");
  });
  it("no classifier → unscreened (fails closed)", async () => {
    assert.equal((await scanTextExplicit("Product manager, 8 years", null)).verdict, "unscreened");
  });
  it("classifier failure → unscreened, never pass", async () => {
    assert.equal((await scanTextExplicit("Product manager, 8 years", failing)).verdict, "unscreened");
  });
});

describe("classifyImages", () => {
  const fake = (name: string, impl: ImageClassifier["classify"]): ImageClassifier => ({ name, classify: impl });

  it("no images → pass", async () => assert.equal((await classifyImages([], [])).verdict, "pass"));
  it("no classifier configured → unscreened", async () => {
    assert.equal((await classifyImages([JPEG], [])).verdict, "unscreened");
  });
  it("falls through a failing adapter to the next", async () => {
    const v = await classifyImages([JPEG], [
      fake("a", async () => { throw new Error("down"); }),
      fake("b", async () => block("sexual")),
    ]);
    assert.equal(v.verdict, "block");
    assert.deepEqual(v.categories, ["sexual"]);
  });
  it("every adapter failing → unscreened", async () => {
    const v = await classifyImages([JPEG], [fake("a", async () => { throw new Error("down"); })]);
    assert.equal(v.verdict, "unscreened");
  });
  it("an unsupported type can't pass (svg stays unscreened)", async () => {
    const svg: ImageInput = { bytes: new Uint8Array([60, 115, 118, 103]), mime: "image/svg+xml" };
    const v = await classifyImages([svg], [fake("ok", async () => PASS)]);
    assert.equal(v.verdict, "unscreened");
  });

  it("gateway adapter rejects an answer from a non-vision model", async () => {
    const llm = {
      callMessages: async () => ({ content: '{"verdict":"pass","categories":[]}', finishReason: "stop", usage: { model: "qwen/qwen3-coder:free" } }),
    } as unknown as LLMClient;
    const v = await classifyImages([JPEG], [gatewayVisionClassifier(llm)]);
    assert.equal(v.verdict, "unscreened");
  });
  it("gateway adapter batches images into one vision call", async () => {
    let imageParts = 0;
    const llm = {
      callMessages: async (_key: string, opts: { messages: Array<{ content: unknown }> }) => {
        const user = opts.messages[1]?.content as Array<{ type: string }>;
        imageParts = user.filter((p) => p.type === "image_url").length;
        return { content: '{"verdict":"block","categories":["weapons"],"reason":"gun"}', finishReason: "stop", usage: { model: "claude-sonnet-5-5" } };
      },
    } as unknown as LLMClient;
    const v = await classifyImages([JPEG, JPEG, JPEG], [gatewayVisionClassifier(llm)]);
    assert.equal(imageParts, 3);
    assert.equal(v.verdict, "block");
  });
  it("isVisionModel", () => {
    assert.equal(isVisionModel("claude-sonnet-5-5"), true);
    assert.equal(isVisionModel("@cf/meta/llama-3.2-11b-vision-instruct"), true);
    assert.equal(isVisionModel("google/gemma-4-31b-it:free"), false);
    assert.equal(isVisionModel(undefined), false);
  });
});

describe("image variants (scan copy, CPU-safe fallback)", () => {
  const HUGE_PNG: ImageInput = { bytes: new Uint8Array(4_000_000).fill(1), mime: "image/png", url: "https://cdn.hired.video/big.png" };
  const MID_PNG: ImageInput = { bytes: new Uint8Array(2_000_000).fill(1), mime: "image/png", url: "https://cdn.hired.video/mid.png" };
  const COPY = { bytes: new Uint8Array(300_000).fill(2), mime: "image/jpeg" };

  it("gateway reads a scannable stored original by URL (no base64)", () => {
    assert.equal(gatewaySource(MID_PNG), "https://cdn.hired.video/mid.png");
  });
  it("gateway inlines a small original that has no URL (frames)", () => {
    assert.match(gatewaySource(JPEG) ?? "", /^data:image\/jpeg;base64,/);
  });
  it("an oversize original falls back to its scan copy", () => {
    assert.match(gatewaySource({ ...HUGE_PNG, scanCopy: COPY }) ?? "", /^data:image\/jpeg;base64,/);
  });
  it("oversize without a scan copy has no variant → fails closed", async () => {
    assert.equal(gatewaySource(HUGE_PNG), null);
    assert.equal(isScannableImage(HUGE_PNG), false);
    const v = await classifyImages([HUGE_PNG], [{ name: "ok", classify: async () => PASS }]);
    assert.equal(v.verdict, "unscreened");
  });
  it("an SVG with a scan copy is scannable", () => {
    const svg: ImageInput = { bytes: new Uint8Array([60, 115, 118, 103]), mime: "image/svg+xml", scanCopy: COPY };
    assert.equal(isScannableImage(svg), true);
  });
  it("Workers AI gets the scan copy, a small original, or nothing — never multi-MB bytes", () => {
    assert.equal(workersAiSource({ ...MID_PNG, scanCopy: COPY }), COPY);
    assert.equal(workersAiSource(JPEG)?.bytes, JPEG.bytes);
    assert.equal(workersAiSource(MID_PNG), null);
  });
  it("Workers AI adapter sends the copy and refuses an image it can't take cheaply", async () => {
    let sentLength = 0;
    const ai = {
      run: async (_model: string, inputs: Record<string, unknown>) => {
        sentLength = (inputs.image as number[]).length;
        return { response: '{"verdict":"pass","categories":[]}' };
      },
    };
    const adapter = workersAiVisionClassifier(ai);
    assert.equal((await adapter.classify([{ ...MID_PNG, scanCopy: COPY }])).verdict, "pass");
    assert.equal(sentLength, COPY.bytes.length);
    await assert.rejects(adapter.classify([MID_PNG]));
    assert.equal((await classifyImages([MID_PNG], [adapter])).verdict, "unscreened");
  });
});

describe("server-side scan copy (Cloudflare Images)", () => {
  const COPY_BYTES = new Uint8Array([0xff, 0xd8, 9, 9, 9]);
  function fakeImages(opts: { fail?: string } = {}) {
    const calls: Array<{ transform?: unknown; output?: unknown }> = [];
    const binding: ImagesTransformBinding = {
      input: () => ({
        transform: (t) => {
          calls.push({ transform: t });
          return {
            output: async (o) => {
              calls.push({ output: o });
              if (opts.fail) throw new Error(opts.fail);
              return { image: () => new Blob([COPY_BYTES]).stream() as ReadableStream<Uint8Array> };
            },
          };
        },
      }),
    };
    return { binding, calls };
  }

  it("needsScanCopy: large or unsupported originals only", () => {
    assert.equal(needsScanCopy({ bytes: new Uint8Array(500_000), mime: "image/png" }), false);
    assert.equal(needsScanCopy({ bytes: new Uint8Array(2_000_000), mime: "image/png" }), true);
    assert.equal(needsScanCopy({ bytes: new Uint8Array(100), mime: "image/svg+xml" }), true);
  });
  it("downscales to a ≤1600 px JPEG", async () => {
    const { binding, calls } = fakeImages();
    const copy = await cloudflareImagesDownscaler(binding)({ bytes: new Uint8Array(100), mime: "image/svg+xml" });
    assert.deepEqual(copy, { bytes: COPY_BYTES, mime: "image/jpeg" });
    assert.deepEqual(calls[0]?.transform, { width: 1600, height: 1600, fit: "scale-down" });
    assert.deepEqual(calls[1]?.output, { format: "image/jpeg", quality: 80 });
  });
  it("a per-image input error gives no copy and raises NO alert", async () => {
    const { binding } = fakeImages({ fail: "9412: not an image" });
    const svg = { bytes: new Uint8Array(100), mime: "image/svg+xml" };
    const failures: string[] = [];
    const input = await withScanCopy(svg, cloudflareImagesDownscaler(binding, async (m) => failures.push(m)));
    assert.equal(input.scanCopy, undefined);
    assert.deepEqual(failures, [], "a bad file must not page ops or burn the outage dedupe window");
    assert.equal((await classifyImages([input], [{ name: "ok", classify: async () => PASS }])).verdict, "unscreened");
  });
  it("a service error gives no copy and raises the SuperAdmin alert keyed by class", async () => {
    const { binding } = fakeImages({ fail: "9432: Images binding is not enabled for this account" });
    const svg = { bytes: new Uint8Array(100), mime: "image/svg+xml" };
    const failures: Array<[string, string]> = [];
    const input = await withScanCopy(
      svg,
      cloudflareImagesDownscaler(binding, async (m, cls) => failures.push([m, cls])),
    );
    assert.equal(input.scanCopy, undefined);
    assert.deepEqual(failures, [["9432: Images binding is not enabled for this account", "9432"]]);
  });
  it("classifyDownscaleError: input codes/phrases vs service failures", () => {
    for (const m of ["9402: image too large", "9412: not an image", "9413: exceeds max area", "9520: unsupported image format", "Not an image"]) {
      assert.deepEqual(classifyDownscaleError(new Error(m)), { kind: "input" }, m);
    }
    assert.deepEqual(classifyDownscaleError(new Error("9422: usage limit reached")), { kind: "service", id: "9422" });
    assert.deepEqual(classifyDownscaleError(new Error("500 internal error")), { kind: "service", id: "unknown" });
    assert.deepEqual(classifyDownscaleError(new TypeError("images.input(...).transform is not a function")), {
      kind: "service",
      id: "binding",
    });
  });
  it("an oversize original is piped to the binding as a stream", async () => {
    let received: ReadableStream<Uint8Array> | null = null;
    const binding: ImagesTransformBinding = {
      input: (stream) => {
        received = stream;
        return {
          transform: () => ({
            output: async () => ({ image: () => new Blob([COPY_BYTES]).stream() as ReadableStream<Uint8Array> }),
          }),
        };
      },
    };
    const source = new Blob([new Uint8Array(10)]).stream() as ReadableStream<Uint8Array>;
    const copy = await cloudflareImagesDownscaler(binding)({ stream: source, mime: "image/png" });
    assert.equal(received, source);
    assert.deepEqual(copy, { bytes: COPY_BYTES, mime: "image/jpeg" });
  });
  it("no IMAGES binding → no downscaler", () => {
    assert.equal(createImageDownscaler({}), null);
    assert.ok(createImageDownscaler({ IMAGES: fakeImages().binding }));
  });
  it("small supported images skip the transform", async () => {
    let called = false;
    const input = await withScanCopy(JPEG, async () => { called = true; return null; });
    assert.equal(called, false);
    assert.equal(input, JPEG);
  });
});

describe("Workers AI licence acceptance", () => {
  const SMALL = { bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg" };

  it("on a 5016 / 'agree' error, sends \"agree\" once and retries", async () => {
    const prompts: unknown[] = [];
    let accepted = false;
    const ai = {
      run: async (_model: string, inputs: Record<string, unknown>) => {
        if (inputs.prompt === "agree") { prompts.push(inputs.prompt); accepted = true; return { response: "Thank you for agreeing" }; }
        if (!accepted) throw new Error("5016: Prior to using this model, you must submit the prompt 'agree'");
        return { response: '{"verdict":"block","categories":["weapons"],"reason":"rifle"}' };
      },
    };
    const v = await workersAiVisionClassifier(ai).classify([SMALL]);
    assert.equal(v.verdict, "block");
    assert.deepEqual(prompts, ["agree"]);
  });
  it("only agrees once per binding (isolate) — a persistent failure surfaces", async () => {
    let agreeCalls = 0;
    const ai = {
      run: async (_model: string, inputs: Record<string, unknown>) => {
        if (inputs.prompt === "agree") { agreeCalls++; return {}; }
        throw Object.assign(new Error("licence not accepted"), { code: 5016 });
      },
    };
    const adapter = workersAiVisionClassifier(ai);
    await assert.rejects(adapter.classify([SMALL]));
    await assert.rejects(adapter.classify([SMALL]));
    assert.equal(agreeCalls, 1);
  });
  it("other errors are not treated as a licence problem", () => {
    assert.equal(isLicenceNotAcceptedError(new Error("3040: capacity exceeded")), false);
    assert.equal(isLicenceNotAcceptedError(Object.assign(new Error("x"), { code: 5016 })), true);
  });
});

describe("legacy approval (migration 0509)", () => {
  it("the migration writes the marker + reason the scan recognises", async () => {
    const { readFile } = await import("node:fs/promises");
    const sqlText = await readFile(new URL("../../../../../drizzle/0509_content_scans_legacy_approve.sql", import.meta.url), "utf8");
    assert.ok(sqlText.includes(`'${LEGACY_APPROVAL_REASON}'`));
    assert.ok(sqlText.includes(`'legacy:' || coalesce(v.r2_key, '')`));
    assert.equal(legacyInputHash("studio/u/p/1.webm"), "legacy:studio/u/p/1.webm");
    assert.equal(legacyInputHash(null), "legacy:");
  });
  it("only approves videos created before the gate (fixed 0505 cutoff, never now())", async () => {
    const { readFile } = await import("node:fs/promises");
    const sqlText = await readFile(new URL("../../../../../drizzle/0509_content_scans_legacy_approve.sql", import.meta.url), "utf8");
    const cutoff = "created_at < '2026-10-10T14:27:24Z'::timestamptz";
    // Both the INSERT selection and the ON CONFLICT update path.
    assert.equal(sqlText.split(cutoff).length - 1, 2);
    assert.doesNotMatch(sqlText, /created_at\s*<\s*now\(\)/i);
  });
  it("a legacy approval survives a rescan only while nothing blocks", () => {
    assert.equal(keepsLegacyApproval([PASS, PASS]), true);
    assert.equal(keepsLegacyApproval([]), true);
    // Classifier down is not a reason to pull an approved video.
    assert.equal(keepsLegacyApproval([UNSCREENED, PASS]), true);
    // Title / description edited to explicit text → the approval goes.
    assert.equal(keepsLegacyApproval([block("sexual"), PASS]), false);
    assert.equal(keepsLegacyApproval([PASS, block("weapons")]), false);
  });
  it("explicit text edited onto a legacy video blocks via the deterministic floor", async () => {
    const textPart = await scanTextExplicit("My reel — check my new gun", async () => '{"verdict":"pass","categories":[]}');
    assert.equal(keepsLegacyApproval([textPart]), false);
  });
  it("an approved legacy row is publicly visible through the override", () => {
    assert.equal(isPubliclyVisible({ verdict: "unscreened", overrideVerdict: "pass" }), true);
  });
});

describe("fetchScanImage (SSRF guard + streaming cap)", () => {
  function scripted(routes: Record<string, () => Response>) {
    const calls: string[] = [];
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      calls.push(url);
      const route = routes[url];
      return route ? route() : new Response("nope", { status: 404 });
    }) as typeof fetch;
    return { fetchImpl, calls };
  }
  const png = (size: number, headers: Record<string, string> = {}) => () =>
    new Response(new Uint8Array(size), { status: 200, headers: { "content-type": "image/png", ...headers } });

  it("refuses private / metadata asset URLs without fetching", async () => {
    const { fetchImpl, calls } = scripted({});
    for (const url of ["http://169.254.169.254/latest/meta-data", "http://localhost/a.png", "http://10.0.0.5/a.png", "file:///etc/passwd"]) {
      assert.equal(await fetchScanImage(url, fetchImpl), null, url);
    }
    assert.equal(calls.length, 0);
  });
  it("refuses a redirect to a private host", async () => {
    const { fetchImpl, calls } = scripted({
      "https://cdn.example.com/a.png": () => new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/a.png" } }),
    });
    assert.equal(await fetchScanImage("https://cdn.example.com/a.png", fetchImpl), null);
    assert.deepEqual(calls, ["https://cdn.example.com/a.png"]);
  });
  it("buffers a normal image", async () => {
    const { fetchImpl } = scripted({ "https://cdn.example.com/a.png": png(1000) });
    const image = await fetchScanImage("https://cdn.example.com/a.png", fetchImpl);
    assert.equal(image?.kind, "bytes");
    assert.equal(image?.kind === "bytes" ? image.bytes.byteLength : -1, 1000);
  });
  it("streams (never buffers) an oversize image", async () => {
    const { fetchImpl } = scripted({ "https://cdn.example.com/big.png": png(5 * 1024 * 1024) });
    const image = await fetchScanImage("https://cdn.example.com/big.png", fetchImpl);
    assert.equal(image?.kind, "stream");
    if (image?.kind === "stream") await image.stream.cancel();
  });
  it("an image declared beyond the stream cap is too large", async () => {
    const { fetchImpl } = scripted({ "https://cdn.example.com/huge.png": png(10, { "content-length": String(64 * 1024 * 1024) }) });
    assert.equal((await fetchScanImage("https://cdn.example.com/huge.png", fetchImpl))?.kind, "too_large");
  });
  it("a non-image answer is refused", async () => {
    const { fetchImpl } = scripted({ "https://cdn.example.com/a.png": () => new Response("<html>", { headers: { "content-type": "text/html" } }) });
    assert.equal(await fetchScanImage("https://cdn.example.com/a.png", fetchImpl), null);
  });
});

describe("ExplicitContentError", () => {
  it("carries category ids as details for the client to localize", () => {
    const err = new ExplicitContentError(["weapons", "profanity"], "image");
    assert.equal(err.code, "EXPLICIT_CONTENT");
    assert.equal(err.status, 422);
    assert.deepEqual(err.details, { categories: ["weapons", "profanity"], subject: "image" });
  });
});

describe("scheduled backfill query", () => {
  it("selects public wall videos with no scan, changed since their scan, or stale unscreened", () => {
    const db = getDb("postgresql://user:pass@localhost:5432/test");
    const { sql } = videosNeedingScanQuery(db, 5).toSQL();
    assert.match(sql, /"content_scans"\."id" is null/i);
    assert.match(sql, /"videos"\."updated_at" > "content_scans"\."scanned_at"/i);
    assert.match(sql, /now\(\) - interval '6 hours'/i);
    assert.match(sql, /"videos"\."show_on_home" = \$\d/i);
  });
});

describe("collectVideoScanInputs", () => {
  const timeline = {
    schemaVersion: 1, fps: 30, width: 1080, height: 1920, backgroundColor: "#000",
    tracks: [
      {
        id: "bg", kind: "video", clips: [
          { id: "s1", startFrame: 0, durationFrames: 90, effects: [{ kind: "canvas-v2:background", params: { label: "Intro" } }] },
        ],
      },
      {
        id: "w", kind: "video", clips: [
          { id: "c1", startFrame: 0, durationFrames: 90, effects: [{ kind: "widget", params: { headline: "Senior designer", src: "https://cdn.hired.video/uploads/u/images/a.png" } }] },
        ],
      },
      { id: "vo", kind: "audio", clips: [{ id: "a1", startFrame: 0, durationFrames: 90, effects: [{ kind: "voiceover", params: { script: "Hi, I'm Sam", url: "https://cdn.hired.video/vo.mp3" } }] }] },
    ],
  };

  it("collects title, owner card text, on-screen words, script, images (thumbnail first)", () => {
    const inputs = collectVideoScanInputs({
      title: "My reel",
      description: "About me",
      ownerName: "Sam Lee",
      ownerHeadline: "Designer",
      thumbnailUrl: "https://cdn.hired.video/thumb.jpg",
      timelineSpec: timeline,
      storyboard: null,
    });
    for (const word of ["My reel", "About me", "Sam Lee", "Designer", "Senior designer", "Hi, I'm Sam"]) {
      assert.ok(inputs.text.includes(word), `missing ${word}`);
    }
    assert.deepEqual(inputs.imageUrls, ["https://cdn.hired.video/thumb.jpg", "https://cdn.hired.video/uploads/u/images/a.png"]);
    assert.equal(inputs.imagesTruncated, false);
  });
  it("never treats audio / video URLs as images", () => {
    const inputs = collectVideoScanInputs({ title: null, description: null, ownerName: null, ownerHeadline: null, thumbnailUrl: null, timelineSpec: timeline, storyboard: null });
    assert.ok(!inputs.imageUrls.some((u) => u.endsWith(".mp3")));
  });
});

describe("public video feed — scan gate", () => {
  it("inner-joins a passing `video` scan and masks an unpassed profile headline", () => {
    const db = getDb("postgresql://user:pass@localhost:5432/test");
    const { sql } = publicVideoFeedQuery(db).toSQL();
    assert.match(sql, /inner join "content_scans"/i);
    assert.match(sql, /coalesce\("content_scans"\."override_verdict", "content_scans"\."verdict"\) = 'pass'/i);
    assert.match(sql, /left join "content_scans" "profile_scan"/i);
  });
});

/**
 * generateSocialCaption — the Post dock's "Write it for me", sized for the
 * networks the post goes to (#2045).
 *
 * Run: node --import tsx --test src/services/studio/__tests__/social-caption.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  composedLength,
  fitCaptionToBudget,
  generateSocialCaption,
  type CaptionSource,
} from "../social-caption.js";

const nleProject: CaptionSource = {
  kind: "nle",
  storyboard: null,
  resumeText: "",
  timelineSpec: {
    schemaVersion: 1, fps: 30, width: 1920, height: 1080, backgroundColor: "#000",
    tracks: [
      {
        id: "v1", kind: "video", label: "Background",
        clips: [{ id: "s1_bg", sourceId: "", startFrame: 0, durationFrames: 150, sourceInFrame: 0,
          effects: [{ kind: "canvas-v2:background", params: { label: "Hook" } }] }],
      },
      {
        id: "v2", kind: "video", label: "Widgets",
        clips: [{ id: "w1", sourceId: "", startFrame: 0, durationFrames: 150, sourceInFrame: 0,
          effects: [{ kind: "canvas-v2:text", params: { text: "Improved delivery from 57% to 85%" } }] }],
      },
    ],
  },
};

const LINKEDIN = { tone: "professional", platforms: ["linkedin"] } as const;

describe("generateSocialCaption", () => {
  it("sends the video's on-screen text to the model and accepts a fenced, #-prefixed answer", async () => {
    let sent = "";
    const post = await generateSocialCaption(nleProject, LINKEDIN, async (_system, user) => {
      sent = user;
      return '```json\n{"hook":"57% to 85%.","caption":"Here is how.","hashtags":["#Delivery","video-resume","#"]}\n```';
    });
    assert.match(sent, /Hook: Improved delivery from 57% to 85%/);
    assert.deepEqual(post, { hook: "57% to 85%.", caption: "Here is how.", hashtags: ["Delivery", "videoresume"] });
  });

  it("falls back to the heuristic post when no model is available", async () => {
    const post = await generateSocialCaption(nleProject, LINKEDIN, null);
    assert.equal(post.hook, "Hook: Improved delivery from 57% to 85%");
  });

  it("skips the model when the video has no words to write from", async () => {
    const empty: CaptionSource = { kind: "nle", storyboard: null, timelineSpec: null, resumeText: "" };
    const post = await generateSocialCaption(empty, LINKEDIN, async () => {
      throw new Error("must not be called");
    });
    assert.equal(post.hook, "Just published a new video resume on hired.video.");
  });

  it("throws when the model's answer is not a usable post", async () => {
    await assert.rejects(generateSocialCaption(nleProject, LINKEDIN, async () => "sorry, no"));
  });

  it("names every target network and the tightest budget in the prompt", async () => {
    let system = "";
    await generateSocialCaption(nleProject, { tone: "bold", platforms: ["linkedin", "x"] }, async (sys) => {
      system = sys;
      return '{"hook":"57% to 85%.","caption":"","hashtags":["delivery"]}';
    });
    assert.match(system, /LinkedIn, X \(Twitter\)/);
    assert.match(system, /fit in 280 characters/);
  });

  it("fits a long model answer into X's 280 characters", async () => {
    const post = await generateSocialCaption(nleProject, { tone: "professional", platforms: ["x"] }, async () =>
      JSON.stringify({
        hook: "Improved delivery from 57% to 85% in two quarters by rebuilding the release train.",
        caption: "Para one. ".repeat(60),
        hashtags: ["delivery", "engineering", "leadership", "devops", "hiring", "career"],
      }),
    );
    assert.ok(composedLength(post) <= 280, `composed ${composedLength(post)} chars`);
    assert.equal(post.caption, "");
    assert.ok(post.hashtags.length >= 1);
  });

  it("an empty platform list falls back to LinkedIn's budget (boundary)", async () => {
    const post = await generateSocialCaption(nleProject, { tone: "casual", platforms: [] }, null);
    assert.ok(composedLength(post) <= 3000);
  });
});

describe("fitCaptionToBudget", () => {
  const post = { hook: "Hook line", caption: "Body ".repeat(100), hashtags: ["one", "two", "three"] };

  it("leaves a post that fits untouched", () => {
    assert.deepEqual(fitCaptionToBudget(post, 3000), post);
  });

  it("drops the caption, then hashtags, then clips the hook", () => {
    assert.deepEqual(fitCaptionToBudget(post, 30), { hook: "Hook line", caption: "", hashtags: ["one", "two", "three"] });
    assert.deepEqual(fitCaptionToBudget(post, 16), { hook: "Hook line", caption: "", hashtags: ["one"] });
    const tiny = fitCaptionToBudget(post, 10);
    assert.ok(composedLength(tiny) <= 10, `composed ${composedLength(tiny)}`);
  });
});

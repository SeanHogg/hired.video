import { describe, expect, it } from "vitest";
import { VideoPlanSchema, type VideoPlan } from "@shared/video-plan";
import { sceneVoiceoverTexts } from "../scene-voiceover";
import {
  sceneSpeaker,
  voiceStatus,
  voiceStatusLabel,
  withAiEverywhere,
  withTake,
  withUploadedFile,
  withVoice,
  withoutVoice,
} from "../voice-state";

const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key);
const take = { url: "https://cdn.hired.video/uploads/take-hook.webm", durationSeconds: 4.2 };
// The on-screen lines a fresh kit video narrates (spokenLines output shape).
const lines = {
  hook: "Open to new roles. Looking for my next Fractional CTO / VP of Technology role.",
  who: "Sean Hogg. Fractional CTO.",
  proof: "25 years running enterprise IT.",
  skills: "Skills. Cloud, Security, AI.",
  next: "What's next. Open to Fractional CTO roles.",
};

describe("voiceStatus", () => {
  it("a fresh video (no voice, no words) is silent — nothing is picked", () => {
    expect(voiceStatus({})).toEqual({ kind: "none", scenes: 5, voiced: 0, takes: 0, voiceId: undefined });
  });

  it("an AI voice with no words anywhere is still silent (the old 'Add to all' trap)", () => {
    expect(voiceStatus({ voice: { source: "ai", voiceId: "af_heart" } }).kind).toBe("none");
  });

  it("counts voiced scenes and takes, skipping scenes left out", () => {
    const plan: VideoPlan = {
      voice: { source: "recorded", voiceId: "af_heart" },
      scenes: { hook: { voiceClip: take }, who: { voiceover: "Hi" }, proof: { voiceover: "x", off: true } },
    };
    expect(voiceStatus(plan)).toEqual({ kind: "recorded", scenes: 4, voiced: 2, takes: 1, voiceId: "af_heart" });
  });

  it("an uploaded file voices the whole video", () => {
    const plan = withUploadedFile({}, { url: "https://cdn.hired.video/uploads/pitch.m4a", durationSeconds: 28 });
    expect(voiceStatus(plan)).toMatchObject({ kind: "upload", voiced: 5 });
  });

  it("'none' silences every scene but keeps the words", () => {
    const plan = withoutVoice({ scenes: { hook: { voiceover: "Hi" } }, voice: { source: "ai" } });
    expect(sceneSpeaker(plan, plan.scenes?.hook)).toBe("none");
    expect(plan.scenes?.hook?.voiceover).toBe("Hi");
    expect(sceneVoiceoverTexts(plan)).toEqual({});
  });
});

describe("voice edits", () => {
  it("picking a voice narrates every scene: empty scenes get their on-screen line, written words stay", () => {
    const plan = withVoice({ scenes: { who: { voiceover: "My own words." }, next: { off: true } } }, "af_heart", lines);
    expect(plan.voice).toEqual({ source: "ai", voiceId: "af_heart" });
    expect(plan.scenes?.hook?.voiceover).toBe(lines.hook);
    expect(plan.scenes?.who?.voiceover).toBe("My own words.");
    expect(plan.scenes?.next?.voiceover).toBeUndefined();
    expect(voiceStatus(plan)).toMatchObject({ kind: "ai", voiced: 4, scenes: 4 });
    expect(VideoPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("picking a voice over takes keeps them (the voice fills the rest)", () => {
    const plan = withVoice(withTake({}, "hook", take), "am_adam", lines);
    expect(plan.voice).toEqual({ source: "recorded", voiceId: "am_adam" });
    expect(voiceStatus(plan)).toMatchObject({ kind: "recorded", takes: 1, voiced: 5 });
  });

  it("'use the voice everywhere' lets every take go and keeps the picked voice", () => {
    const plan = withAiEverywhere(withVoice(withTake({}, "hook", take), "am_adam", lines));
    expect(plan.voice).toEqual({ source: "ai", voiceId: "am_adam" });
    expect(plan.scenes?.hook?.voiceClip).toBeUndefined();
  });

  it("a voice line longer than the schema's cap is cut, so the plan still saves", () => {
    const plan = withVoice({}, "af_heart", { hook: "a".repeat(900) });
    expect(plan.scenes?.hook?.voiceover).toHaveLength(600);
    expect(VideoPlanSchema.safeParse(plan).success).toBe(true);
  });

  it("the schema accepts the 'none' source and rejects extra keys on it", () => {
    expect(VideoPlanSchema.safeParse({ voice: { source: "none" } }).success).toBe(true);
    expect(VideoPlanSchema.safeParse({ voice: { source: "none", voiceId: "x" } }).success).toBe(false);
  });
});

describe("voiceStatusLabel", () => {
  it("one wording per kind", () => {
    expect(voiceStatusLabel(voiceStatus({}), "Heart", t)).toBe("build.voice.status.none");
    expect(voiceStatusLabel({ kind: "ai", scenes: 5, voiced: 5, takes: 0 }, "Heart", t)).toBe('build.voice.status.ai:{"name":"Heart","voiced":5,"count":5}');
    expect(voiceStatusLabel({ kind: "recorded", scenes: 5, voiced: 5, takes: 2 }, "Heart", t)).toBe('build.voice.status.recorded:{"takes":2,"count":5}');
    expect(voiceStatusLabel({ kind: "upload", scenes: 5, voiced: 5, takes: 0 }, "Heart", t)).toBe("build.voice.status.upload");
  });
});

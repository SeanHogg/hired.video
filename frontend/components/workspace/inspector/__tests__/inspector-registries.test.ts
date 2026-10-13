/**
 * The three kit inspectors' rows, as the A2 boards list them:
 *   résumé  Wording · Findings · Job match | + Font & size · Spacing · Colour · Page
 *   letter  To · Highlights · Tone          | + Font & size · Spacing · Page
 *   video   Words on screen · Voice · Length | + Background … Export
 * and their hints ("say how", "3 from your résumé", "Warm", "yours").
 */
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { CoverLetterSchema, type CoverLetter } from "@shared/cover-letter";
import { DEFAULT_DESCRIPTOR } from "@/types/resume-template";
import { applyResumeStyle } from "@/lib/build/resume-style";
import { withRewrittenBody } from "@/lib/build/cover-letter/use-letter-tone";
import { drillIdsAt } from "../inspector-drills";
import { LINE_DRILLS } from "@/components/build/this-line/line-drills";
import type { LineDrillProps } from "@/components/build/this-line/types";
import { LETTER_DRILLS, letterRecipient } from "@/components/build/cover-letter/letter-drills";
import type { LetterDrillProps } from "@/components/build/cover-letter/letter-types";
import { pressedTone } from "@/components/build/cover-letter/drills/LetterToneDrill";
import { SCENE_DRILLS, sceneVoiceHint } from "@/components/build/video-design/scene/scene-drills";
import type { BuildVideo } from "@/lib/build/use-build-video";
import { letterInspectorTitle } from "@/components/workspace/kit/useKitLetterSlotPanel";

const t = ((key: string, opts?: Record<string, unknown>) => (opts ? `${key}${JSON.stringify(opts)}` : key)) as unknown as TFunction;

const letter: CoverLetter = CoverLetterSchema.parse({
  jobTitle: "Chief Information Officer",
  organization: "Macomb Community College",
  recipientLines: ["", "Search Committee", "14500 E 12 Mile Rd"],
  salutation: "Dear Members of the Search Committee:",
  opening: ["I am writing to apply."],
  highlights: [
    { label: "Scale", text: "Ran IT for 40,000 students." },
    { label: "Cost", text: "Cut costs 43%." },
    { label: "", text: "Led a cloud move." },
  ],
  signOff: "Sincerely,",
  date: "2026-10-10",
});

describe("row order and depth", () => {
  it("résumé: three simple rows, the look appended under Advanced", () => {
    expect(drillIdsAt(LINE_DRILLS, "simple")).toEqual(["wording", "findings", "match"]);
    expect(drillIdsAt(LINE_DRILLS, "advanced")).toEqual(["font", "spacing", "colour", "page"]);
  });

  it("letter: To · Highlights · Tone, then Font & size · Spacing · Page", () => {
    expect(drillIdsAt(LETTER_DRILLS, "simple")).toEqual(["to", "highlights", "tone"]);
    expect(drillIdsAt(LETTER_DRILLS, "advanced")).toEqual(["font", "spacing", "page"]);
  });

  it("video: Words · Voice · Length, then the eight drill-ins", () => {
    expect(drillIdsAt(SCENE_DRILLS, "simple")).toEqual(["words", "voice", "length"]);
    expect(drillIdsAt(SCENE_DRILLS, "advanced")).toHaveLength(8);
  });
});

describe("résumé hints", () => {
  const ctx = (suggestions: number, style = {}): LineDrillProps =>
    ({
      data: { suggestions: Array.from({ length: suggestions }, (_, i) => ({ id: String(i), text: "x" })), findings: [], jobMatch: null },
      design: { style, setStyle: () => {}, descriptor: applyResumeStyle(DEFAULT_DESCRIPTOR, style) },
    }) as unknown as LineDrillProps;

  it("Wording says how when nothing is suggested, else counts the suggestions", () => {
    expect(LINE_DRILLS.drills.wording.hint?.(ctx(0), t)).toBe("build.thisLine.wording.hintNone");
    expect(LINE_DRILLS.drills.wording.hint?.(ctx(2), t)).toBe('build.thisLine.wording.hint{"count":2}');
  });

  it("the look rows show the current value and mark what was changed", () => {
    expect(LINE_DRILLS.drills.page.hint?.(ctx(0, { paper: "a4" }), t)).toBe("workspace.letter.style.a4");
    expect(LINE_DRILLS.drills.page.isSet?.(ctx(0, { paper: "a4" }))).toBe(true);
    expect(LINE_DRILLS.drills.colour.isSet?.(ctx(0))).toBe(false);
  });
});

describe("letter", () => {
  const ctx = (l: CoverLetter): LetterDrillProps => ({ letter: l, onChange: undefined, tone: {} as LetterDrillProps["tone"] });

  it("To names the first address line, else the organisation", () => {
    expect(letterRecipient(letter)).toBe("Search Committee");
    expect(letterRecipient({ ...letter, recipientLines: [] })).toBe("Macomb Community College");
    expect(letterRecipient({ ...letter, recipientLines: [], organization: " " })).toBeNull();
  });

  it("Highlights counts them; Tone shows the stored tone", () => {
    expect(LETTER_DRILLS.drills.highlights.hint?.(ctx(letter), t)).toBe('workspace.letter.highlightsHint{"count":3}');
    expect(LETTER_DRILLS.drills.tone.hint?.(ctx(letter), t)).toBeNull();
    expect(LETTER_DRILLS.drills.tone.hint?.(ctx({ ...letter, tone: "warm" }), t)).toBe("workspace.letter.tone.warm");
  });

  it("Apply stores the tone with the rewritten body", () => {
    const applied = withRewrittenBody({ ...letter, salutation: "Hi team," }, { ...letter, opening: ["Warmer."] }, "warm");
    expect(applied).toMatchObject({ opening: ["Warmer."], salutation: "Hi team,", tone: "warm" });
    expect(CoverLetterSchema.parse(applied).tone).toBe("warm");
  });

  it("the pressed chip: the letter's tone at rest, the one in flight otherwise", () => {
    expect(pressedTone({ ...letter, tone: "formal" }, { status: "idle", tone: null })).toBe("formal");
    expect(pressedTone({ ...letter, tone: "formal" }, { status: "rewriting", tone: "brief" })).toBe("brief");
  });

  it("the title is the organisation · role, else Cover letter", () => {
    expect(letterInspectorTitle(t, letter)).toBe("Macomb Community College · Chief Information Officer");
    expect(letterInspectorTitle(t, { organization: "", jobTitle: "CIO" })).toBe("CIO");
    expect(letterInspectorTitle(t, { organization: " ", jobTitle: "" })).toBe("build.letter.title");
  });
});

describe("video Voice hint", () => {
  const video = (voice?: unknown) => ({ plan: { voice } }) as unknown as BuildVideo;
  const clip = { voiceClip: { url: "https://x.test/t.webm", durationSeconds: 2 } } as never;

  it("yours for a played take, uploaded for a file, AI for words, else none", () => {
    expect(sceneVoiceHint({ scene: clip, video: video({ source: "recorded" }) }, t)).toBe("build.sceneInspector.voiceHint.yours");
    expect(sceneVoiceHint({ scene: {}, video: video({ source: "upload", url: "https://x.test/a.mp3", durationSeconds: 3 }) }, t)).toBe("build.sceneInspector.voiceHint.uploaded");
    expect(sceneVoiceHint({ scene: { voiceover: "Hi" }, video: video({ source: "ai" }) }, t)).toBe("build.sceneInspector.voiceHint.ai");
    // No words, or the voice switched off: nobody speaks — never a false "AI".
    expect(sceneVoiceHint({ scene: {}, video: video({ source: "ai" }) }, t)).toBe("build.sceneInspector.voiceHint.none");
    expect(sceneVoiceHint({ scene: { voiceover: "Hi" }, video: video({ source: "none" }) }, t)).toBe("build.sceneInspector.voiceHint.none");
    // A take that isn't played (the voice is AI) isn't "yours".
    expect(sceneVoiceHint({ scene: clip, video: video({ source: "ai" }) }, t)).toBe("build.sceneInspector.voiceHint.none");
  });
});

/**
 * The shared explicit lexicon: whole-word matching that keeps ordinary
 * career copy clean, while common evasions (masking, leetspeak) still match.
 *
 * Run: cd api && node --import tsx --test ../shared/__tests__/explicit-lexicon.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { HARMFUL_SLURS, lexiconTermsIn, matchExplicitLexicon } from "../moderation/explicit-lexicon.js";

const categoriesOf = (text: string) => [...new Set(matchExplicitLexicon(text).map((m) => m.category))].sort();

describe("explicit lexicon — no false positives on career copy", () => {
  const clean = [
    "Grew up in Scunthorpe, now leading assessment design for a cocktail bar group.",
    "Shooting for goals: I aim to ship weekly and hit every quarterly target.",
    "Ran the photo shoot and the video shoot for our product launch.",
    "Used a nail gun and a staple gun daily as a framing carpenter.",
    "Graduated magna cum laude; summa cum laude in my master's.",
    "Bullet points, explosive growth, killing it in interviews — I execute.",
    "Passed the class assessment and joined Sussex analytics as an analyst.",
    "Restored a Wankel rotary engine; cooked shiitake risotto; read Dickens.",
    "We found the smoking gun in the logs and didn't jump the gun on the fix.",
    "Assisted with the bath bomb product line at a cosmetics start-up.",
    "Trained teams on sexual harassment prevention policies.",
    "Methodology, therapist, analyst, grape, scrapbook, Hancock, peacock.",
    "Found the chink in their armor and sold the fire retardant line.",
  ];
  for (const text of clean) {
    it(`passes: ${text.slice(0, 48)}…`, () => {
      assert.deepEqual(matchExplicitLexicon(text), [], `false positive: ${JSON.stringify(matchExplicitLexicon(text))}`);
    });
  }
});

describe("explicit lexicon — matches explicit terms", () => {
  it("weapons: gun / rifle / AK-47", () => {
    assert.deepEqual(categoriesOf("Here is my gun collection"), ["weapons"]);
    assert.deepEqual(categoriesOf("posing with an AK-47"), ["weapons"]);
    assert.deepEqual(categoriesOf("two rifles on the wall"), ["weapons"]);
  });

  it("sexual: porn and variants", () => {
    assert.deepEqual(categoriesOf("watch porn"), ["sexual"]);
    assert.deepEqual(categoriesOf("pornographic clips"), ["sexual"]);
    assert.deepEqual(categoriesOf("p0rn links"), ["sexual"]);
  });

  it("profanity: f*ck variants (masked, leet, spelled)", () => {
    for (const text of ["f*ck this", "f**k that", "what the fuck", "fucking great", "fuk", "sh*t happens", "sh1t", "a**hole boss"]) {
      assert.deepEqual(categoriesOf(text), ["profanity"], `missed: ${text}`);
    }
  });

  it("drugs and violence", () => {
    assert.deepEqual(categoriesOf("selling cocaine"), ["drugs"]);
    assert.deepEqual(categoriesOf("a gory beheading"), ["violence"]);
  });

  it("hate: every shared slur matches as a whole word", () => {
    for (const slur of HARMFUL_SLURS) {
      assert.ok(lexiconTermsIn(`you ${slur}`, "hate").includes(slur), `missed slur ${slur}`);
    }
  });

  it("reports each canonical term once", () => {
    const terms = lexiconTermsIn("shit fuck piss shit FUCK", "profanity");
    assert.deepEqual(terms, ["fuck", "shit", "piss"]);
  });

  it("an idiom does not hide a real hit elsewhere in the text", () => {
    assert.deepEqual(categoriesOf("Used a nail gun at work, and I also own a gun"), ["weapons"]);
  });

  it("ignores empty / non-string input", () => {
    assert.deepEqual(matchExplicitLexicon(""), []);
    assert.deepEqual(matchExplicitLexicon(null), []);
    assert.deepEqual(matchExplicitLexicon(undefined), []);
  });
});

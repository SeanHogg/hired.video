/**
 * A dropped cover letter's text → the letter the workspace edits
 * (shared/cover-letter.ts coverLetterFromText). Fixtures mirror real
 * letters: a salutation, paragraphs wrapped across lines, a sign-off and a
 * name; Windows line endings; no salutation; not a letter at all.
 */
import { describe, expect, it } from "vitest";
import { coverLetterFromText } from "@shared/cover-letter";

const DEFAULTS = { salutation: "Dear Hiring Manager,", signOff: "Sincerely,", date: "2026-10-08" };

const LETTER = `Dear Members of the Search Committee:

I am writing to apply for the Chief Information Officer role at Macomb
Community College. Over twenty years I have led IT for public institutions.

At Waukesha County I cut infrastructure costs by $1.79M while
moving 40 systems to the cloud.

I would welcome the chance to discuss how I can serve Macomb.

Sincerely,

Sean Hogg`;

describe("coverLetterFromText", () => {
  it("reads the salutation, opening, closing and sign-off; drops the name", () => {
    const letter = coverLetterFromText(LETTER, DEFAULTS)!;
    expect(letter.salutation).toBe("Dear Members of the Search Committee:");
    expect(letter.opening).toEqual([
      "I am writing to apply for the Chief Information Officer role at Macomb Community College. Over twenty years I have led IT for public institutions.",
    ]);
    expect(letter.closing).toHaveLength(2);
    expect(letter.closing[1]).toBe("I would welcome the chance to discuss how I can serve Macomb.");
    expect(letter.signOff).toBe("Sincerely,");
    expect(letter.date).toBe("2026-10-08");
  });

  it("handles Windows line endings", () => {
    expect(coverLetterFromText(LETTER.replace(/\n/g, "\r\n"), DEFAULTS)?.salutation).toBe("Dear Members of the Search Committee:");
  });

  it("fills a missing salutation and sign-off from the reader's language", () => {
    const letter = coverLetterFromText("I want this job.\n\nI have done it before.", DEFAULTS)!;
    expect(letter.salutation).toBe(DEFAULTS.salutation);
    expect(letter.signOff).toBe(DEFAULTS.signOff);
    expect(letter.opening).toEqual(["I want this job."]);
  });

  it("is null when there is no body", () => {
    expect(coverLetterFromText("", DEFAULTS)).toBeNull();
    expect(coverLetterFromText("Dear team,\n\nSincerely,\nMe", DEFAULTS)).toBeNull();
  });
});

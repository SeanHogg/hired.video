/**
 * Client side of the explicit-content gate: the localized 422
 * EXPLICIT_CONTENT message built from category ids (never the API's English
 * sentence).
 */
import { describe, expect, it } from "vitest";
import {
  EXPLICIT_CONTENT_CODE,
  explicitContentMessage,
  explicitInfoFrom,
  formatExplicitCategories,
  isExplicitContentError,
} from "../explicit-content-error";

const fakeT = (key: string, options?: Record<string, unknown>) =>
  options?.categories ? `${key}[${String(options.categories)}]` : key;

describe("explicit-content message", () => {
  it("reads category ids + subject from error details, dropping unknown ids", () => {
    expect(explicitInfoFrom({ categories: ["weapons", "bogus", "sexual"], subject: "image", _source: "x" })).toEqual({
      categories: ["sexual", "weapons"],
      subject: "image",
    });
    expect(explicitInfoFrom(undefined)).toEqual({ categories: [], subject: "text" });
  });
  it("lists localized category labels in the viewer's language", () => {
    expect(formatExplicitCategories(["weapons", "profanity"], fakeT, "en")).toBe(
      "moderation.category.weapons and moderation.category.profanity",
    );
    expect(formatExplicitCategories(["weapons", "profanity"], fakeT, "fr-CA")).toBe(
      "moderation.category.weapons et moderation.category.profanity",
    );
  });
  it("picks the image / text sentence, with a generic fallback", () => {
    expect(explicitContentMessage({ categories: ["drugs"], subject: "image" }, fakeT, "en")).toBe(
      "moderation.blocked.image[moderation.category.drugs]",
    );
    expect(explicitContentMessage({ categories: [], subject: "text" }, fakeT, "en")).toBe("moderation.blocked.textGeneric");
  });
  it("recognises the api-client error by its server code", () => {
    expect(isExplicitContentError({ context: { serverCode: EXPLICIT_CONTENT_CODE } })).toBe(true);
    expect(isExplicitContentError({ context: { serverCode: "VALIDATION_ERROR" } })).toBe(false);
    expect(isExplicitContentError(new Error("x"))).toBe(false);
  });
});

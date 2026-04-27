import { describe, it, expect } from "vitest";
import { toWLanguage } from "@/lib/i18n/i18n";

describe("toWLanguage", () => {
  it("replaces ASCII letters with W (case-preserving)", () => {
    expect(toWLanguage("Hello World")).toBe("Wwwww Wwwww");
  });

  it("leaves spaces, digits and punctuation untouched", () => {
    expect(toWLanguage("Order #42 — done!")).toBe("Wwwww #42 — wwww!");
  });

  it("handles unicode letters (accented Spanish)", () => {
    // Spanish 'ñ' / accents must still be recognised as letters.
    expect(toWLanguage("Año Español")).toBe("Www Wwwwwww");
  });

  it("returns an empty string unchanged", () => {
    expect(toWLanguage("")).toBe("");
  });
});

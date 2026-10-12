import { describe, expect, it } from "vitest";
import { parseStudioEntryParams } from "@/lib/studio/use-studio-entry-params";

describe("parseStudioEntryParams", () => {
  it("opens the Post panel for ?share=1 (promotion-notification deep link)", () => {
    expect(parseStudioEntryParams(new URLSearchParams("share=1"))).toEqual({
      shareOnLoad: true,
    });
  });

  it("defaults when nothing is passed", () => {
    expect(parseStudioEntryParams(new URLSearchParams(""))).toEqual({
      shareOnLoad: false,
    });
  });

  it("only share=1 opens the panel", () => {
    expect(parseStudioEntryParams(new URLSearchParams("share=true")).shareOnLoad).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { parseStudioEntryParams } from "@/lib/studio/use-studio-entry-params";

describe("parseStudioEntryParams", () => {
  it("opens the Post panel for ?share=1 (promotion-notification deep link)", () => {
    expect(parseStudioEntryParams(new URLSearchParams("share=1"))).toEqual({
      shareOnLoad: true,
      renderOnLoad: false,
    });
  });

  it("renders on load for ?render=1 (Chrome extension Render & post)", () => {
    expect(parseStudioEntryParams(new URLSearchParams("render=1"))).toEqual({
      shareOnLoad: false,
      renderOnLoad: true,
    });
  });

  it("defaults when nothing is passed", () => {
    expect(parseStudioEntryParams(new URLSearchParams(""))).toEqual({
      shareOnLoad: false,
      renderOnLoad: false,
    });
  });

  it("only share=1 opens the panel and only render=1 renders", () => {
    expect(parseStudioEntryParams(new URLSearchParams("share=true")).shareOnLoad).toBe(false);
    expect(parseStudioEntryParams(new URLSearchParams("render=yes")).renderOnLoad).toBe(false);
  });
});

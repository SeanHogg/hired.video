import { describe, expect, it } from "vitest";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { TEMPLATE_CATALOG } from "@/lib/studio/templates/catalog";
import {
  isWorkspaceTemplate,
  kitStartForTemplate,
  workspaceHrefForTemplate,
} from "../career-starts";

describe("career starts", () => {
  it("sends the résumé and video-résumé templates to the kit workspace", () => {
    expect(workspaceHrefForTemplate("resume")).toBe(`${NEW_KIT_PATH}?start=video`);
    expect(workspaceHrefForTemplate("resume_doc")).toBe(`${NEW_KIT_PATH}?start=resume`);
  });

  it("accepts URL slugs as well as catalog ids", () => {
    expect(workspaceHrefForTemplate("resume-doc")).toBe(`${NEW_KIT_PATH}?start=resume`);
    expect(isWorkspaceTemplate(" resume ")).toBe(true);
  });

  it("leaves every other template in the studio", () => {
    expect(workspaceHrefForTemplate("profile")).toBeNull();
    expect(workspaceHrefForTemplate("podcast_trailer")).toBeNull();
    expect(workspaceHrefForTemplate(null)).toBeNull();
    expect(workspaceHrefForTemplate("")).toBeNull();
  });

  it("only names templates that exist in the catalog", () => {
    const ids = new Set(TEMPLATE_CATALOG.map((t) => t.id as string));
    // The kit's templates, and the New menu's "Promote yourself".
    for (const id of ["resume", "resume_doc", "personal_brand"]) expect(ids.has(id)).toBe(true);
  });

  it("leads a template's kit with the slot it names", () => {
    expect(kitStartForTemplate("resume")).toBe("video");
    expect(kitStartForTemplate("resume-doc")).toBe("resume");
    expect(kitStartForTemplate("profile")).toBeNull();
  });
});

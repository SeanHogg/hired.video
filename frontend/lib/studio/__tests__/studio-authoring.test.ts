/**
 * studio-authoring — the one rule for "open / start entity X in the studio"
 * (#1955 T0.3, company added with #1915).
 */
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_AUTHORING_KINDS,
  STUDIO_EDIT_PARAMS,
  documentEntitySubject,
  studioEditHref,
  studioNewEntityHref,
} from "../studio-authoring";
import { getTemplate } from "../templates/catalog";

const COMPANY_ID = "c7a1e5d3-2b4f-4a6c-8e9d-0f1a2b3c4d5e";

describe("studio-authoring", () => {
  it("every authoring kind has an edit deep link and a real input template of its own kind", () => {
    for (const kind of DOCUMENT_AUTHORING_KINDS) {
      expect(studioEditHref(kind, "x")).toMatch(/^\/studio\?edit[A-Z]\w+=x$/);
      const templateId = new URLSearchParams(studioNewEntityHref(kind).split("?")[1]).get("contentTemplate");
      const template = getTemplate(templateId as never);
      expect(template.mediaKind, kind).toBe("document");
      expect(template.documentEntityKind, kind).toBe(kind);
    }
    expect(STUDIO_EDIT_PARAMS).toEqual(expect.arrayContaining(["editJob", "editArticle", "editCompany", "editResume"]));
  });

  it("encodes the id", () => {
    expect(studioEditHref("company", "a b")).toBe("/studio?editCompany=a%20b");
  });

  it("links a document to the entity row its first save created", () => {
    expect(documentEntitySubject("company", COMPANY_ID)).toEqual({ kind: "company", id: COMPANY_ID });
    expect(documentEntitySubject("job", "j1")).toEqual({ kind: "job", id: "j1" });
  });

  it("no subject for an unbound draft or a kind not authored here (boundary)", () => {
    expect(documentEntitySubject("company", null)).toBeNull();
    expect(documentEntitySubject("resume", "r1")).toBeNull();
    expect(documentEntitySubject("blog", "b1")).toBeNull();
  });
});

/**
 * Every linked-content kind's `viewUrl` is the entity's PUBLIC page an
 * anonymous viewer can open (#2312): the watch page links it and an export
 * prints it as text + QR. Never an owner / editor route.
 *
 * Run: vitest run lib/studio/editor-v2/__tests__/linked-content-view-urls.test.ts
 */
import { describe, expect, it } from "vitest";
import { LINKED_CONTENT_REGISTRY, type LinkedContentKind } from "@/lib/studio/editor-v2/linked-content";

const ID = "3f6c1d2e-8a41-4b6f-9a0e-2d5c7b9e1a44";

const EXPECTED: Record<LinkedContentKind, string> = {
  video: `/m/${ID}`,
  article: `/articles/by-id/${ID}`,
  company: `/companies/${ID}`,
  job: `/jobs/${ID}`,
  profile: `/people/${ID}`,
  resume: `/resumes/${ID}`,
  template: `/marketplace/templates/${ID}`,
};

const KINDS = Object.keys(LINKED_CONTENT_REGISTRY) as LinkedContentKind[];

describe("linked-content viewUrl", () => {
  it("covers every registered kind", () => {
    expect(KINDS.sort()).toEqual((Object.keys(EXPECTED) as LinkedContentKind[]).sort());
  });

  it("a video links to its public watch page, not the editor", () => {
    expect(LINKED_CONTENT_REGISTRY.video.viewUrl(ID)).toBe(`/m/${ID}`);
  });

  it.each(KINDS)("%s → its public page", (kind) => {
    expect(LINKED_CONTENT_REGISTRY[kind].viewUrl(ID)).toBe(EXPECTED[kind]);
  });

  it.each(KINDS)("%s never links to a /studio (editor) route", (kind) => {
    expect(LINKED_CONTENT_REGISTRY[kind].viewUrl(ID).startsWith("/studio")).toBe(false);
  });
});

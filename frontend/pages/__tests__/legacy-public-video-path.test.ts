/**
 * #1218 — `/v/<id>` is the legacy watch alias; `/m/<id>` is canonical.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalMediaPath,
  matchPublicMediaPath,
  publicAtsSlugFrom,
  publicMediaIdFrom,
} from "../legacy-public-video-path";

describe("matchPublicMediaPath", () => {
  it("parses /m/<id> and /v/<id>", () => {
    expect(matchPublicMediaPath("/m/maria-alvarez-reel")).toEqual({
      kind: "media",
      id: "maria-alvarez-reel",
    });
    expect(matchPublicMediaPath("/v/maria-alvarez-reel")).toEqual({
      kind: "media",
      id: "maria-alvarez-reel",
    });
  });

  it("parses /m/ats/<slug> and /v/ats/<slug>", () => {
    expect(matchPublicMediaPath("/m/ats/acme-pack")).toEqual({
      kind: "ats",
      slug: "acme-pack",
    });
    expect(matchPublicMediaPath("/v/ats/acme-pack")).toEqual({
      kind: "ats",
      slug: "acme-pack",
    });
  });

  it("decodes a percent-encoded segment", () => {
    expect(matchPublicMediaPath("/m/a%2Fb%3Fc")).toEqual({
      kind: "media",
      id: "a/b?c",
    });
  });

  it("rejects /v/ats with no slug and unrelated paths", () => {
    expect(matchPublicMediaPath("/v/ats")).toBeNull();
    expect(matchPublicMediaPath("/v/")).toBeNull();
    expect(matchPublicMediaPath("/m/")).toBeNull();
    expect(matchPublicMediaPath("/videos/foo")).toBeNull();
    expect(matchPublicMediaPath("/m/foo/bar")).toBeNull();
  });
});

describe("canonicalMediaPath", () => {
  it("rewrites /v/<id> to /m/<id> and keeps search + hash", () => {
    expect(canonicalMediaPath("/v/abc", "?utm=1", "#t=3")).toBe("/m/abc?utm=1#t=3");
  });

  it("rewrites /v/ats/<slug> to /m/ats/<slug>", () => {
    expect(canonicalMediaPath("/v/ats/acme-pack")).toBe("/m/ats/acme-pack");
  });

  it("returns null on an already-canonical /m/ path", () => {
    expect(canonicalMediaPath("/m/abc")).toBeNull();
    expect(canonicalMediaPath("/m/ats/acme-pack")).toBeNull();
  });

  it("returns null for non-watch paths", () => {
    expect(canonicalMediaPath("/resumes/r1")).toBeNull();
  });
});

describe("publicMediaIdFrom / publicAtsSlugFrom", () => {
  it("prefers the router param over the pathname", () => {
    expect(publicMediaIdFrom({ videoId: "from-param" }, "/m/from-path")).toBe(
      "from-param",
    );
    expect(publicAtsSlugFrom({ slug: "param-slug" }, "/m/ats/path-slug")).toBe(
      "param-slug",
    );
  });

  it("falls back to the pathname when params are empty (NotFound mount)", () => {
    expect(publicMediaIdFrom({}, "/m/from-path")).toBe("from-path");
    expect(publicAtsSlugFrom({}, "/m/ats/path-slug")).toBe("path-slug");
  });
});

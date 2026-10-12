import { describe, it, expect } from "vitest";
import {
  HOME_ANCHOR_IDS,
  PUBLIC_NAV_LINKS,
  PUBLIC_SECONDARY_LINKS,
  isPublicNavLinkActive,
} from "../public-nav";

describe("PUBLIC_NAV_LINKS", () => {
  it("is Watch · How it works · Tools · Templates · Pricing, in that order", () => {
    expect(PUBLIC_NAV_LINKS.map((l) => [l.labelKey, l.href])).toEqual([
      ["nav.links.watch", "/#watch"],
      ["nav.links.howItWorks", "/#how-it-works"],
      ["nav.links.tools", "/tools"],
      ["nav.links.templates", "/templates"],
      ["labels.pricing", "/pricing"],
    ]);
  });

  it("links the section entries to the home-page section ids", () => {
    expect(PUBLIC_NAV_LINKS[0].section).toBe(HOME_ANCHOR_IDS.watch);
    expect(PUBLIC_NAV_LINKS[1].section).toBe(HOME_ANCHOR_IDS.howItWorks);
  });

  it("keeps Rewards out of the top bar (secondary list only)", () => {
    expect(PUBLIC_NAV_LINKS.some((l) => l.href === "/rewards")).toBe(false);
    expect(PUBLIC_SECONDARY_LINKS.map((l) => l.href)).toEqual(["/rewards"]);
  });
});

describe("isPublicNavLinkActive", () => {
  const [watch, how, tools, templates, pricing] = PUBLIC_NAV_LINKS;

  it("marks the route link for the current page and its sub-pages", () => {
    expect(isPublicNavLinkActive(templates, "/templates")).toBe(true);
    expect(isPublicNavLinkActive(tools, "/tools/ai-resume-scorer")).toBe(true);
    expect(isPublicNavLinkActive(pricing, "/templates")).toBe(false);
  });

  it("does not match a path that merely shares a prefix", () => {
    expect(isPublicNavLinkActive(tools, "/toolshed")).toBe(false);
  });

  it("never marks section links, even on the home page", () => {
    expect(isPublicNavLinkActive(watch, "/")).toBe(false);
    expect(isPublicNavLinkActive(how, "/")).toBe(false);
  });
});

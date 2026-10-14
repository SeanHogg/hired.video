import { describe, it, expect } from "vitest";
import { ALL_AUDIENCES, AUDIENCES, AUDIENCE_BY_ID, enabledAudiences, getAudience } from "@/lib/studio/templates/audiences";
import { isCreateIntent } from "@/lib/studio/create-intent";

describe("AUDIENCES registry", () => {
  it("contains a unique entry per Audience id", () => {
    const ids = AUDIENCES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has a non-empty label + blurb (drives chips + tooltips)", () => {
    for (const a of AUDIENCES) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.blurb.length).toBeGreaterThan(0);
    }
  });

  it("every registry entry declares landing-page fields (#2364)", () => {
    const arts = new Set(["resume", "reel", "brand"]);
    for (const a of ALL_AUDIENCES) {
      expect(a.heroCopy.length, a.id).toBeGreaterThan(0);
      expect(arts.has(a.heroArt), a.id).toBe(true);
      expect(a.proof.length, a.id).toBeGreaterThan(0);
      expect(isCreateIntent(a.createIntent), a.id).toBe(true);
    }
  });

  it("AUDIENCE_BY_ID is the inverse index of AUDIENCES", () => {
    expect(Object.keys(AUDIENCE_BY_ID).length).toBe(AUDIENCES.length);
    for (const a of AUDIENCES) {
      expect(AUDIENCE_BY_ID[a.id]).toBe(a);
    }
  });
});

describe("getAudience", () => {
  it("returns the def for a known id", () => {
    expect(getAudience("athlete").label).toBe("Athletes");
    expect(getAudience("voice_actor").label).toBe("Voice actors");
  });

  it("covers every id reachable from the union", () => {
    for (const a of ALL_AUDIENCES) {
      expect(getAudience(a.id).id).toBe(a.id);
    }
  });
});

describe("enabledAudiences (hiring persona switch)", () => {
  it("drops recruiter + employer while hiring is off, keeps every other audience", () => {
    const ids = enabledAudiences(false).map((a) => a.id);
    expect(ids).not.toContain("recruiter");
    expect(ids).not.toContain("employer");
    expect(ids).toContain("job_seeker");
    expect(ids).toContain("creator");
  });

  it("restores recruiter + employer when hiring is on", () => {
    const ids = enabledAudiences(true).map((a) => a.id);
    expect(ids).toContain("recruiter");
    expect(ids).toContain("employer");
  });
});

import { describe, it, expect } from "vitest";
import { AUDIENCES, AUDIENCE_BY_ID, getAudience, type Audience } from "../audiences";

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
    const ids: Audience[] = ["athlete", "actor", "director", "musician", "creator", "job_seeker", "recruiter", "employer", "founder", "developer", "designer", "data_analyst", "podcaster", "educator", "voice_actor", "game_dev", "illustrator"];
    for (const id of ids) {
      expect(getAudience(id).id).toBe(id);
    }
  });
});

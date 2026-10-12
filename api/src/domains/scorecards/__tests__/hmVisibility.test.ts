import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseHmVisibility,
  resolveHmVisibility,
  filterSubmissionsForHm,
  DEFAULT_HM_VISIBILITY,
} from "../hmVisibility.js";

const sub = (id: string, status: string) =>
  ({ id, status, evaluatorUserId: id, applicationId: "a" } as any);

describe("parseHmVisibility / resolveHmVisibility (#241)", () => {
  it("falls back to the default for unknown/empty values", () => {
    assert.equal(parseHmVisibility(null), DEFAULT_HM_VISIBILITY);
    assert.equal(parseHmVisibility("nonsense"), "always_show_hm");
    assert.equal(parseHmVisibility("always_hide_hm"), "always_hide_hm");
  });

  it("job override wins over company default", () => {
    assert.equal(resolveHmVisibility("always_hide_hm", "always_show_hm"), "always_hide_hm");
  });
  it("company default applies when job override is unset", () => {
    assert.equal(resolveHmVisibility(null, "hide_hm_until_submit"), "hide_hm_until_submit");
  });
  it("global default applies when both unset", () => {
    assert.equal(resolveHmVisibility(null, null), "always_show_hm");
    assert.equal(resolveHmVisibility("bogus", null), "always_show_hm");
  });
});

describe("filterSubmissionsForHm (#241)", () => {
  const subs = [sub("e1", "submitted"), sub("e2", "draft")];
  const allSubmitted = [sub("e1", "submitted"), sub("e2", "submitted")];

  it("evaluators are never gated by this axis", () => {
    assert.equal(filterSubmissionsForHm(subs, "always_hide_hm", true).length, 2);
  });
  it("always_show_hm shows everything to the HM", () => {
    assert.equal(filterSubmissionsForHm(subs, "always_show_hm", false).length, 2);
  });
  it("always_hide_hm hides everything from the HM", () => {
    assert.equal(filterSubmissionsForHm(subs, "always_hide_hm", false).length, 0);
  });
  it("hide_hm_until_submit hides until the panel is complete", () => {
    assert.equal(filterSubmissionsForHm(subs, "hide_hm_until_submit", false).length, 0);
    assert.equal(filterSubmissionsForHm(allSubmitted, "hide_hm_until_submit", false).length, 2);
  });
});

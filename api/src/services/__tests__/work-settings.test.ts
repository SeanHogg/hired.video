import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWorkSetting,
  normalizeHybridDays,
  formatWorkSetting,
} from "../../../../shared/work-settings.js";

/**
 * #2069 — work-setting SSoT. Folds any spelling into onsite/remote/hybrid,
 * reconciles the hybrid day-split, and formats a human label.
 *
 * Run: node --import tsx --test src/services/__tests__/work-settings.test.ts
 */

describe("normalizeWorkSetting", () => {
  it("passes through canonical values", () => {
    assert.equal(normalizeWorkSetting("onsite"), "onsite");
    assert.equal(normalizeWorkSetting("remote"), "remote");
    assert.equal(normalizeWorkSetting("hybrid"), "hybrid");
  });

  it("folds PascalCase + separators + aliases", () => {
    assert.equal(normalizeWorkSetting("Onsite"), "onsite");
    assert.equal(normalizeWorkSetting("On-site"), "onsite");
    assert.equal(normalizeWorkSetting("on prem"), "onsite");
    assert.equal(normalizeWorkSetting("WFH"), "remote");
    assert.equal(normalizeWorkSetting("Fully Remote"), "remote");
    assert.equal(normalizeWorkSetting("Hybrid"), "hybrid");
    assert.equal(normalizeWorkSetting("flex"), "hybrid");
  });

  it("returns null for unknown / empty", () => {
    assert.equal(normalizeWorkSetting("nonsense"), null);
    assert.equal(normalizeWorkSetting(""), null);
    assert.equal(normalizeWorkSetting(null), null);
  });
});

describe("normalizeHybridDays", () => {
  it("keeps + clamps days for hybrid", () => {
    assert.deepEqual(normalizeHybridDays("hybrid", 2, 3), {
      onsiteDaysPerWeek: 2,
      remoteDaysPerWeek: 3,
    });
    assert.deepEqual(normalizeHybridDays("hybrid", 99, -1), {
      onsiteDaysPerWeek: 7,
      remoteDaysPerWeek: 0,
    });
    assert.deepEqual(normalizeHybridDays("hybrid", 2.6, null), {
      onsiteDaysPerWeek: 3, // rounded
      remoteDaysPerWeek: null,
    });
  });

  it("forces days null for non-hybrid settings", () => {
    assert.deepEqual(normalizeHybridDays("remote", 2, 3), {
      onsiteDaysPerWeek: null,
      remoteDaysPerWeek: null,
    });
    assert.deepEqual(normalizeHybridDays("onsite", 5, 0), {
      onsiteDaysPerWeek: null,
      remoteDaysPerWeek: null,
    });
  });
});

describe("formatWorkSetting", () => {
  it("renders the hybrid split when present", () => {
    assert.equal(formatWorkSetting("hybrid", 2, 3), "Hybrid (2 on-site / 3 remote)");
    assert.equal(formatWorkSetting("hybrid", 2, null), "Hybrid (2 on-site)");
    assert.equal(formatWorkSetting("hybrid", null, null), "Hybrid");
  });

  it("renders plain labels for onsite/remote", () => {
    assert.equal(formatWorkSetting("onsite"), "On-site");
    assert.equal(formatWorkSetting("remote"), "Remote");
    assert.equal(formatWorkSetting(null), "");
  });
});

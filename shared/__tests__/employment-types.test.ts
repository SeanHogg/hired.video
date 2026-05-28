import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  normalizeEmploymentType,
} from "../employment-types.js";

describe("employment types", () => {
  it("every canonical type has a display label", () => {
    for (const t of EMPLOYMENT_TYPES) {
      assert.ok(EMPLOYMENT_TYPE_LABELS[t]);
    }
  });

  it("exec opportunity types are present in the canonical set", () => {
    for (const t of ["fractional", "advisor", "interim", "board-seat"] as const) {
      assert.ok(EMPLOYMENT_TYPES.includes(t));
    }
  });

  it("normalizes the three legacy spellings to canonical kebab", () => {
    // PascalCase (form), snake_case (scraper/AI), kebab (api) all fold in.
    assert.equal(normalizeEmploymentType("FullTime"), "full-time");
    assert.equal(normalizeEmploymentType("full_time"), "full-time");
    assert.equal(normalizeEmploymentType("full-time"), "full-time");
    assert.equal(normalizeEmploymentType("PartTime"), "part-time");
    assert.equal(normalizeEmploymentType("part_time"), "part-time");
    assert.equal(normalizeEmploymentType("Contractor"), "contract");
    assert.equal(normalizeEmploymentType("contract"), "contract");
    assert.equal(normalizeEmploymentType("ContractToHire"), "contract-to-hire");
    assert.equal(normalizeEmploymentType("contract_to_hire"), "contract-to-hire");
    assert.equal(normalizeEmploymentType("Internship"), "internship");
    assert.equal(normalizeEmploymentType("Freelance"), "freelance");
    assert.equal(normalizeEmploymentType("Temporary"), "temporary");
    assert.equal(normalizeEmploymentType("volunteer"), "volunteer");
  });

  it("normalizes exec opportunity types", () => {
    assert.equal(normalizeEmploymentType("BoardSeat"), "board-seat");
    assert.equal(normalizeEmploymentType("board_seat"), "board-seat");
    assert.equal(normalizeEmploymentType("board"), "board-seat");
    assert.equal(normalizeEmploymentType("Fractional"), "fractional");
    assert.equal(normalizeEmploymentType("Advisor"), "advisor");
    assert.equal(normalizeEmploymentType("advisory"), "advisor");
    assert.equal(normalizeEmploymentType("Interim"), "interim");
  });

  it("returns null for unknown / empty values", () => {
    assert.equal(normalizeEmploymentType("nonsense"), null);
    assert.equal(normalizeEmploymentType(""), null);
    assert.equal(normalizeEmploymentType(null), null);
    assert.equal(normalizeEmploymentType(undefined), null);
  });
});

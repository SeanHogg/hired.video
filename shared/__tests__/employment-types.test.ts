// @ts-ignore vitest types aren't in the api package's tsconfig; shared
// tests run under vitest (frontend) — same convention as the other
// shared/__tests__ files.
import { expect, test } from "vitest";
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  normalizeEmploymentType,
} from "../employment-types.js";

test("every canonical type has a display label", () => {
  for (const t of EMPLOYMENT_TYPES) {
    expect(EMPLOYMENT_TYPE_LABELS[t]).toBeTruthy();
  }
});

test("exec opportunity types are present in the canonical set", () => {
  for (const t of ["fractional", "advisor", "interim", "board-seat"] as const) {
    expect(EMPLOYMENT_TYPES).toContain(t);
  }
});

test("normalizes the three legacy spellings to canonical kebab", () => {
  // PascalCase (form), snake_case (scraper/AI), kebab (api) all fold in.
  expect(normalizeEmploymentType("FullTime")).toBe("full-time");
  expect(normalizeEmploymentType("full_time")).toBe("full-time");
  expect(normalizeEmploymentType("full-time")).toBe("full-time");
  expect(normalizeEmploymentType("PartTime")).toBe("part-time");
  expect(normalizeEmploymentType("part_time")).toBe("part-time");
  expect(normalizeEmploymentType("Contractor")).toBe("contract");
  expect(normalizeEmploymentType("contract")).toBe("contract");
  expect(normalizeEmploymentType("ContractToHire")).toBe("contract-to-hire");
  expect(normalizeEmploymentType("contract_to_hire")).toBe("contract-to-hire");
  expect(normalizeEmploymentType("Internship")).toBe("internship");
  expect(normalizeEmploymentType("Freelance")).toBe("freelance");
  expect(normalizeEmploymentType("Temporary")).toBe("temporary");
  expect(normalizeEmploymentType("volunteer")).toBe("volunteer");
});

test("normalizes exec opportunity types", () => {
  expect(normalizeEmploymentType("BoardSeat")).toBe("board-seat");
  expect(normalizeEmploymentType("board_seat")).toBe("board-seat");
  expect(normalizeEmploymentType("board")).toBe("board-seat");
  expect(normalizeEmploymentType("Fractional")).toBe("fractional");
  expect(normalizeEmploymentType("Advisor")).toBe("advisor");
  expect(normalizeEmploymentType("advisory")).toBe("advisor");
  expect(normalizeEmploymentType("Interim")).toBe("interim");
});

test("returns null for unknown / empty values", () => {
  expect(normalizeEmploymentType("nonsense")).toBeNull();
  expect(normalizeEmploymentType("")).toBeNull();
  expect(normalizeEmploymentType(null)).toBeNull();
  expect(normalizeEmploymentType(undefined)).toBeNull();
});

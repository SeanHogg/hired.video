/**
 * Field-validation tests (#1916): the rule engine the inline document editor
 * and the save-gate both call. Covers happy / boundary / exception per the
 * project test bar — and uses content shaped like real entity rows (id-keyed
 * resume items, the flat job record), not just clean toy objects.
 *
 * Run: vitest run lib/studio/document/__tests__/field-validation.test.ts
 */
import { describe, it, expect } from "vitest";
import { documentSectionSchema, type SectionFieldDef } from "../document-field-schema";
import {
  validateField,
  validateFields,
  validateDateRange,
  validateDocumentContent,
} from "../field-validation";

const emailField: SectionFieldDef = { key: "email", label: "Email", type: "text", validate: { format: "email" } };
const urlField: SectionFieldDef = { key: "url", label: "Website", type: "text", validate: { format: "url" } };
const equityField: SectionFieldDef = { key: "equity", label: "Equity %", type: "number", validate: { min: 0, max: 100 } };

describe("validateField — empties never error", () => {
  it("passes empty values regardless of rules (drafts always save)", () => {
    expect(validateField(emailField, "")).toBeNull();
    expect(validateField(emailField, undefined)).toBeNull();
    expect(validateField(urlField, null)).toBeNull();
    expect(validateField({ key: "k", label: "K", type: "list", validate: { format: "url" } }, [])).toBeNull();
  });
});

describe("validateField — format: email", () => {
  it("accepts a well-formed address", () => {
    expect(validateField(emailField, "jess@example.com")).toBeNull();
  });
  it("rejects a malformed address", () => {
    expect(validateField(emailField, "not-an-email")).toMatch(/valid email/i);
    expect(validateField(emailField, "a@b")).toMatch(/valid email/i);
  });
});

describe("validateField — format: url", () => {
  it("accepts full URLs and bare domains", () => {
    expect(validateField(urlField, "https://hired.video")).toBeNull();
    expect(validateField(urlField, "linkedin.com/in/jess")).toBeNull();
  });
  it("rejects values with whitespace or no dotted host", () => {
    expect(validateField(urlField, "not a url")).toMatch(/valid url/i);
    expect(validateField(urlField, "localhost")).toMatch(/valid url/i);
  });
});

describe("validateField — numeric bounds", () => {
  it("accepts values within range incl. boundaries", () => {
    expect(validateField(equityField, 0)).toBeNull();
    expect(validateField(equityField, 100)).toBeNull();
    expect(validateField(equityField, 42)).toBeNull();
  });
  it("rejects below min and above max", () => {
    expect(validateField(equityField, -1)).toMatch(/0 or more/i);
    expect(validateField(equityField, 101)).toMatch(/100 or less/i);
  });
});

describe("validateDateRange", () => {
  const schema = documentSectionSchema("resume", "work");
  if (!schema) throw new Error("expected a 'work' resume section schema");
  it("flags end before start on the end field", () => {
    const errs = validateDateRange(schema, { startDate: "2022-05", endDate: "2020-01" });
    expect(errs.endDate).toMatch(/before start/i);
  });
  it("passes when end >= start or a date is missing", () => {
    expect(validateDateRange(schema, { startDate: "2020-01", endDate: "2022-05" })).toEqual({});
    expect(validateDateRange(schema, { startDate: "2020-01", endDate: "" })).toEqual({});
  });
});

describe("validateFields", () => {
  it("returns only the keys that fail", () => {
    const errs = validateFields([emailField, urlField], {
      email: "bad",
      url: "https://ok.com",
    });
    expect(Object.keys(errs)).toEqual(["email"]);
  });
});

describe("validateDocumentContent — real-shaped content", () => {
  it("is clean for a valid resume", () => {
    const content = {
      basics: { name: "Jess", email: "jess@example.com", url: "jess.dev" },
      work: [
        { id: "w1", position: "Engineer", name: "Acme", startDate: "2019-01", endDate: "2022-03" },
      ],
    };
    expect(validateDocumentContent("resume", content)).toEqual([]);
  });

  it("collects every invalid field across array + object sections", () => {
    const content = {
      basics: { name: "Jess", email: "nope", url: "jess.dev" },
      work: [
        { id: "w1", position: "Engineer", name: "Acme", startDate: "2022-01", endDate: "2020-01" },
      ],
    };
    const issues = validateDocumentContent("resume", content);
    expect(issues.some((i) => /Basics · Email/.test(i))).toBe(true);
    expect(issues.some((i) => /Work Experience · End/.test(i))).toBe(true);
    expect(issues).toHaveLength(2);
  });

  it("validates a flat job record (compensation + apply URL)", () => {
    const content = {
      title: "Staff Engineer",
      salary: -5,
      atsApplyUrl: "broken url",
    };
    const issues = validateDocumentContent("job", content);
    expect(issues.some((i) => /Salary/.test(i))).toBe(true);
    expect(issues.some((i) => /Application URL/.test(i))).toBe(true);
  });

  it("returns nothing for free-content entities (article/blog) and null content", () => {
    expect(validateDocumentContent("article", { anything: 1 })).toEqual([]);
    expect(validateDocumentContent("resume", null)).toEqual([]);
  });
});

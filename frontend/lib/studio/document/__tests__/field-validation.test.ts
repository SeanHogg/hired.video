/**
 * Field-validation tests (#1916): the rule engine the inline document editor
 * and the save-gate both call. Covers happy / boundary / exception per the
 * project test bar — and uses content shaped like real entity rows (id-keyed
 * resume items, the flat job record), not just clean toy objects.
 *
 * Run: vitest run lib/studio/document/__tests__/field-validation.test.ts
 */
import { describe, it, expect } from "vitest";
import en from "../../../../public/locales/en.json";
import { documentSectionSchema, type SectionFieldDef, type Translate } from "../document-field-schema";
import {
  FIELD_ERROR_KEYS,
  validateField,
  validateFields,
  validateDateRange,
  validateDocumentContent,
  documentValidationTier,
} from "../field-validation";
import { JobStatus } from "@/lib/constants/enums";
import { resumeFixture } from "./resume-fixture";

/** Translate against the real English catalogue (flat keys, {{param}}s). */
const catalogue = en as Record<string, unknown>;
const t: Translate = (key, params) => {
  const raw = catalogue[key];
  if (typeof raw !== "string") return key;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ""));
};

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
    expect(validateField(emailField, "not-an-email")).toEqual({ key: FIELD_ERROR_KEYS.email });
    expect(validateField(emailField, "a@b")).toEqual({ key: FIELD_ERROR_KEYS.email });
  });
});

describe("validateField — format: url", () => {
  it("accepts full URLs and bare domains", () => {
    expect(validateField(urlField, "https://hired.video")).toBeNull();
    expect(validateField(urlField, "linkedin.com/in/jess")).toBeNull();
  });
  it("rejects values with whitespace or no dotted host", () => {
    expect(validateField(urlField, "not a url")).toEqual({ key: FIELD_ERROR_KEYS.url });
    expect(validateField(urlField, "localhost")).toEqual({ key: FIELD_ERROR_KEYS.url });
  });
});

describe("validateField — numeric bounds", () => {
  it("accepts values within range incl. boundaries", () => {
    expect(validateField(equityField, 0)).toBeNull();
    expect(validateField(equityField, 100)).toBeNull();
    expect(validateField(equityField, 42)).toBeNull();
  });
  it("rejects below min and above max", () => {
    expect(validateField(equityField, -1)).toEqual({ key: FIELD_ERROR_KEYS.min, params: { min: 0 } });
    expect(validateField(equityField, 101)).toEqual({ key: FIELD_ERROR_KEYS.max, params: { max: 100 } });
  });
});

describe("validateDateRange", () => {
  const schema = documentSectionSchema("resume", "work");
  if (!schema) throw new Error("expected a 'work' resume section schema");
  it("flags end before start on the end field", () => {
    const errs = validateDateRange(schema, { startDate: "2022-05", endDate: "2020-01" });
    expect(errs.endDate).toEqual({ key: FIELD_ERROR_KEYS.endBeforeStart });
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
    expect(validateDocumentContent("resume", content, t)).toEqual([]);
  });

  it("collects every invalid field across array + object sections", () => {
    const content = {
      basics: { name: "Jess", email: "nope", url: "jess.dev" },
      work: [
        { id: "w1", position: "Engineer", name: "Acme", startDate: "2022-01", endDate: "2020-01" },
      ],
    };
    const issues = validateDocumentContent("resume", content, t);
    // Section + field labels and the message come from the catalogue.
    expect(issues).toContain("Basics · Email: Enter a valid email address");
    expect(issues).toContain("Work · End: End can't be before start");
    expect(issues).toHaveLength(2);
  });

  it("validates a flat job record (compensation + apply URL)", () => {
    const content = {
      title: "Staff Engineer",
      salary: -5,
      atsApplyUrl: "broken url",
    };
    const issues = validateDocumentContent("job", content, t);
    expect(issues.some((i) => /Salary/.test(i))).toBe(true);
    expect(issues.some((i) => /Application URL/.test(i))).toBe(true);
  });

  it("returns nothing for free-content entities (article/blog) and null content", () => {
    expect(validateDocumentContent("article", { anything: 1 }, t)).toEqual([]);
    expect(validateDocumentContent("resume", null, t)).toEqual([]);
  });
});

describe("publish tier (#1916a) — required name/title", () => {
  const nameField = documentSectionSchema("resume", "basics")!.fields.find((f) => f.key === "name")!;

  it("a draft save never blocks on emptiness; publish requires the field", () => {
    expect(validateField(nameField, "")).toBeNull();
    expect(validateField(nameField, "", "publish")).toEqual({ key: FIELD_ERROR_KEYS.required });
    expect(validateField(nameField, "   ", "publish")).toEqual({ key: FIELD_ERROR_KEYS.required });
    expect(validateField(nameField, "Sean Hogg", "publish")).toBeNull();
  });

  it("a production-shaped résumé publishes clean; blanking its title fails publish only", () => {
    const content = resumeFixture() as unknown as Record<string, unknown>;
    expect(validateDocumentContent("resume", content, t, "publish")).toEqual([]);
    const blank = { ...content, basics: { ...(content.basics as object), label: "" } };
    expect(validateDocumentContent("resume", blank, t)).toEqual([]);
    const issues = validateDocumentContent("resume", blank, t, "publish");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/Title/);
    expect(issues[0]).toMatch(new RegExp(String(en["studio.document.validation.required" as keyof typeof en])));
  });

  it("a résumé with no basics at all owes both name and title on publish", () => {
    expect(validateDocumentContent("resume", { work: [] }, t, "publish")).toHaveLength(2);
  });

  it("a job saved with a non-draft status is publishing it — title + description required", () => {
    const draft = { title: "", status: JobStatus.Draft };
    const open = { title: "", status: JobStatus.Open };
    expect(documentValidationTier("job", draft)).toBe("save");
    expect(documentValidationTier("job", open)).toBe("publish");
    expect(documentValidationTier("resume", { status: JobStatus.Open })).toBe("save");
    expect(validateDocumentContent("job", draft, t)).toEqual([]);
    // Publishing owes a title and a 50+ character description (#1915).
    expect(validateDocumentContent("job", open, t)).toHaveLength(2);
    const described = { ...open, title: "Staff Engineer", description: "Own the merchant onboarding funnel end to end, with design and data." };
    expect(validateDocumentContent("job", described, t)).toEqual([]);
    expect(validateDocumentContent("job", { ...described, description: "Too short." }, t)).toHaveLength(1);
    expect(validateDocumentContent("job", { ...draft, description: "Too short." }, t)).toEqual([]);
  });
});

describe("company publish tier (#1915)", () => {
  const draft = { name: "Northwind Labs", industry: "", size: "", address: "", city: "", state: "", postalCode: "", country: "" };

  it("a company draft saves with only its name; a PUBLIC page owes the builder's required fields", () => {
    expect(documentValidationTier("company", draft)).toBe("save");
    expect(documentValidationTier("company", draft, true)).toBe("publish");
    expect(validateDocumentContent("company", draft, t)).toEqual([]);
    // industry, size + the five address fields.
    expect(validateDocumentContent("company", draft, t, "publish")).toHaveLength(7);
  });

  it("a complete company page publishes clean", () => {
    const complete = {
      ...draft,
      industry: "Fintech",
      size: "51-200",
      address: "100 King St W",
      city: "Toronto",
      state: "ON",
      postalCode: "M5X 1A9",
      country: "Canada",
    };
    expect(validateDocumentContent("company", complete, t, "publish")).toEqual([]);
  });
});

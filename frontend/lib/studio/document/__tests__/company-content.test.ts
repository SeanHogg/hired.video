/**
 * #1915 — the company page's canvas content maps to and from the company
 * profile with no field loss (everything the retired CompanyBuilder form
 * wrote, plus the fields it carried but never showed).
 */
import { describe, expect, it } from "vitest";
import {
  COMPANY_BENEFIT_KEYS,
  REMOTE_FIRST_YES,
  companyDataToContent,
  contentToCompanyFields,
  contentToCreateCompany,
  emptyCompanyContent,
} from "../company-content";

// Shaped like `CompanyProfile.data` from GET /api/Companies/:id after the
// client schema's defaults ran.
const PROFILE_DATA = {
  name: "Northwind Labs",
  logo: "https://cdn.hired.video/uploads/northwind/logo.png",
  website: "https://northwind.example.com",
  tagline: "Payments infrastructure for small business",
  description: "We build the rails 40,000 merchants get paid on.",
  industry: "Fintech",
  size: "51-200",
  founded: 2017,
  headquarters: {
    address: "100 King St W",
    city: "Toronto",
    state: "ON",
    country: "Canada",
    postalCode: "M5X 1A9",
    timezone: "America/Toronto",
    remote: true,
  },
  locations: [],
  contact: {
    email: "talent@northwind.example.com",
    phone: "+1 416 555 0100",
    website: "https://northwind.example.com/contact",
    linkedin: "https://linkedin.com/company/northwind-labs",
    twitter: "@northwindlabs",
    facebook: "https://facebook.com/northwindlabs",
  },
  benefits: {
    healthInsurance: true,
    dentalInsurance: true,
    visionInsurance: false,
    retirement401k: null,
    retirementPlan: true,
    stockOptions: true,
    paidTimeOff: true,
    parentalLeave: false,
    flexibleSchedule: true,
    remoteWork: true,
    learningBudget: true,
    professionalDevelopment: false,
    gymMembership: false,
    freeFood: false,
    commuteBenefits: false,
    other: ["Sabbatical after 5 years"],
  },
  culture: ["Write it down", "Ship small, ship often"],
  technologies: ["TypeScript", "Postgres", "Cloudflare Workers"],
  perks: ["Home-office stipend"],
  mission: "Get every small business paid on time.",
  vision: null,
  values: ["Candour", "Craft"],
};

describe("companyDataToContent", () => {
  it("flattens the profile into the canvas record", () => {
    const c = companyDataToContent(PROFILE_DATA);
    expect(c).toMatchObject({
      name: "Northwind Labs",
      industry: "Fintech",
      size: "51-200",
      founded: 2017,
      city: "Toronto",
      remoteFirst: REMOTE_FIRST_YES,
      email: "talent@northwind.example.com",
      twitter: "@northwindlabs",
      vision: "",
      values: ["Candour", "Craft"],
    });
    expect(c.benefits).toEqual([
      "healthInsurance",
      "dentalInsurance",
      "retirementPlan",
      "stockOptions",
      "paidTimeOff",
      "flexibleSchedule",
      "remoteWork",
      "learningBudget",
    ]);
  });

  it("reads the API's placeholder defaults as empty (boundary)", () => {
    const c = companyDataToContent({ name: "Unnamed Company", industry: "Not specified", size: "Not specified" });
    expect(c.name).toBe("");
    expect(c.industry).toBe("");
    expect(c.size).toBe("");
    expect(c.benefits).toEqual([]);
    expect(c.remoteFirst).toBe("");
  });

  it("tolerates a missing / malformed payload", () => {
    expect(companyDataToContent(null)).toEqual(emptyCompanyContent());
    expect(companyDataToContent({ culture: "not-a-list", headquarters: 7 } as never).culture).toEqual([]);
  });
});

describe("contentToCompanyFields", () => {
  it("round-trips without dropping the fields the canvas doesn't show", () => {
    const fields = contentToCompanyFields(companyDataToContent(PROFILE_DATA));
    expect(fields).toMatchObject({
      name: "Northwind Labs",
      logoUrl: PROFILE_DATA.logo,
      foundedYear: 2017,
      vision: null,
      technologies: ["TypeScript", "Postgres", "Cloudflare Workers"],
    });
    expect(fields.headquarters).toEqual({
      address: "100 King St W",
      city: "Toronto",
      state: "ON",
      postalCode: "M5X 1A9",
      country: "Canada",
      timezone: "America/Toronto",
      remote: true,
    });
    expect(fields.contact).toEqual(PROFILE_DATA.contact);
    const benefits = fields.benefits as Record<string, unknown>;
    expect(benefits.other).toEqual(["Sabbatical after 5 years"]);
    expect(benefits.healthInsurance).toBe(true);
    expect(benefits.retirement401k).toBe(false);
    expect(Object.keys(benefits)).toHaveLength(COMPANY_BENEFIT_KEYS.length + 1);
  });

  it("an edit on the canvas reaches the payload", () => {
    const c = { ...companyDataToContent(PROFILE_DATA), remoteFirst: "", benefits: ["freeFood" as const], size: "201-500" };
    const fields = contentToCompanyFields(c);
    expect((fields.headquarters as { remote: boolean }).remote).toBe(false);
    expect(fields.size).toBe("201-500");
    expect((fields.benefits as Record<string, unknown>).freeFood).toBe(true);
    expect((fields.benefits as Record<string, unknown>).healthInsurance).toBe(false);
  });
});

describe("contentToCreateCompany", () => {
  it("creates once the company has a name", () => {
    expect(contentToCreateCompany({ ...emptyCompanyContent(), name: "  Northwind Labs " })?.name).toBe("Northwind Labs");
  });

  it("an unnamed draft does not create a row (error case)", () => {
    expect(contentToCreateCompany(emptyCompanyContent())).toBeNull();
    expect(contentToCreateCompany({ ...emptyCompanyContent(), name: "   " })).toBeNull();
  });
});

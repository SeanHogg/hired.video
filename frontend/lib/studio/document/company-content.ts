/**
 * company-content — the bound CONTENT a `document` of `entityKind: "company"`
 * edits on the Studio canvas (#1915 T2.1 — the company page is authored on
 * the document canvas, like a job posting). A company profile is a nested
 * record (headquarters / contact / benefit flags); the canvas edits it as a
 * FLAT record so every section is a root object section (company-field-schema
 * .ts), and this module is the single mapper between the two.
 *
 * Covers every field the retired `CompanyBuilder` form edited: name, industry,
 * size, founded, tagline, logo, website, description, culture, technologies,
 * perks, contact (email / phone / LinkedIn / X), headquarters address +
 * remote-first, the benefit switches, mission, vision and values. Fields the
 * form carried but never showed (contact website / Facebook, `benefits.other`)
 * ride through untouched so a save never drops them.
 */
import type {
  CompanyData,
  CompanyWritableFields,
  CreateCompanyRequest,
} from "@/lib/services/company-service";

/** The benefit switches the company profile models (`CompanyBenefits`). */
export const COMPANY_BENEFIT_KEYS = [
  "healthInsurance",
  "dentalInsurance",
  "visionInsurance",
  "retirement401k",
  "retirementPlan",
  "stockOptions",
  "paidTimeOff",
  "parentalLeave",
  "flexibleSchedule",
  "remoteWork",
  "learningBudget",
  "professionalDevelopment",
  "gymMembership",
  "freeFood",
  "commuteBenefits",
] as const;
export type CompanyBenefitKey = (typeof COMPANY_BENEFIT_KEYS)[number];

/** "yes" / "" select value for the remote-first flag (the field engine has no
 *  boolean control; "" reads as "Not specified"). */
export const REMOTE_FIRST_YES = "yes";

export interface CompanyDocumentContent {
  name: string;
  tagline: string;
  logo: string;
  website: string;
  industry: string;
  size: string;
  founded?: number;
  description: string;
  culture: string[];
  technologies: string[];
  perks: string[];
  /** The benefit switches that are ON. */
  benefits: CompanyBenefitKey[];
  mission: string;
  vision: string;
  values: string[];
  email: string;
  phone: string;
  linkedin: string;
  twitter: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  remoteFirst: string;
  /** Passthrough — not edited on the canvas, written back unchanged. */
  contactWebsite: string;
  facebook: string;
  otherBenefits: string[];
  timezone: string;
}

type Loose = Record<string, unknown> | null | undefined;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
/** The API's "Not specified" defaults (CompanyDataSchema) read as empty. */
const NOT_SPECIFIED = "Not specified";
const real = (v: unknown): string => (str(v) === NOT_SPECIFIED ? "" : str(v));

/** Map a company profile's `data` (CompanyProfile.data) to canvas content. */
export function companyDataToContent(data: Loose | CompanyData): CompanyDocumentContent {
  const d = obj(data);
  const hq = obj(d.headquarters);
  const contact = obj(d.contact);
  const benefits = obj(d.benefits);
  return {
    name: d.name === "Unnamed Company" ? "" : str(d.name),
    tagline: str(d.tagline),
    logo: str(d.logo),
    website: str(d.website),
    industry: real(d.industry),
    size: real(d.size),
    founded: typeof d.founded === "number" ? d.founded : undefined,
    description: str(d.description),
    culture: strs(d.culture),
    technologies: strs(d.technologies),
    perks: strs(d.perks),
    benefits: COMPANY_BENEFIT_KEYS.filter((k) => benefits[k] === true),
    mission: str(d.mission),
    vision: str(d.vision),
    values: strs(d.values),
    email: str(contact.email),
    phone: str(contact.phone),
    linkedin: str(contact.linkedin),
    twitter: str(contact.twitter),
    address: str(hq.address),
    city: str(hq.city),
    state: str(hq.state),
    postalCode: str(hq.postalCode),
    country: str(hq.country),
    remoteFirst: hq.remote === true ? REMOTE_FIRST_YES : "",
    contactWebsite: str(contact.website),
    facebook: str(contact.facebook),
    otherBenefits: strs(benefits.other),
    timezone: str(hq.timezone),
  };
}

/** Blank content for a fresh company draft. */
export function emptyCompanyContent(): CompanyDocumentContent {
  return companyDataToContent({});
}

const orNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

/** The write payload `PUT /api/Companies/:id` (and the POST) accepts — the
 *  same shape the retired builder sent (`buildCreateRequest`). */
export function contentToCompanyFields(c: CompanyDocumentContent): CompanyWritableFields {
  const benefitFlags: Record<string, unknown> = Object.fromEntries(
    COMPANY_BENEFIT_KEYS.map((k) => [k, c.benefits.includes(k)]),
  );
  benefitFlags.other = c.otherBenefits;
  return {
    name: c.name.trim(),
    description: orNull(c.description),
    website: orNull(c.website),
    logoUrl: orNull(c.logo),
    industry: orNull(c.industry),
    size: orNull(c.size),
    foundedYear: typeof c.founded === "number" ? c.founded : null,
    headquarters: {
      address: orNull(c.address),
      city: orNull(c.city),
      state: orNull(c.state),
      postalCode: orNull(c.postalCode),
      country: orNull(c.country),
      ...(c.timezone ? { timezone: c.timezone } : {}),
      remote: c.remoteFirst === REMOTE_FIRST_YES,
    },
    contact: {
      email: orNull(c.email),
      phone: orNull(c.phone),
      website: orNull(c.contactWebsite),
      linkedin: orNull(c.linkedin),
      twitter: orNull(c.twitter),
      facebook: orNull(c.facebook),
    },
    tagline: orNull(c.tagline),
    mission: orNull(c.mission),
    vision: orNull(c.vision),
    technologies: c.technologies,
    perks: c.perks,
    culture: c.culture,
    values: c.values,
    benefits: benefitFlags,
  };
}

/** Create payload for the first save — the API requires a name, so an
 *  unnamed draft persists as a document only until it has one. */
export function contentToCreateCompany(c: CompanyDocumentContent): CreateCompanyRequest | null {
  if (!c.name.trim()) return null;
  return { ...contentToCompanyFields(c), name: c.name.trim() };
}

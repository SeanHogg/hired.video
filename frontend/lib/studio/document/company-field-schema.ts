/**
 * Company-page section schemas for the document canvas (#1915 T2.1). The
 * canvas content is the flat `CompanyDocumentContent` (company-content.ts), so
 * every section is a root object section. Together they cover the field set
 * the retired `CompanyBuilder` form edited.
 */
import { COMPANY_SIZE_OPTIONS } from "@/lib/constants/company-constants";
import { COMPANY_BENEFIT_KEYS, REMOTE_FIRST_YES } from "./company-content";
import { rootSection, type DocumentSectionSchema, type FieldOption } from "./field-schema-core";

const NOT_SPECIFIED: FieldOption = { value: "", label: "Not specified", labelKey: "studioFields.notSpecified" };

/** "1000+" → "1000plus", "11-50" → "11to50" — i18n-safe key suffixes. */
function sizeKey(value: string): string {
  return value.replace("+", "plus").replace("-", "to");
}

const SIZE_OPTIONS: FieldOption[] = [
  NOT_SPECIFIED,
  ...COMPANY_SIZE_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    labelKey: `studioFields.company.size.${sizeKey(o.value)}`,
  })),
];

const BENEFIT_LABELS: Record<(typeof COMPANY_BENEFIT_KEYS)[number], string> = {
  healthInsurance: "Health insurance",
  dentalInsurance: "Dental insurance",
  visionInsurance: "Vision insurance",
  retirement401k: "401(k)",
  retirementPlan: "Retirement plan",
  stockOptions: "Stock options",
  paidTimeOff: "Paid time off",
  parentalLeave: "Parental leave",
  flexibleSchedule: "Flexible schedule",
  remoteWork: "Remote work",
  learningBudget: "Learning budget",
  professionalDevelopment: "Professional development",
  gymMembership: "Gym membership",
  freeFood: "Free food",
  commuteBenefits: "Commute benefits",
};

const BENEFIT_OPTIONS: FieldOption[] = COMPANY_BENEFIT_KEYS.map((key) => ({
  value: key,
  label: BENEFIT_LABELS[key],
  labelKey: `studioFields.company.benefit.${key}`,
}));

const REMOTE_FIRST_OPTIONS: FieldOption[] = [
  NOT_SPECIFIED,
  { value: REMOTE_FIRST_YES, label: "Remote-first", labelKey: "studioFields.company.remoteFirstYes" },
];

const CURRENT_YEAR_CAP = 2100;

export const COMPANY_SECTION_SCHEMAS: Record<string, DocumentSectionSchema> = {
  overview: rootSection("overview", "About the company", "studioFields.company.section.overview", [
    { key: "name", label: "Company name", labelKey: "studioFields.company.name", type: "text", heading: true, validate: { publishRequired: true, maxLength: 255 } },
    { key: "logo", label: "Logo", labelKey: "studioFields.company.logo", type: "image" },
    { key: "tagline", label: "Tagline", labelKey: "studioFields.company.tagline", type: "text", validate: { maxLength: 255 } },
    { key: "industry", label: "Industry", labelKey: "studioFields.company.industry", type: "text", validate: { publishRequired: true } },
    { key: "size", label: "Company size", labelKey: "studioFields.company.size", type: "select", options: SIZE_OPTIONS, validate: { publishRequired: true } },
    { key: "founded", label: "Founded", labelKey: "studioFields.company.founded", type: "number", validate: { min: 1800, max: CURRENT_YEAR_CAP } },
    { key: "website", label: "Website", labelKey: "studioFields.company.website", type: "text", validate: { format: "url" } },
    { key: "description", label: "Description", labelKey: "studioFields.company.description", type: "textarea" },
  ]),
  culture: rootSection("culture", "Culture & stack", "studioFields.company.section.culture", [
    { key: "culture", label: "Culture", labelKey: "studioFields.company.culture", type: "list" },
    { key: "technologies", label: "Technologies", labelKey: "studioFields.company.technologies", type: "list" },
    { key: "perks", label: "Perks", labelKey: "studioFields.company.perks", type: "list" },
  ]),
  benefits: rootSection("benefits", "Benefits", "studioFields.company.section.benefits", [
    { key: "benefits", label: "Benefits", labelKey: "studioFields.company.benefits", type: "multiselect", options: BENEFIT_OPTIONS },
  ]),
  mission: rootSection("mission", "Mission & values", "studioFields.company.section.mission", [
    { key: "mission", label: "Mission", labelKey: "studioFields.company.mission", type: "textarea" },
    { key: "vision", label: "Vision", labelKey: "studioFields.company.vision", type: "textarea" },
    { key: "values", label: "Core values", labelKey: "studioFields.company.values", type: "list" },
  ]),
  contact: rootSection("contact", "Contact", "studioFields.company.section.contact", [
    { key: "email", label: "Email", labelKey: "studioFields.email", type: "text", validate: { format: "email" } },
    { key: "phone", label: "Phone", labelKey: "studioFields.phone", type: "text" },
    { key: "linkedin", label: "LinkedIn", labelKey: "studioFields.company.linkedin", type: "text" },
    { key: "twitter", label: "X (Twitter)", labelKey: "studioFields.company.twitter", type: "text" },
  ]),
  headquarters: rootSection("headquarters", "Headquarters", "studioFields.company.section.headquarters", [
    { key: "address", label: "Street address", labelKey: "studioFields.company.address", type: "text", validate: { publishRequired: true } },
    { key: "city", label: "City", labelKey: "studioFields.company.city", type: "text", validate: { publishRequired: true } },
    { key: "state", label: "State / province", labelKey: "studioFields.company.state", type: "text", validate: { publishRequired: true } },
    { key: "postalCode", label: "Postal code", labelKey: "studioFields.company.postalCode", type: "text", validate: { publishRequired: true } },
    { key: "country", label: "Country", labelKey: "studioFields.company.country", type: "text", validate: { publishRequired: true } },
    { key: "remoteFirst", label: "Remote-first", labelKey: "studioFields.company.remoteFirst", type: "select", options: REMOTE_FIRST_OPTIONS },
  ]),
};

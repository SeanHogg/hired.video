/**
 * Job-posting section schemas for the document canvas (#1914). A job is a FLAT
 * record (`JobDocumentContent`, job-content.ts), so every section is a root
 * object section writing distinct keys of the content root. The enum selects /
 * multiselects reuse the canonical `*_OPTIONS` lists from `constants/enums.ts`
 * (single source) and store as numbers (`numeric`).
 *
 * The field set covers what the retired `JobCreatePage` form wrote (#1915):
 * title, description, company, location, responsibilities, requirements,
 * employment type, seniority, work setting (+ the hybrid day split), salary
 * range + currency, sector, status, expiry, hero image and apply URL. Its
 * `isPublic` checkbox is covered by `status` (the route publishes on Open);
 * the attached video + geo tags are edited in the job inspector
 * (JobDocumentInspector).
 */
import { JOB_STATUS_OPTIONS, WORK_SETTING_OPTIONS } from "@/lib/constants/enums";
import { SENIORITY_LABELS, SENIORITY_LEVELS } from "@shared/seniority";
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS } from "@shared/employment-types";
import { SECTORS, sectorMeta } from "@shared/sectors";
import {
  enumFieldOptions,
  optionLabelKey,
  rootSection,
  type DocumentSectionSchema,
  type FieldOption,
} from "./field-schema-core";

/** The canonical seniority levels (#2090), multi-select like the retired
 *  create form. */
const SENIORITY_FIELD_OPTIONS: FieldOption[] = SENIORITY_LEVELS.map((lvl) => ({
  value: lvl,
  label: SENIORITY_LABELS[lvl],
  labelKey: `studioFields.option.seniority.${lvl}`,
}));

/** The canonical employment / engagement types (shared/employment-types) —
 *  incl. contract-to-hire and the exec types (fractional / advisor / interim /
 *  board seat) as their own values. Volunteer isn't a job posting type. */
const EMPLOYMENT_FIELD_OPTIONS: FieldOption[] = EMPLOYMENT_TYPES.filter((v) => v !== "volunteer").map((v) => ({
  value: v,
  label: EMPLOYMENT_TYPE_LABELS[v],
  labelKey: optionLabelKey(EMPLOYMENT_TYPE_LABELS[v]),
}));

/** The AI-resilient sector taxonomy (shared/sectors.ts), labelled with the
 *  same `sectors.<slug>.label` keys the sector picker uses. */
const SECTOR_FIELD_OPTIONS: FieldOption[] = [
  { value: "", label: "Not specified", labelKey: "studioFields.notSpecified" },
  ...SECTORS.map((slug) => ({ value: slug, label: sectorMeta(slug).label, labelKey: `sectors.${slug}.label` })),
];

const DAYS = { min: 0, max: 7 } as const;

export const JOB_SECTION_SCHEMAS: Record<string, DocumentSectionSchema> = {
  overview: rootSection("overview", "Overview", "studioFields.job.section.overview", [
    { key: "title", label: "Job title", labelKey: "studioFields.job.title", type: "text", heading: true, validate: { publishRequired: true } },
    { key: "company", label: "Company", labelKey: "studioFields.job.company", type: "text", validate: { maxLength: 255 } },
    { key: "location", label: "Location", labelKey: "studioFields.job.location", type: "text" },
    { key: "heroImageUrl", label: "Hero image", labelKey: "studioFields.job.heroImage", type: "image" },
    // 50–5000 characters, as the retired create form required: the cap
    // applies to every save, the floor (and presence) to publishing.
    { key: "description", label: "About this role", labelKey: "studioFields.job.about", type: "textarea", validate: { publishRequired: true, minLength: 50, maxLength: 5000 } },
  ]),
  responsibilities: rootSection("responsibilities", "What you'll do", "studioFields.job.section.responsibilities", [
    { key: "responsibilities", label: "Responsibilities", labelKey: "studioFields.job.responsibilities", type: "list" },
  ]),
  requirements: rootSection("requirements", "Requirements", "studioFields.job.section.requirements", [
    { key: "requirements", label: "Requirements", labelKey: "studioFields.job.requirements", type: "list" },
  ]),
  // `salary` maps to `job_items.salary_min`, `salaryMax` to `salary_max`.
  // `bonus`/`equity` were pruned (#2259): the job route has no column for them.
  compensation: rootSection("compensation", "Compensation", "studioFields.job.section.compensation", [
    { key: "salary", label: "Salary (annual)", labelKey: "studioFields.job.salary", type: "number", validate: { min: 0 } },
    { key: "salaryMax", label: "Salary max (annual)", labelKey: "studioFields.job.salaryMax", type: "number", validate: { min: 0 } },
    { key: "currency", label: "Currency", labelKey: "studioFields.job.currency", type: "text", validate: { maxLength: 10 } },
  ]),
  details: rootSection("details", "Role details", "studioFields.job.section.details", [
    { key: "employmentType", label: "Employment type", labelKey: "studioFields.job.employmentType", type: "multiselect", options: EMPLOYMENT_FIELD_OPTIONS },
    { key: "workSetting", label: "Work setting", labelKey: "studioFields.job.workSetting", type: "select", numeric: true, options: enumFieldOptions(WORK_SETTING_OPTIONS) },
    // Hybrid weekly split (#2069) — only persisted for hybrid roles
    // (`contentToUpdateJob`); the route clears it otherwise.
    { key: "onsiteDaysPerWeek", label: "On-site days / week", labelKey: "studioFields.job.onsiteDays", type: "number", validate: DAYS },
    { key: "remoteDaysPerWeek", label: "Remote days / week", labelKey: "studioFields.job.remoteDays", type: "number", validate: DAYS },
    // Seniority is the canonical string SSoT (#2090/#2218), multi-select.
    { key: "seniority", label: "Seniority", labelKey: "studioFields.job.seniority", type: "multiselect", options: SENIORITY_FIELD_OPTIONS },
    { key: "sector", label: "Sector", labelKey: "studioFields.job.sector", type: "select", options: SECTOR_FIELD_OPTIONS },
    { key: "status", label: "Status", labelKey: "studioFields.job.status", type: "select", numeric: true, options: enumFieldOptions(JOB_STATUS_OPTIONS) },
  ]),
  // `privacy_ShowJob` and `goLiveDate` were pruned (#2259): neither has a job
  // route column, so editing them on the canvas silently dropped.
  publishing: rootSection("publishing", "Publishing & apply", "studioFields.job.section.publishing", [
    { key: "expirationDate", label: "Expires", labelKey: "studioFields.job.expires", type: "day" },
    { key: "atsApplyUrl", label: "Application URL", labelKey: "studioFields.job.applyUrl", type: "text", validate: { format: "url" } },
  ]),
};

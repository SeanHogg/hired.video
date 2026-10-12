/**
 * Labels for merge decisions — pure, so every merge surface (the résumé
 * list's merge dialog, the kit's on-page merge cards, the compare panel)
 * names sections, fields and entries the same way. Exposes i18n KEYS, never
 * English: callers render through `t()`.
 */
import { sectionLabelKey } from "@/lib/build/editable-sections";

export { sectionLabelKey as mergeSectionLabelKey };

const FIELD_KEYS = new Set([
  "startDate",
  "endDate",
  "releaseDate",
  "date",
  "summary",
  "description",
  "url",
  "score",
  "name",
  "organization",
  "institution",
  "position",
  "title",
  "area",
  "studyType",
  "issuer",
  "awarder",
  "publisher",
  "entity",
  "type",
  "language",
  "fluency",
  "level",
  "reference",
  "employmentType",
  "locationType",
  "label",
  "email",
  "phone",
  "image",
]);

/** i18n key for a merged field's name; unknown fields fall back to
 *  `merge.field.other` with the raw name as `{{field}}`. */
export function mergeFieldLabelKey(field: string): string {
  return FIELD_KEYS.has(field) ? `merge.field.${field}` : "merge.field.other";
}

export interface MergeItemDescription {
  /** The entry's own name, when it has one. */
  label: string;
  /** Shown when `label` is empty ("Untitled company"). */
  fallbackKey: string;
  secondary: string;
  hint: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * Name / secondary line / hint for one entry of any section. Each section
 * names its entries differently (awards use `title`, education
 * `institution`, languages `language`…). PascalCase keys from legacy rows
 * are read too.
 */
export function describeMergeItem(sectionType: string, item: Record<string, unknown>): MergeItemDescription {
  const get = (key: string) => str(item[key] ?? item[key.charAt(0).toUpperCase() + key.slice(1)]);
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
  switch (sectionType) {
    case "work":
      return { label: get("name"), fallbackKey: "merge.untitled.work", secondary: get("position"), hint: get("summary") };
    case "volunteer":
      return { label: get("organization"), fallbackKey: "merge.untitled.volunteer", secondary: get("position"), hint: get("summary") };
    case "education":
      return {
        label: get("institution"),
        fallbackKey: "merge.untitled.education",
        secondary: [get("studyType"), get("area")].filter(Boolean).join(" · "),
        hint: "",
      };
    case "projects":
      return { label: get("name"), fallbackKey: "merge.untitled.projects", secondary: "", hint: get("description") };
    case "awards":
      return { label: get("title"), fallbackKey: "merge.untitled.awards", secondary: join(get("awarder"), get("date")), hint: get("summary") };
    case "certificates":
      return { label: get("name"), fallbackKey: "merge.untitled.certificates", secondary: join(get("issuer"), get("date")), hint: "" };
    case "publications":
      return { label: get("name"), fallbackKey: "merge.untitled.publications", secondary: join(get("publisher"), get("releaseDate")), hint: get("summary") };
    case "skills":
      return { label: get("name"), fallbackKey: "merge.untitled.skills", secondary: get("level"), hint: strs(item.keywords ?? item.Keywords).join(", ") };
    case "languages":
      return { label: get("language"), fallbackKey: "merge.untitled.languages", secondary: get("fluency"), hint: "" };
    case "interests":
      return { label: get("name"), fallbackKey: "merge.untitled.interests", secondary: "", hint: strs(item.keywords ?? item.Keywords).join(", ") };
    case "references":
      return { label: get("name"), fallbackKey: "merge.untitled.references", secondary: "", hint: get("reference") };
    default: {
      const first = Object.values(item).find((v) => typeof v === "string" && v.trim());
      return { label: str(first), fallbackKey: "merge.untitled.item", secondary: "", hint: "" };
    }
  }
}

/** Header of the bullet checklist — the array a section keeps its bullets in. */
export function bulletListLabelKey(sectionType: string): string {
  if (sectionType === "education") return "merge.bullets.courses";
  if (sectionType === "work" || sectionType === "volunteer") return "merge.bullets.accomplishments";
  return "merge.bullets.highlights";
}

export type ConfidenceTier = "auto" | "review" | "low";

/** Badge tier for a match: the analysis action wins, confidence decides otherwise. */
export function confidenceTier(confidence: number, action: string): ConfidenceTier {
  if (action === "auto" || confidence >= 0.8) return "auto";
  if (action === "manual" || confidence >= 0.4) return "review";
  return "low";
}

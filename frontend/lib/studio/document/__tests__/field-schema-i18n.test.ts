/**
 * Every label the document field schema exposes must resolve in EVERY
 * shipped catalogue — the résumé fields are what the kit's section editor
 * shows, so a missing key would surface as a raw key to a Spanish or
 * French-Canadian user.
 */
import { describe, it, expect } from "vitest";
import en from "../../../../public/locales/en.json";
import es from "../../../../public/locales/es.json";
import frCA from "../../../../public/locales/fr-CA.json";
import { documentSectionSchemasFor, optionLabelKey } from "../document-field-schema";
import { FIELD_ERROR_KEYS } from "../field-validation";

const CATALOGUES = { en, es, "fr-CA": frCA } as Record<string, Record<string, unknown>>;

const KINDS = ["resume", "job", "company"] as const;

function schemaKeys(kind: (typeof KINDS)[number]): string[] {
  const keys: string[] = [];
  for (const schema of documentSectionSchemasFor(kind)) {
    if (schema.labelKey) keys.push(schema.labelKey);
    for (const field of schema.fields) {
      if (field.labelKey) keys.push(field.labelKey);
      for (const option of field.options ?? []) {
        if (option.labelKey) keys.push(option.labelKey);
      }
    }
  }
  return keys;
}

describe("document field schema — localization", () => {
  it("labels every résumé, job and company section, field and option", () => {
    for (const kind of KINDS) {
      for (const schema of documentSectionSchemasFor(kind)) {
        expect(schema.labelKey, `${kind}.${schema.sectionKey}`).toBeTruthy();
        for (const field of schema.fields) {
          expect(field.labelKey, `${kind}.${schema.sectionKey}.${field.key}`).toBeTruthy();
          for (const option of field.options ?? []) {
            expect(option.labelKey, `${kind}.${field.key}=${option.value}`).toBeTruthy();
          }
        }
      }
    }
  });

  it.each(Object.keys(CATALOGUES))("every key resolves in %s", (locale) => {
    const catalogue = CATALOGUES[locale];
    const keys = [...KINDS.flatMap(schemaKeys), ...Object.values(FIELD_ERROR_KEYS)];
    const missing = keys.filter((k) => typeof catalogue[k] !== "string");
    expect(missing).toEqual([]);
  });

  it("optionLabelKey camel-cases the English label into the shared vocabulary", () => {
    expect(optionLabelKey("Full-time")).toBe("studioFields.option.fullTime");
    expect(optionLabelKey("Onsite")).toBe("studioFields.option.onsite");
    expect(optionLabelKey("Internship")).toBe("studioFields.option.internship");
  });
});

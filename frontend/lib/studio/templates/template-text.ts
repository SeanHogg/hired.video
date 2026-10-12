/**
 * A catalog template's display text. Templates that carry i18n keys
 * (`labelKey` / `descKey` — the document templates, #1915) show the
 * translation; the rest fall back to their English catalog copy.
 */
import type { TemplateDef } from "./catalog";

type Translate = (key: string) => string;

export function templateLabel(def: Pick<TemplateDef, "label" | "labelKey">, t: Translate): string {
  return def.labelKey ? t(def.labelKey) : def.label;
}

export function templateDesc(def: Pick<TemplateDef, "desc" | "descKey">, t: Translate): string {
  return def.descKey ? t(def.descKey) : def.desc;
}

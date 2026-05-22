/**
 * DOM-based form-field extraction for job application forms.
 *
 * DI design: every exported function takes a `Document` so tests can pass
 * a jsdom document, the extension passes `document`, and the API (when
 * we want to run these server-side on a captured snapshot) can pass a
 * `linkedom` document.
 *
 * Three tiers:
 *   1. ATS-specific extractor (Greenhouse, Lever, Workday) — preferred
 *      because the providers have stable DOM contracts.
 *   2. Generic "find the largest form, walk its inputs" fallback.
 *   3. Nothing — return an empty list.
 */

import type { FormField } from "../autofill.js";
import { detectAtsProvider } from "./urls.js";

// Minimal DOM typing — re-exported so callers outside lib.dom can just
// import this file. Trick: we declare these structurally so we don't
// depend on the DOM type library at compile time.
interface DomElement {
  tagName: string;
  id?: string;
  name?: string;
  type?: string;
  value?: string;
  required?: boolean;
  placeholder?: string;
  options?: ArrayLike<{ text: string; value: string }>;
  checked?: boolean;
  children?: ArrayLike<DomElement>;
  parentElement?: DomElement | null;
  offsetWidth?: number;
  offsetHeight?: number;
  textContent?: string | null;
  innerHTML?: string;
  outerHTML?: string;
  getAttribute(name: string): string | null;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  closest(selector: string): DomElement | null;
  cloneNode(deep: boolean): DomElement;
}

interface DomDocument {
  body: DomElement;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  getElementById(id: string): DomElement | null;
}

export interface FormExtractionResult {
  fields: FormField[];
  atsProvider: string | null;
  url: string;
}

const EMPTY_STYLE_LIKE = {
  display: "block" as string,
  visibility: "visible" as string,
  opacity: "1" as string,
};

/**
 * Build a visibility checker. When a test environment doesn't implement
 * `getComputedStyle`, fall back to dimensions only — jsdom returns 0 for
 * offsetWidth/Height by default, which would hide everything, so in that
 * case we accept "not explicitly hidden via attribute" as "visible".
 */
function makeIsVisible(getComputedStyle?: (el: unknown) => { display?: string; visibility?: string; opacity?: string }) {
  return function isVisible(el: DomElement): boolean {
    const typeAttr = (el.getAttribute("type") || el.type || "").toLowerCase();
    if (typeAttr === "hidden") return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    const styleAttr = el.getAttribute("style") || "";
    if (/display\s*:\s*none/i.test(styleAttr)) return false;
    if (/visibility\s*:\s*hidden/i.test(styleAttr)) return false;
    if (getComputedStyle) {
      try {
        const s = getComputedStyle(el) || EMPTY_STYLE_LIKE;
        if (s.display === "none") return false;
        if (s.visibility === "hidden") return false;
        if (s.opacity === "0") return false;
      } catch {
        // fall through
      }
    }
    return true;
  };
}

function humanizeFieldName(name: string): string {
  const bracketMatch = name.match(/\[([^\]]+)\]$/);
  const raw = bracketMatch ? bracketMatch[1] : name;
  return (
    raw
      .replace(/[_\-]/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim() || "Unknown Field"
  );
}

function mapInputType(el: DomElement): FormField["type"] {
  if (el.tagName.toUpperCase() === "TEXTAREA") return "textarea";
  if (el.tagName.toUpperCase() === "SELECT") return "select";
  const t = (el.getAttribute("type") || el.type || "text").toLowerCase();
  const map: Record<string, FormField["type"]> = {
    text: "text",
    email: "email",
    tel: "tel",
    url: "url",
    date: "date",
    "datetime-local": "date",
    number: "number",
    file: "file",
    hidden: "hidden",
    radio: "radio",
    checkbox: "checkbox",
    password: "text",
  };
  return map[t] ?? "text";
}

// cssEscape + buildSelector previously lived inline here. Both moved to
// ./selector.ts so the interactive picker (hiredvideo-chrome-extension/
// shared/content-script-picker.ts) consumes the same implementation.
import { cssEscape, buildSelector } from "./selector.js";

/**
 * Resolve the human label for a form element using multiple strategies.
 * Priority: explicit <label for> → implicit parent <label> → aria-label →
 * aria-labelledby → placeholder → sibling text → name attribute.
 */
export function resolveLabel(doc: DomDocument, el: DomElement): string {
  if (el.id) {
    const label = doc.querySelector(`label[for="${cssEscape(el.id)}"]`);
    if (label) {
      const text = (label.textContent || "").trim().replace(/\s+/g, " ");
      if (text) return text;
    }
  }

  const parentLabel = el.closest("label");
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    const inputs = clone.querySelectorAll("input, select, textarea");
    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i] as unknown as { remove?: () => void };
      inp.remove?.();
    }
    const text = (clone.textContent || "").trim().replace(/\s+/g, " ");
    if (text) return text;
  }

  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelEl = doc.getElementById(labelledBy);
    if (labelEl) {
      const text = (labelEl.textContent || "").trim().replace(/\s+/g, " ");
      if (text) return text;
    }
  }

  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return placeholder.trim();

  const wrapper = el.closest('.field, .form-group, .form-field, [class*="field"], [class*="question"]');
  if (wrapper) {
    const heading = wrapper.querySelector('label, .label, h3, h4, legend, [class*="label"], [class*="question"]');
    if (heading) {
      const text = (heading.textContent || "").trim().replace(/\s+/g, " ");
      if (text && text.length < 200) return text;
    }
  }

  const nameAttr = el.getAttribute("name");
  if (nameAttr) return humanizeFieldName(nameAttr);

  return "Unknown Field";
}

function fieldFromElement(
  doc: DomDocument,
  el: DomElement,
  isVisible: (el: DomElement) => boolean,
  opts: { stripSelectPrompts?: RegExp } = {},
): FormField | null {
  const type = (el.getAttribute("type") || el.type || "").toLowerCase();
  if (["submit", "button", "reset", "hidden"].includes(type)) return null;
  if (!isVisible(el) && type !== "hidden") return null;

  const name = el.getAttribute("name") || el.id || "";

  let options: string[] | undefined;
  if (el.tagName.toUpperCase() === "SELECT") {
    const raw = Array.from((el as unknown as { options: ArrayLike<{ text: string }> }).options ?? []).map((o) =>
      (o.text || "").trim(),
    );
    options = raw.filter((t) => {
      if (!t) return false;
      if (opts.stripSelectPrompts?.test(t)) return false;
      return true;
    });
  }

  return {
    id: name || `field_0`,
    label: resolveLabel(doc, el),
    type: mapInputType(el),
    name: name || undefined,
    required: el.getAttribute("required") !== null || el.getAttribute("aria-required") === "true",
    options: options && options.length > 0 ? options : undefined,
    placeholder: el.getAttribute("placeholder") || undefined,
    currentValue: el.getAttribute("value") || el.value || undefined,
    selector: buildSelector(doc, el),
    category: undefined,
  };
}

// ---- ATS-specific extractors ----------------------------------------------

function extractGreenhouse(doc: DomDocument, isVisible: (el: DomElement) => boolean): FormField[] | null {
  const form = doc.querySelector('#application_form, form[action*="greenhouse"]');
  if (!form) return null;
  const inputs = Array.from(form.querySelectorAll("input, select, textarea"));
  const out: FormField[] = [];
  const seen = new Set<string>();
  for (const el of inputs) {
    const name = el.getAttribute("name") || el.id || "";
    if (!name || seen.has(name)) continue;
    if (name.startsWith("authenticity_token")) continue;
    const field = fieldFromElement(doc, el, isVisible, { stripSelectPrompts: /^(select\.\.\.|-- select --)$/i });
    if (!field) continue;
    seen.add(name);
    out.push({ ...field, id: name, name });
  }
  return out.length > 0 ? out : null;
}

function extractLever(doc: DomDocument, isVisible: (el: DomElement) => boolean): FormField[] | null {
  const form = doc.querySelector('form.posting-apply, form[action*="lever"]');
  if (!form) return null;
  const inputs = Array.from(form.querySelectorAll("input, select, textarea"));
  const out: FormField[] = [];
  const seen = new Set<string>();
  for (const el of inputs) {
    const name = el.getAttribute("name") || el.id || "";
    if (!name || seen.has(name)) continue;
    const field = fieldFromElement(doc, el, isVisible, { stripSelectPrompts: /^select\.\.\.$/i });
    if (!field) continue;
    seen.add(name);
    out.push({ ...field, id: name, name });
  }
  return out.length > 0 ? out : null;
}

function extractWorkday(doc: DomDocument, isVisible: (el: DomElement) => boolean): FormField[] | null {
  const form = doc.querySelector('[data-automation-id="jobApplicationForm"], form[data-automation-id]');
  if (!form) return null;
  const all = Array.from(form.querySelectorAll("input, select, textarea"));
  const out: FormField[] = [];
  const seen = new Set<string>();
  for (const el of all) {
    const automation = el.getAttribute("data-automation-id") || "";
    const id = automation || el.getAttribute("name") || el.id || `wd_${out.length}`;
    if (seen.has(id)) continue;
    const field = fieldFromElement(doc, el, isVisible);
    if (!field) continue;
    seen.add(id);
    out.push({
      ...field,
      id,
      selector: automation ? `[data-automation-id="${cssEscape(automation)}"]` : field.selector,
    });
  }
  return out.length > 0 ? out : null;
}

const ATS_EXTRACTORS: Record<string, (doc: DomDocument, isVisible: (el: DomElement) => boolean) => FormField[] | null> = {
  greenhouse: extractGreenhouse,
  lever: extractLever,
  workday: extractWorkday,
  ashby: () => null, // Ashby — fall through to generic
};

// ---- Generic extractor ----------------------------------------------------

export function extractGenericFormFields(
  doc: DomDocument,
  isVisible: (el: DomElement) => boolean,
): FormField[] {
  const forms = Array.from(doc.querySelectorAll("form"));
  let best: DomElement | null = null;
  let bestCount = 0;
  for (const form of forms) {
    const count = Array.from(form.querySelectorAll("input, select, textarea")).length;
    if (count > bestCount) {
      bestCount = count;
      best = form;
    }
  }
  const container: DomElement = best || doc.body;
  const inputs = Array.from(container.querySelectorAll("input, select, textarea"));
  const fields: FormField[] = [];
  const seen = new Set<string>();

  for (const el of inputs) {
    const type = (el.getAttribute("type") || el.type || "").toLowerCase();
    if (["submit", "button", "reset", "hidden", "search"].includes(type)) continue;
    const nm = (el.getAttribute("name") || "").toLowerCase();
    if (
      nm.includes("search") ||
      nm.includes("csrf") ||
      nm.includes("token") ||
      nm.includes("captcha") ||
      nm.includes("honeypot")
    ) {
      continue;
    }

    const id = el.getAttribute("name") || el.id || `field_${fields.length}`;
    if (seen.has(id)) continue;

    if (type === "radio") {
      const name = el.getAttribute("name");
      const groupKey = `radio_${name || id}`;
      if (seen.has(groupKey)) continue;
      seen.add(groupKey);

      const siblings = name
        ? Array.from(container.querySelectorAll(`input[name="${cssEscape(name)}"]`))
        : [el];
      const options = siblings.map((r) => r.getAttribute("value") || resolveLabel(doc, r));

      const groupWrapper = el.closest('fieldset, .form-group, [class*="field"], [class*="question"]');
      const heading = groupWrapper?.querySelector('legend, .label, h3, h4, [class*="label"]');
      const groupLabel = heading ? (heading.textContent || "").trim() : resolveLabel(doc, el);

      fields.push({
        id: name || id,
        label: groupLabel,
        type: "radio",
        name: name || undefined,
        required: el.getAttribute("required") !== null,
        options,
        selector: name ? `input[name="${cssEscape(name)}"]` : buildSelector(doc, el),
        category: undefined,
      });
      continue;
    }

    const field = fieldFromElement(doc, el, isVisible, {
      stripSelectPrompts: /^(select|choose|--|pick)/i,
    });
    if (!field) continue;
    seen.add(id);
    fields.push({ ...field, id });
  }

  return fields;
}

// ---- Public entry point ---------------------------------------------------

export interface ExtractFormFieldsOptions {
  getComputedStyle?: (el: unknown) => { display?: string; visibility?: string; opacity?: string };
}

/**
 * Extract all fillable form fields from a page. `url` is used to pick
 * the ATS-specific extractor.
 */
export function extractFormFields(
  doc: DomDocument,
  url: string,
  options: ExtractFormFieldsOptions = {},
): FormExtractionResult {
  const atsProvider = detectAtsProvider(url);
  const isVisible = makeIsVisible(options.getComputedStyle);

  if (atsProvider && ATS_EXTRACTORS[atsProvider]) {
    const fields = ATS_EXTRACTORS[atsProvider](doc, isVisible);
    if (fields && fields.length > 0) {
      return { fields, atsProvider, url };
    }
  }

  const fields = extractGenericFormFields(doc, isVisible);
  return { fields, atsProvider, url };
}

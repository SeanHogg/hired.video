/**
 * Stable CSS selector construction for a DOM element.
 *
 * Two consumers today, both with identical requirements:
 *
 *   1. formFields.ts — autofill needs a selector to re-find each form
 *      field on the page when it pumps an answer back.
 *   2. content-script-picker.ts — the interactive picker captures the
 *      selector the user clicked so we can replay it on future visits
 *      AND distil it into a siteConfigs.ts update prompt.
 *
 * Before this file existed, formFields.ts had its own private
 * `buildSelector` and the picker had a parallel-and-worse copy. Same
 * surface area, two implementations — exactly the DRY violation the
 * project's standards forbid. This is now the single source of truth.
 *
 * The structural DOM types let this run on both real browser DOM (the
 * picker) and jsdom (formFields server-side path + tests).
 */

interface DomElement {
  tagName: string;
  id?: string;
  getAttribute(name: string): string | null;
  parentElement?: DomElement | null;
  children?: ArrayLike<DomElement>;
}

interface DomDocument {
  body: DomElement;
}

/**
 * Escape a string for safe use inside a CSS attribute-selector quote.
 * Covers the everyday cases we hit (colon, slash, space, quotes) without
 * pulling a full CSS.escape polyfill — the upstream `CSS.escape` is
 * available in MV3 content scripts but not in jsdom.
 */
export function cssEscape(s: string): string {
  return s.replace(/(["\\\n\r\f])/g, "\\$1");
}

/**
 * Build a stable CSS selector chain for `el`, preferring high-stability
 * anchors (id, name) before falling back to tag + nth-of-type.
 *
 * Class names are deliberately NOT used — they're the first thing sites
 * rename (LinkedIn ships randomised class names with every deploy), so
 * any selector that depends on them would rot within days.
 *
 * Depth-capped at 8 segments so the result stays compact and we don't
 * pay for walking a 30-deep React tree.
 */
export interface BuildSelectorOptions {
  /** Maximum number of chain segments before stopping. Default 8. */
  maxDepth?: number;
}

export function buildSelector(
  doc: DomDocument,
  el: DomElement,
  opts: BuildSelectorOptions = {},
): string {
  const maxDepth = opts.maxDepth ?? 8;

  // Highest-stability anchors first.
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
    return `#${cssEscape(el.id)}`;
  }
  const nameAttr = el.getAttribute("name");
  if (nameAttr) {
    return `${el.tagName.toLowerCase()}[name="${cssEscape(nameAttr)}"]`;
  }

  // Chain walk: build [tag, tag, …] segments from root toward `el`.
  const parts: string[] = [];
  let current: DomElement | null = el;
  while (current && current !== doc.body) {
    if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
      parts.unshift(`#${cssEscape(current.id)}`);
      break;
    }
    const parent: DomElement | null = current.parentElement ?? null;
    if (parent) {
      const children: DomElement[] = Array.from((parent.children ?? []) as ArrayLike<DomElement>);
      const siblings = children.filter((c) => c.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
      } else {
        parts.unshift(current.tagName.toLowerCase());
      }
    } else {
      parts.unshift(current.tagName.toLowerCase());
    }
    current = parent;
    if (parts.length >= maxDepth) break;
  }
  return parts.join(" > ") || el.tagName.toLowerCase();
}

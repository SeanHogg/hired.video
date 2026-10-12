/**
 * A résumé design → a résumé TEMPLATE payload, with every trace of the person
 * removed. Pure leaf module (no runtime imports) so the API's publish path
 * (studioTemplateSnapshot.ts) and the frontend's round-trip tests run the
 * SAME strip.
 *
 * A résumé template is a studio template (`media_kind 'document'`,
 * `document_kind 'resume'`) whose payload is a DocumentState: page setup,
 * theme, and the flow-block / overlay LAYOUT. Content lives in the résumé row
 * and is never part of it. The strip is an ALLOW-list, not a deny-list, so a
 * field nobody thought of can't leak:
 *
 *   document   only the structure keys survive (the theme keeps its plain
 *              values — palette, font, density, `fontScale` text size);
 *              `entityKind` is forced to 'resume' and `entityId` to null.
 *   blocks     section / component blocks keep their binding + render
 *              options (they REFERENCE content by key, never embed it) and
 *              their heading; free text blocks keep their place with
 *              placeholder text; image blocks lose their image.
 *   overlays   `mediaBinding` (a pointer at one résumé's item) is dropped;
 *              the widget keeps geometry, numbers, booleans and style tokens
 *              only — text becomes the placeholder, every other string
 *              (names, emails, phones, links, image / video sources) goes.
 */

/** What every free-text value in a résumé template becomes. */
export const TEMPLATE_TEXT_PLACEHOLDER = "{{text}}";

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const isPrimitive = (v: unknown): v is number | boolean | null =>
  v === null || typeof v === "number" || typeof v === "boolean";

/** Top-level structure a template keeps (pages / theme handled apart). */
const DOCUMENT_KEYS = ["schemaVersion", "pageSize", "orientation", "columns", "templateId"] as const;

/** A flow block's binding + render options. `key` is the legacy spelling of
 *  `sectionKey` older layouts still carry. */
const BLOCK_KEYS = [
  "id", "kind", "sectionKey", "key", "component", "layout", "columns",
  "showHighlights", "showMedia", "sortBy", "mode",
] as const;

/** Blocks that point at the résumé's content instead of embedding it. */
const BOUND_BLOCK_KINDS: ReadonlySet<string> = new Set(["section", "component"]);

/** Widget / style keys whose string values are free text → placeholder. */
const TEXT_KEYS: ReadonlySet<string> = new Set([
  "text", "title", "heading", "subtitle", "label", "caption", "body", "content",
  "headline", "placeholder", "alt", "name", "description", "value",
]);

/** Keys whose string values are design tokens (colours, fonts, alignment,
 *  animation names, widget kinds) — the only other strings that survive. */
const STYLE_KEYS: ReadonlySet<string> = new Set([
  "id", "kind", "type", "variant", "preset", "shape", "mode", "layout",
  "color", "colour", "fill", "stroke", "background", "backgroundColor", "borderColor",
  "borderStyle", "textColor", "accent", "gradient", "blendMode",
  "fontFamily", "fontWeight", "fontStyle", "textAlign", "textTransform", "textDecoration",
  "align", "verticalAlign", "justify", "direction", "fit", "objectFit", "easing", "anchor",
]);

/** One value inside a widget, judged by the key it sits under. */
function stripValue(key: string, value: unknown): unknown {
  if (isPrimitive(value)) return value;
  if (typeof value === "string") {
    if (TEXT_KEYS.has(key)) return TEMPLATE_TEXT_PLACEHOLDER;
    return STYLE_KEYS.has(key) ? value : undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripValue(key, item)).filter((item) => item !== undefined);
  }
  if (isObject(value)) return stripRecord(value);
  return undefined;
}

function stripRecord(record: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(record)) {
    const kept = stripValue(key, value);
    if (kept !== undefined) out[key] = kept;
  }
  return out;
}

function pick(source: Json, keys: readonly string[]): Json {
  const out: Json = {};
  for (const key of keys) {
    const value = source[key];
    if (isPrimitive(value) || typeof value === "string") out[key] = value;
  }
  return out;
}

function stripBlock(block: Json): Json {
  const out = pick(block, BLOCK_KEYS);
  const kind = typeof block.kind === "string" ? block.kind : "";
  if (BOUND_BLOCK_KINDS.has(kind)) {
    // The section heading ("Work Experience") is design, not content.
    if (typeof block.title === "string") out.title = block.title;
  } else if (kind === "text") {
    out.text = TEMPLATE_TEXT_PLACEHOLDER;
    if (typeof block.title === "string") out.title = TEMPLATE_TEXT_PLACEHOLDER;
  }
  // `imageUrl` (an image block's picture) is never kept.
  if (isObject(block.box)) out.box = stripRecord(block.box);
  return out;
}

function stripOverlay(overlay: Json): Json {
  // The overlay's `mediaBinding` names one résumé's item — never kept.
  if (isObject(overlay.widget)) return { widget: stripRecord(overlay.widget) };
  // Older layouts stored the widget's fields flat on the overlay.
  const { mediaBinding: _binding, ...flat } = overlay;
  return stripRecord(flat);
}

function stripPage(page: Json, index: number): Json {
  const blocks = Array.isArray(page.blocks) ? page.blocks.filter(isObject).map(stripBlock) : [];
  const overlays = Array.isArray(page.overlays)
    ? page.overlays.filter(isObject).map(stripOverlay)
    : [];
  return { id: typeof page.id === "string" ? page.id : `page-${index + 1}`, blocks, overlays };
}

/** The content-stripped résumé template payload for any résumé design
 *  (a kit design, or a résumé's stored studio layout). Never throws; never
 *  mutates its input. */
export function stripResumeDocumentForTemplate(state: unknown): Json {
  const source = isObject(state) ? state : {};
  const theme = isObject(source.theme) ? pick(source.theme, Object.keys(source.theme)) : undefined;
  const pages = Array.isArray(source.pages) ? source.pages.filter(isObject).map(stripPage) : [];
  return {
    ...pick(source, DOCUMENT_KEYS),
    ...(theme ? { theme } : {}),
    pages,
    entityKind: "resume",
    entityId: null,
  };
}

/** Whether a stripped payload still carries a design someone can wear:
 *  a page layout, or at least the built-in design it names. */
export function isWearableResumeTemplate(payload: Json): boolean {
  const pages = payload.pages;
  return (Array.isArray(pages) && pages.length > 0) || typeof payload.templateId === "string";
}

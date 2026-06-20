/**
 * DocumentView — READ-ONLY render of a `DocumentState` + its entity content
 * (#1912 "preview === render === view"). The same flow-block order + page
 * geometry the editor (`DocumentStage`) shows, with no edit chrome — used for
 * PDF/print export ([print-document.tsx](../../../lib/studio/document/print-document.tsx))
 * and any future on-page viewer.
 *
 * Inline-styled (not Tailwind) on purpose so it renders identically inside the
 * app AND when serialized into a standalone print window via
 * `renderToStaticMarkup` (no external stylesheet to carry across).
 */
import type { CSSProperties } from "react";
import {
  type DocumentBlock,
  type DocumentEntityContent,
  type DocumentEntityKind,
  type DocumentState,
  pageDimensions,
} from "@/lib/studio/editor-v2/document-state";
import {
  resolveDocumentTheme,
  type ResolvedDocumentTheme,
} from "@/lib/studio/editor-v2/document-theme";
import {
  documentSectionSchema,
  type DocumentSectionSchema,
  type SectionFieldDef,
} from "@/lib/studio/document/document-field-schema";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2019-03" / "2019-03-21" → "Mar 2019"; anything else passes through. */
export function formatDocDate(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(raw.trim());
  if (!m) return raw.trim();
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : raw.trim();
}

/** A formatted "Start – End" range, "Start – Present" when the end is blank. */
export function formatDateRange(start: unknown, end: unknown): string {
  const s = formatDocDate(start);
  const e = formatDocDate(end);
  if (!s && !e) return "";
  if (s && !e) return `${s} – Present`;
  if (!s && e) return e;
  return `${s} – ${e}`;
}

interface DocumentViewProps {
  state: DocumentState;
  content?: DocumentEntityContent | null;
  /** Print mode drops the on-screen page shadow/ring (the print sheet is the
   *  paper itself). */
  forPrint?: boolean;
}

function rec(content: DocumentEntityContent | null | undefined): Record<string, unknown> {
  return (content ?? {}) as Record<string, unknown>;
}

export default function DocumentView({ state, content, forPrint }: DocumentViewProps) {
  const { width, height } = pageDimensions(state);
  const page = state.pages[0];
  const theme = resolveDocumentTheme(state.theme);

  const pageStyle: CSSProperties = {
    width,
    minHeight: height,
    background: "#fff",
    color: theme.text,
    fontFamily: theme.fontFamily,
    padding: 48,
    boxSizing: "border-box",
    position: "relative",
    margin: forPrint ? 0 : "0 auto",
    ...(forPrint ? {} : { boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }),
  };

  const flowBlocks = page?.blocks.filter((b) => b.mode === "flow") ?? [];
  const absoluteBlocks = page?.blocks.filter((b) => b.mode === "absolute") ?? [];

  return (
    <div style={pageStyle}>
      {flowBlocks.map((b) => (
        <BlockView key={b.id} block={b} entityKind={state.entityKind} content={content} theme={theme} />
      ))}
      {absoluteBlocks.map((b) => {
        const box = b.box ?? { x: 0.1, y: 0.1, width: 0.4, height: 0.2, z: 1 };
        return (
          <div
            key={b.id}
            style={{
              position: "absolute",
              left: box.x * width,
              top: box.y * height,
              width: box.width * width,
              zIndex: box.z,
            }}
          >
            <BlockView block={b} entityKind={state.entityKind} content={content} theme={theme} />
          </div>
        );
      })}
      {(page?.overlays ?? []).map((o) => {
        const p = o.widget.position;
        const params = o.widget.params as Record<string, unknown>;
        const url = typeof params.url === "string" ? params.url : null;
        return (
          <div
            key={o.widget.id}
            style={{
              position: "absolute",
              left: p.x * width,
              top: p.y * height,
              width: p.width * width,
              height: p.height * height,
              zIndex: p.z,
              transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
            }}
          >
            {url ? (
              <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Read-only render of ONE document block (heading + content) — the canonical
 *  read renderer. Reused by `DocumentStage` so the on-canvas non-edit view and
 *  the PDF/export view never drift (DRY). */
export function BlockView({
  block,
  entityKind,
  content,
  theme,
}: {
  block: DocumentBlock;
  entityKind: DocumentEntityKind;
  content?: DocumentEntityContent | null;
  theme: ResolvedDocumentTheme;
}) {
  if (block.kind === "divider") {
    return <hr style={{ border: 0, borderTop: `1px solid ${theme.accentBorder}`, margin: "12px 0" }} />;
  }
  if (block.kind === "spacer") return <div style={{ height: 24 }} />;
  if (block.kind === "text") {
    return (
      <p style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6, margin: "6px 0" }}>
        {block.text ?? ""}
      </p>
    );
  }
  if (block.kind === "image") {
    return block.imageUrl ? (
      <img src={block.imageUrl} alt="" style={{ maxWidth: "100%", borderRadius: 4 }} />
    ) : null;
  }
  // section / component — render by the schema's shape (array list vs single
  // object). Resume `basics` keeps its bespoke contact-header render.
  if (block.sectionKey === "basics") {
    return <BasicsView content={content} theme={theme} />;
  }
  const schema = documentSectionSchema(entityKind, block.sectionKey);
  if (schema?.shape === "object") {
    return <ObjectSectionView block={block} schema={schema} content={content} theme={theme} />;
  }
  return <SectionView block={block} entityKind={entityKind} content={content} theme={theme} />;
}

function BasicsView({
  content,
  theme,
}: {
  content?: DocumentEntityContent | null;
  theme: ResolvedDocumentTheme;
}) {
  const basics = (rec(content).basics ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof basics[k] === "string" ? (basics[k] as string) : "");
  const contactBits = [str("email"), str("phone"), str("url")].filter(Boolean);
  if (!str("name") && contactBits.length === 0 && !str("summary")) return null;
  return (
    <header style={{ marginBottom: theme.sectionGap }}>
      {str("name") && (
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: theme.heading }}>{str("name")}</h1>
      )}
      {str("label") && (
        <div style={{ fontSize: 14, color: theme.accent, marginTop: 2 }}>{str("label")}</div>
      )}
      {contactBits.length > 0 && (
        <div style={{ fontSize: 12, color: theme.muted, marginTop: 6 }}>
          {contactBits.join("  ·  ")}
        </div>
      )}
      {str("summary") && (
        <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8, whiteSpace: "pre-wrap" }}>
          {str("summary")}
        </p>
      )}
    </header>
  );
}

function SectionHeading({
  title,
  theme,
}: {
  title: string;
  theme: ResolvedDocumentTheme;
}) {
  const deco = theme.headingDecoration;
  return (
    <h2
      style={{
        fontSize: 12,
        fontWeight: 700,
        textTransform: deco.textTransform,
        letterSpacing: deco.letterSpacing,
        color: theme.accent,
        borderBottom: deco.borderBottom,
        paddingBottom: deco.paddingBottom,
        margin: "0 0 8px",
      }}
    >
      {title}
    </h2>
  );
}

/** Read-only render of an OBJECT section (jobs: a slice of the flat record).
 *  Renders each non-empty field by type: textarea → prose, list → bullets,
 *  image → image, select → its option label, text/number → a meta line. */
function ObjectSectionView({
  block,
  schema,
  content,
  theme,
}: {
  block: DocumentBlock;
  schema: import("@/lib/studio/document/document-field-schema").DocumentSectionSchema;
  content?: DocumentEntityContent | null;
  theme: ResolvedDocumentTheme;
}) {
  const obj = schema.objectPath
    ? ((rec(content)[schema.objectPath] ?? {}) as Record<string, unknown>)
    : rec(content);
  const rendered = schema.fields
    .map((f) => renderObjectField(f, obj[f.key], theme))
    .filter(Boolean);
  if (rendered.length === 0) return null;
  return (
    <section style={{ marginBottom: theme.sectionGap }}>
      <SectionHeading title={block.title ?? schema.label} theme={theme} />
      {rendered}
    </section>
  );
}

function renderObjectField(
  field: SectionFieldDef,
  value: unknown,
  theme: ResolvedDocumentTheme,
): React.ReactNode {
  if (field.type === "textarea") {
    const v = typeof value === "string" ? value : "";
    return v ? (
      <p key={field.key} style={{ fontSize: 12.5, lineHeight: 1.5, margin: "4px 0", whiteSpace: "pre-wrap" }}>
        {v}
      </p>
    ) : null;
  }
  if (field.type === "list") {
    const arr = Array.isArray(value) ? (value as unknown[]) : [];
    if (arr.length === 0) return null;
    return (
      <ul key={field.key} style={{ margin: "4px 0", paddingLeft: 18 }}>
        {arr.map((x, i) => (
          <li key={i} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
            {String(x)}
          </li>
        ))}
      </ul>
    );
  }
  if (field.type === "image") {
    const url = typeof value === "string" ? value : "";
    return url ? (
      <img key={field.key} src={url} alt="" style={{ maxWidth: "100%", borderRadius: 4, margin: "4px 0" }} />
    ) : null;
  }
  if (field.type === "select") {
    const v = value === undefined || value === null ? "" : String(value);
    const label = field.options?.find((o) => o.value === v)?.label;
    return label ? (
      <div key={field.key} style={{ fontSize: 12, color: theme.muted }}>
        {field.label}: {label}
      </div>
    ) : null;
  }
  if (field.type === "multiselect") {
    const arr = Array.isArray(value) ? (value as unknown[]).map(String) : [];
    const labels = (field.options ?? [])
      .filter((o) => arr.includes(o.value))
      .map((o) => o.label);
    return labels.length > 0 ? (
      <div key={field.key} style={{ fontSize: 12, color: theme.muted }}>
        {field.label}: {labels.join(", ")}
      </div>
    ) : null;
  }
  // A "title" field renders as the section's prominent heading, not a meta line.
  if (field.key === "title") {
    const v = typeof value === "string" ? value : "";
    return v ? (
      <div key={field.key} style={{ fontSize: 18, fontWeight: 700, color: theme.heading, margin: "2px 0 6px" }}>
        {v}
      </div>
    ) : null;
  }
  // text / number / date / day
  const v = field.type === "number" ? (typeof value === "number" ? String(value) : "") : (typeof value === "string" ? value : "");
  return v ? (
    <div key={field.key} style={{ fontSize: 12.5, color: theme.heading, margin: "2px 0" }}>
      {field.label}: {v}
    </div>
  ) : null;
}

function SectionView({
  block,
  entityKind,
  content,
  theme,
}: {
  block: DocumentBlock;
  entityKind: DocumentEntityKind;
  content?: DocumentEntityContent | null;
  theme: ResolvedDocumentTheme;
}) {
  const schema = documentSectionSchema(entityKind, block.sectionKey);
  const rows = rec(content)[block.sectionKey ?? ""];
  const items = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  if (items.length === 0) return null;
  return (
    <section style={{ marginBottom: theme.sectionGap }}>
      <SectionHeading title={block.title ?? block.sectionKey ?? "Section"} theme={theme} />
      {items.map((item, i) => (
        <ItemView key={(item.id as string) ?? i} item={item} schema={schema} theme={theme} />
      ))}
    </section>
  );
}

function ItemView({
  item,
  schema,
  theme,
}: {
  item: Record<string, unknown>;
  schema: DocumentSectionSchema | null;
  theme: ResolvedDocumentTheme;
}) {
  // Schema-faithful entry render: first text field = bold primary; the section's
  // `dateRange` pair renders as a right-aligned, formatted "Start – End"; other
  // text + standalone date fields = a muted meta line; textarea = paragraphs;
  // list = bullets. Dates are humanized ("2019-03" → "Mar 2019").
  const fields: SectionFieldDef[] = schema?.fields ?? [];
  const range = schema?.dateRange;
  const rangeKeys = new Set([range?.start, range?.end].filter(Boolean) as string[]);
  const val = (k: string) => (typeof item[k] === "string" ? (item[k] as string) : "");

  const textFields = fields.filter((f) => f.type === "text");
  const standaloneDates = fields.filter(
    (f) => (f.type === "date" || f.type === "day") && !rangeKeys.has(f.key),
  );
  const listFields = fields.filter((f) => f.type === "list" || f.type === "chips");
  const proseFields = fields.filter((f) => f.type === "textarea");

  const primary = textFields[0] ? val(textFields[0].key) : "";
  const meta = [
    ...textFields.slice(1).map((f) => val(f.key)),
    ...standaloneDates.map((f) => formatDocDate(item[f.key])),
  ]
    .filter(Boolean)
    .join("  ·  ");
  const rangeText = range ? formatDateRange(item[range.start], item[range.end]) : "";

  return (
    <div style={{ marginBottom: theme.entryGap }}>
      {(primary || rangeText) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          {primary && <div style={{ fontSize: 13, fontWeight: 600, color: theme.heading }}>{primary}</div>}
          {rangeText && (
            <div style={{ fontSize: 11.5, color: theme.muted, whiteSpace: "nowrap" }}>{rangeText}</div>
          )}
        </div>
      )}
      {meta && <div style={{ fontSize: 12, color: theme.muted }}>{meta}</div>}
      {proseFields.map((f) =>
        val(f.key) ? (
          <p key={f.key} style={{ fontSize: 12.5, lineHeight: 1.5, margin: "4px 0", whiteSpace: "pre-wrap" }}>
            {val(f.key)}
          </p>
        ) : null,
      )}
      {listFields.map((f) => {
        const arr = Array.isArray(item[f.key]) ? (item[f.key] as unknown[]) : [];
        if (arr.length === 0) return null;
        return (
          <ul key={f.key} style={{ margin: "4px 0", paddingLeft: 18 }}>
            {arr.map((x, i) => (
              <li key={i} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                {String(x)}
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}

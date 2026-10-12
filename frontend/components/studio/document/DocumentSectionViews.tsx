/**
 * The read-only section views of the document renderer (DocumentView): the
 * résumé contact header, a themed section heading, object sections (a job's
 * slices of its flat record), array sections and their items — plus the
 * card chrome a section sits in (#2152(1)): the theme's `cardStyle`
 * (elevated / flat / bordered / ghost), the same choice the declarative
 * résumé renderer offers, as inline styles so the print window keeps it.
 *
 * Inline-styled on purpose (serialized by `renderToStaticMarkup` into a
 * stylesheet-less print window — see DocumentView).
 */
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  DocumentBlock,
  DocumentEntityContent,
  DocumentEntityKind,
  DocumentTheme,
} from "@/lib/studio/editor-v2/document-state";
import type { ResolvedDocumentTheme } from "@/lib/studio/editor-v2/document-theme";
import {
  documentSectionSchema,
  localizedLabel,
  type DocumentSectionSchema,
  type SectionFieldDef,
  type Translate,
} from "@/lib/studio/document/document-field-schema";
import { formatDateRange, formatDocDate } from "@/lib/studio/document/document-dates";

export type DocumentCardStyle = NonNullable<DocumentTheme["cardStyle"]>;

function rec(content: DocumentEntityContent | null | undefined): Record<string, unknown> {
  return (content ?? {}) as Record<string, unknown>;
}

/** The card a section sits in, per the theme's card style — tokens from the
 *  resolved document palette (paper is always white). */
export function sectionCardStyle(cardStyle: DocumentCardStyle | undefined, theme: ResolvedDocumentTheme): CSSProperties {
  switch (cardStyle) {
    case "elevated":
      return { border: `1px solid ${theme.muted}33`, borderRadius: 8, padding: 12, boxShadow: `0 1px 3px ${theme.heading}1f` };
    case "bordered":
      return { border: `2px solid ${theme.accentBorder}`, borderRadius: 8, padding: 12 };
    case "flat":
      return { background: `${theme.muted}14`, borderRadius: 8, padding: 12 };
    case "ghost":
    default:
      return {};
  }
}

/** One section on the page: its heading and body, in the theme's card. */
function SectionCard({ title, cardStyle, theme, children }: { title: string; cardStyle?: DocumentCardStyle; theme: ResolvedDocumentTheme; children: ReactNode }) {
  return (
    <section style={{ marginBottom: theme.sectionGap }}>
      <SectionHeading title={title} theme={theme} />
      <div data-doc-card={cardStyle ?? "ghost"} style={sectionCardStyle(cardStyle, theme)}>
        {children}
      </div>
    </section>
  );
}

export function BasicsView({
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
export function ObjectSectionView({
  block,
  schema,
  content,
  theme,
  cardStyle,
}: {
  block: DocumentBlock;
  schema: DocumentSectionSchema;
  content?: DocumentEntityContent | null;
  theme: ResolvedDocumentTheme;
  cardStyle?: DocumentCardStyle;
}) {
  const { t } = useTranslation();
  const obj = schema.objectPath
    ? ((rec(content)[schema.objectPath] ?? {}) as Record<string, unknown>)
    : rec(content);
  const rendered = schema.fields
    .map((f) => renderObjectField(f, obj[f.key], theme, t))
    .filter(Boolean);
  if (rendered.length === 0) return null;
  return (
    <SectionCard title={block.title ?? localizedLabel(schema, t)} cardStyle={cardStyle} theme={theme}>
      {rendered}
    </SectionCard>
  );
}

function renderObjectField(
  field: SectionFieldDef,
  value: unknown,
  theme: ResolvedDocumentTheme,
  t: Translate,
): React.ReactNode {
  const label = localizedLabel(field, t);
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
    const option = field.options?.find((o) => o.value === v);
    return option ? (
      <div key={field.key} style={{ fontSize: 12, color: theme.muted }}>
        {label}: {localizedLabel(option, t)}
      </div>
    ) : null;
  }
  if (field.type === "multiselect") {
    const arr = Array.isArray(value) ? (value as unknown[]).map(String) : [];
    const labels = (field.options ?? [])
      .filter((o) => arr.includes(o.value))
      .map((o) => localizedLabel(o, t));
    return labels.length > 0 ? (
      <div key={field.key} style={{ fontSize: 12, color: theme.muted }}>
        {label}: {labels.join(", ")}
      </div>
    ) : null;
  }
  // The schema's heading field (a job's title, a company's name — #1915)
  // renders as the section's prominent heading, not a meta line.
  if (field.heading) {
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
      {label}: {v}
    </div>
  ) : null;
}

export function SectionView({
  block,
  entityKind,
  content,
  theme,
  cardStyle,
}: {
  block: DocumentBlock;
  entityKind: DocumentEntityKind;
  content?: DocumentEntityContent | null;
  theme: ResolvedDocumentTheme;
  cardStyle?: DocumentCardStyle;
}) {
  const { t } = useTranslation();
  const schema = documentSectionSchema(entityKind, block.sectionKey);
  const rows = rec(content)[block.sectionKey ?? ""];
  const items = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  if (items.length === 0) return null;
  return (
    <SectionCard
      title={block.title ?? (schema ? localizedLabel(schema, t) : block.sectionKey ?? t("studioFields.section"))}
      cardStyle={cardStyle}
      theme={theme}
    >
      {items.map((item, i) => (
        <ItemView key={(item.id as string) ?? i} item={item} schema={schema} theme={theme} />
      ))}
    </SectionCard>
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
  const { t, i18n } = useTranslation();
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
    ...standaloneDates.map((f) => formatDocDate(item[f.key], i18n.language)),
  ]
    .filter(Boolean)
    .join("  ·  ");
  const rangeText = range
    ? formatDateRange(item[range.start], item[range.end], i18n.language, t("studioFields.present"))
    : "";

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

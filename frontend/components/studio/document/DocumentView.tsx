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
import type { ResumeData } from "@/types/resume";
import {
  type DocumentBlock,
  type DocumentState,
  pageDimensions,
} from "@/lib/studio/editor-v2/document-state";
import {
  resolveDocumentTheme,
  type ResolvedDocumentTheme,
} from "@/lib/studio/editor-v2/document-theme";
import {
  resumeSectionSchema,
  type SectionFieldDef,
} from "@/lib/studio/document/resume-field-schema";

interface DocumentViewProps {
  state: DocumentState;
  content?: ResumeData | null;
  /** Print mode drops the on-screen page shadow/ring (the print sheet is the
   *  paper itself). */
  forPrint?: boolean;
}

function rec(content: ResumeData | null | undefined): Record<string, unknown> {
  return (content ?? {}) as unknown as Record<string, unknown>;
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
        <BlockView key={b.id} block={b} content={content} theme={theme} />
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
            <BlockView block={b} content={content} theme={theme} />
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

function BlockView({
  block,
  content,
  theme,
}: {
  block: DocumentBlock;
  content?: ResumeData | null;
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
  // section / component
  if (block.sectionKey === "basics") {
    return <BasicsView content={content} theme={theme} />;
  }
  return <SectionView block={block} content={content} theme={theme} />;
}

function BasicsView({
  content,
  theme,
}: {
  content?: ResumeData | null;
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

function SectionView({
  block,
  content,
  theme,
}: {
  block: DocumentBlock;
  content?: ResumeData | null;
  theme: ResolvedDocumentTheme;
}) {
  const schema = resumeSectionSchema(block.sectionKey);
  const rows = rec(content)[block.sectionKey ?? ""];
  const items = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  if (items.length === 0) return null;
  const deco = theme.headingDecoration;
  return (
    <section style={{ marginBottom: theme.sectionGap }}>
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
        {block.title ?? block.sectionKey}
      </h2>
      {items.map((item, i) => (
        <ItemView
          key={(item.id as string) ?? i}
          item={item}
          fields={schema?.fields ?? []}
          theme={theme}
        />
      ))}
    </section>
  );
}

function ItemView({
  item,
  fields,
  theme,
}: {
  item: Record<string, unknown>;
  fields: SectionFieldDef[];
  theme: ResolvedDocumentTheme;
}) {
  // Heuristic faithful render from the schema: first text field = bold primary;
  // remaining text/date fields = a muted meta line; list fields = bullets;
  // textarea fields = paragraphs.
  const textFields = fields.filter((f) => f.type === "text" || f.type === "date");
  const listFields = fields.filter((f) => f.type === "list");
  const proseFields = fields.filter((f) => f.type === "textarea");
  const val = (k: string) => (typeof item[k] === "string" ? (item[k] as string) : "");

  const primary = textFields[0] ? val(textFields[0].key) : "";
  const meta = textFields
    .slice(1)
    .map((f) => val(f.key))
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div style={{ marginBottom: theme.entryGap }}>
      {primary && <div style={{ fontSize: 13, fontWeight: 600, color: theme.heading }}>{primary}</div>}
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

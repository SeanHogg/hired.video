/**
 * DocumentView — READ-ONLY render of a `DocumentState` + its entity content
 * (#1912 "preview === render === view"). The same flow-block order + page
 * geometry the editor (`DocumentStage`) shows, with no edit chrome — used for
 * PDF/print export ([print-document.tsx](./print-document.tsx))
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
import { documentSectionSchema } from "@/lib/studio/document/document-field-schema";
import {
  BasicsView,
  ObjectSectionView,
  SectionView,
  type DocumentCardStyle,
} from "@/components/studio/document/DocumentSectionViews";

interface DocumentViewProps {
  state: DocumentState;
  content?: DocumentEntityContent | null;
  /** Print mode drops the on-screen page shadow/ring (the print sheet is the
   *  paper itself). */
  forPrint?: boolean;
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
        <BlockView key={b.id} block={b} entityKind={state.entityKind} content={content} theme={theme} cardStyle={state.theme.cardStyle} />
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
            <BlockView block={b} entityKind={state.entityKind} content={content} theme={theme} cardStyle={state.theme.cardStyle} />
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
  cardStyle,
}: {
  block: DocumentBlock;
  entityKind: DocumentEntityKind;
  content?: DocumentEntityContent | null;
  theme: ResolvedDocumentTheme;
  /** The theme's section card (#2152(1)); absent = no card. */
  cardStyle?: DocumentCardStyle;
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
    return <ObjectSectionView block={block} schema={schema} content={content} theme={theme} cardStyle={cardStyle} />;
  }
  return <SectionView block={block} entityKind={entityKind} content={content} theme={theme} cardStyle={cardStyle} />;
}


/**
 * DocumentBlockView — one block on the studio document editor's page
 * (BlockDocumentStage): the selection frame + its action bar (move up /
 * down, detach to a free position or return to flow, delete) over the
 * block's body. Section blocks edit inline (SectionEditor) when content and
 * `onContentChange` are bound; otherwise they render through the SAME read
 * renderer the PDF export uses (DocumentView's BlockView).
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlignLeft, ArrowDown, ArrowUp, Maximize2, Trash2 } from "lucide-react";
import SectionEditor from "@/components/studio/document/SectionEditor";
import { BlockView } from "@/components/studio/document/DocumentView";
import { documentSectionSchema, localizedLabel } from "@/lib/studio/document/document-field-schema";
import type { DocumentBlock, DocumentEntityContent, DocumentEntityKind } from "@/lib/studio/editor-v2/document-state";
import type { ResolvedDocumentTheme } from "@/lib/studio/editor-v2/document-theme";
import type { DocumentCardStyle } from "@/components/studio/document/DocumentSectionViews";
import { cn } from "@/lib/utils";

interface BodyProps {
  block: DocumentBlock;
  entityKind: DocumentEntityKind;
  entityContent?: DocumentEntityContent | null;
  theme: ResolvedDocumentTheme;
  /** The theme's section card, so the canvas matches the export. */
  cardStyle?: DocumentCardStyle;
  onContentChange?: (next: DocumentEntityContent) => void;
  onCommitText?: (text: string) => void;
}

interface DocumentBlockViewProps extends BodyProps {
  selected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete: () => void;
  onDetach?: () => void;
  onReflow?: () => void;
}

/** A small icon button with a transparent 44px hit area. */
function BarButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "relative flex h-7 w-7 items-center justify-center rounded-full after:absolute after:-inset-2 after:content-['']",
        danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-muted hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

export default function DocumentBlockView({
  selected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  onDetach,
  onReflow,
  ...body
}: DocumentBlockViewProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "group relative rounded-md border p-3 transition",
        selected ? "border-brand-primary ring-2 ring-brand-primary/40" : "border-transparent hover:border-slate-200",
      )}
      onClick={onSelect}
      role="presentation"
    >
      {/* Per-block action bar — shown when selected. */}
      {selected && (
        <div className="absolute -top-4 right-2 z-10 flex items-center gap-2 rounded-full border border-border bg-card px-1 py-0.5 shadow-sm">
          {onMoveUp && (
            <BarButton label={t("studio.document.block.moveUp")} onClick={onMoveUp}>
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            </BarButton>
          )}
          {onMoveDown && (
            <BarButton label={t("studio.document.block.moveDown")} onClick={onMoveDown}>
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </BarButton>
          )}
          {onDetach && (
            <BarButton label={t("studio.document.block.detach")} onClick={onDetach}>
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </BarButton>
          )}
          {onReflow && (
            <BarButton label={t("studio.document.block.reflow")} onClick={onReflow}>
              <AlignLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </BarButton>
          )}
          <BarButton label={t("studio.document.block.delete")} onClick={onDelete} danger>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </BarButton>
        </div>
      )}
      <BlockBody {...body} />
    </div>
  );
}

function BlockBody({ block, entityKind, entityContent, theme, cardStyle, onContentChange, onCommitText }: BodyProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.text ?? "");

  if (block.kind === "divider") return <hr className="my-2 border-slate-300" />;
  if (block.kind === "spacer") return <div className="h-8" aria-hidden="true" />;
  if (block.kind === "text") {
    // Double-click to edit inline — a first slice of "the canvas is the form"
    // (#1916). Commits on blur.
    if (editing && onCommitText) {
      return (
        <textarea
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onCommitText(draft);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full resize-y rounded border border-brand-primary/40 bg-white p-1 text-sm leading-relaxed text-slate-700 outline-none"
          rows={3}
        />
      );
    }
    return (
      <p
        className="cursor-text whitespace-pre-wrap text-sm leading-relaxed text-slate-700"
        onDoubleClick={(e) => {
          if (!onCommitText) return;
          e.stopPropagation();
          setDraft(block.text ?? "");
          setEditing(true);
        }}
        title={onCommitText ? t("studio.doubleClickToEdit") : undefined}
      >
        {block.text || t("studio.document.block.textPlaceholder")}
      </p>
    );
  }
  if (block.kind === "image") {
    return block.imageUrl ? (
      <img src={block.imageUrl} alt="" className="max-h-40 rounded object-contain" />
    ) : (
      <div className="flex h-24 items-center justify-center rounded bg-slate-100 text-xs text-slate-400">{t("studio.element.image")}</div>
    );
  }
  // section / component. Inline the null/schema checks (not a hoisted bool) so
  // TS narrows entityContent + onContentChange to non-null in the edit branch.
  if (onContentChange && entityContent && documentSectionSchema(entityKind, block.sectionKey)) {
    return (
      <div>
        <h3
          className="mb-1 pb-0.5 text-sm font-semibold"
          style={{
            color: theme.accent,
            textTransform: theme.headingDecoration.textTransform,
            letterSpacing: theme.headingDecoration.letterSpacing,
            borderBottom: theme.headingDecoration.borderBottom,
            paddingBottom: theme.headingDecoration.paddingBottom,
          }}
        >
          {block.title ?? localizedLabel(documentSectionSchema(entityKind, block.sectionKey)!, t)}
        </h3>
        <SectionEditor entityKind={entityKind} sectionKey={block.sectionKey as string} content={entityContent} onChange={onContentChange} />
      </div>
    );
  }
  // Non-editable → the SAME canonical read renderer the PDF/export view uses,
  // so on-canvas WYSIWYG and the export never drift (#1912/#2152).
  if (!entityContent || !sectionHasContent(entityKind, entityContent, block.sectionKey)) {
    return (
      <p className="text-xs italic text-slate-400">
        {t("studio.document.block.noContent", { what: block.sectionKey ?? t("studio.document.block.content") })}
      </p>
    );
  }
  return <BlockView block={block} entityKind={entityKind} content={entityContent} theme={theme} cardStyle={cardStyle} />;
}

/** Schema-aware "does this section have anything to render?" — array sections
 *  need ≥1 item; object sections (resume basics by `objectPath`, jobs at the
 *  flat root) need ≥1 set field. Drives the "No X yet" placeholder. */
function sectionHasContent(entityKind: DocumentEntityKind, content: DocumentEntityContent, sectionKey: string | undefined): boolean {
  const schema = documentSectionSchema(entityKind, sectionKey);
  if (!schema) return false;
  const root = content as Record<string, unknown>;
  if (schema.shape === "array") {
    const rows = root[schema.sectionKey];
    return Array.isArray(rows) && rows.length > 0;
  }
  const obj = schema.objectPath ? root[schema.objectPath] : root;
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return schema.fields.some((f) => {
    const v = o[f.key];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  });
}

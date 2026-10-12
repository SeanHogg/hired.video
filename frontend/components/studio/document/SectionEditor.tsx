/**
 * SectionEditor — inline, field-bound editing of a document section on the
 * canvas (#1916, "the canvas is the form"). Driven by the declarative
 * `document-field-schema.ts` + the shared [FieldGroupEditor](../fields/FieldGroupEditor.tsx)
 * engine, so it handles every editable section of every entity (resume / job …)
 * with one component. Edits produce a fresh content record via `onChange`; the
 * host owns persistence (write-back to the entity row on save).
 *
 * Two shapes (from the schema):
 *   • "array"  — a list of items (resume work / education …); add/remove
 *     preserve each item's stable `id` (resume items carry one for
 *     skill-evidence + metaData binding — see [[project_skill_evidence]]).
 *   • "object" — one object's fields, at a nested key (resume `basics`) or the
 *     content root (the flat job record).
 */
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { FieldGroupEditor } from "@/components/studio/fields/FieldGroupEditor";
import { SECTION_IMPORTERS } from "@/components/studio/document/section-importers";
import type { DocumentEntityContent, DocumentEntityKind } from "@/lib/studio/editor-v2/document-state";
import {
  documentSectionSchema,
  type DocumentSectionSchema,
} from "@/lib/studio/document/document-field-schema";
import { validateDateRange } from "@/lib/studio/document/field-validation";

interface SectionEditorProps {
  entityKind: DocumentEntityKind;
  sectionKey: string;
  content: DocumentEntityContent;
  onChange: (next: DocumentEntityContent) => void;
}

type Item = Record<string, unknown>;

function asRecord(content: DocumentEntityContent): Record<string, unknown> {
  return content as Record<string, unknown>;
}

function itemsFor(content: DocumentEntityContent, sectionKey: string): Item[] {
  const rows = asRecord(content)[sectionKey];
  return Array.isArray(rows) ? (rows as Item[]) : [];
}

function writeItems(
  content: DocumentEntityContent,
  sectionKey: string,
  items: Item[],
): DocumentEntityContent {
  return { ...asRecord(content), [sectionKey]: items };
}

export default function SectionEditor({
  entityKind,
  sectionKey,
  content,
  onChange,
}: SectionEditorProps) {
  const schema = documentSectionSchema(entityKind, sectionKey);
  if (!schema) return null;
  if (schema.shape === "object") {
    return <ObjectEditor schema={schema} content={content} onChange={onChange} />;
  }
  return <ArrayEditor schema={schema} content={content} onChange={onChange} />;
}

/** Array section — a list of items, each carrying the schema's fields. */
function ArrayEditor({
  schema,
  content,
  onChange,
}: {
  schema: DocumentSectionSchema;
  content: DocumentEntityContent;
  onChange: (next: DocumentEntityContent) => void;
}) {
  const { t } = useTranslation();
  const items = itemsFor(content, schema.sectionKey);
  const Importer = SECTION_IMPORTERS[schema.sectionKey];

  const setItem = (idx: number, key: string, value: unknown) => {
    const next = items.map((it, i) => (i === idx ? { ...it, [key]: value } : it));
    onChange(writeItems(content, schema.sectionKey, next));
  };
  // Insert a fresh item at a specific index (clamped). `at === items.length`
  // appends — the "Add" button's behaviour — while a per-item "Insert below"
  // drops the new item right after that row so the user can build their list
  // in order instead of always appending to the bottom.
  const insertItemAt = (at: number) => {
    const idx = Math.max(0, Math.min(at, items.length));
    const next = [...items.slice(0, idx), schema.newItem(), ...items.slice(idx)];
    onChange(writeItems(content, schema.sectionKey, next));
  };
  // Reorder a single item up/down within its section — the item-level mirror of
  // the section-block Move up/down in DocumentStage. Each item carries a stable
  // `id`, so swapping positions preserves skill-evidence / metaData binding.
  const moveItem = (idx: number, dir: "up" | "down") => {
    const to = dir === "up" ? idx - 1 : idx + 1;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[idx], next[to]] = [next[to], next[idx]];
    onChange(writeItems(content, schema.sectionKey, next));
  };
  const importItems = (incoming: Item[]) => {
    onChange(writeItems(content, schema.sectionKey, [...items, ...incoming]));
  };
  const removeItem = (idx: number) => {
    onChange(writeItems(content, schema.sectionKey, items.filter((_, i) => i !== idx)));
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-xs italic text-muted-foreground">{t("studioFields.empty")}</p>
      )}
      {items.map((item, idx) => (
        <div
          key={(item.id as string) ?? idx}
          className="relative rounded border border-border p-2"
        >
          {/* Per-item action bar — reorder + insert + remove, mirroring the
              section-block bar in DocumentStage so items move "like sections". */}
          <div className="absolute right-1 top-1 flex items-center gap-0.5">
            <button
              type="button"
              aria-label={t("studioFields.moveUp")}
              title={t("studioFields.moveUp")}
              disabled={idx === 0}
              className="p-1 text-muted-foreground hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-30"
              onClick={(e) => {
                e.stopPropagation();
                moveItem(idx, "up");
              }}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={t("studioFields.moveDown")}
              title={t("studioFields.moveDown")}
              disabled={idx === items.length - 1}
              className="p-1 text-muted-foreground hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-30"
              onClick={(e) => {
                e.stopPropagation();
                moveItem(idx, "down");
              }}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={t("studioFields.insertBelow")}
              title={t("studioFields.insertBelow")}
              className="p-1 text-muted-foreground hover:text-brand-primary"
              onClick={(e) => {
                e.stopPropagation();
                insertItemAt(idx + 1);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label={t("studioFields.removeEntry")}
              title={t("studioFields.removeEntry")}
              className="p-1 text-muted-foreground hover:text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                removeItem(idx);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <FieldGroupEditor
            fields={schema.fields}
            values={item}
            onChange={(key, value) => setItem(idx, key, value)}
            crossFieldErrors={validateDateRange(schema, item)}
            className="pt-6"
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-brand-primary hover:text-brand-primary"
          onClick={(e) => {
            e.stopPropagation();
            insertItemAt(items.length);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("studioFields.addEntry")}
        </button>
        {Importer && <Importer existing={items} onImport={importItems} />}
      </div>
    </div>
  );
}

/** Object section — one object's fields, at `schema.objectPath` (resume
 *  `basics`) or the content root (the flat job record) when omitted. */
function ObjectEditor({
  schema,
  content,
  onChange,
}: {
  schema: DocumentSectionSchema;
  content: DocumentEntityContent;
  onChange: (next: DocumentEntityContent) => void;
}) {
  const root = asRecord(content);
  const obj = schema.objectPath
    ? ((root[schema.objectPath] ?? {}) as Record<string, unknown>)
    : root;
  const setField = (key: string, value: unknown) => {
    if (schema.objectPath) {
      onChange({ ...root, [schema.objectPath]: { ...obj, [key]: value } });
    } else {
      onChange({ ...root, [key]: value });
    }
  };
  return (
    <FieldGroupEditor
      fields={schema.fields}
      values={obj}
      onChange={setField}
      crossFieldErrors={validateDateRange(schema, obj)}
    />
  );
}

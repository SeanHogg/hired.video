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
import { Plus, Trash2 } from "lucide-react";
import { FieldGroupEditor } from "@/components/studio/fields/FieldGroupEditor";
import type { DocumentEntityContent, DocumentEntityKind } from "@/lib/studio/editor-v2/document-state";
import {
  documentSectionSchema,
  type DocumentSectionSchema,
} from "@/lib/studio/document/document-field-schema";

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
  const items = itemsFor(content, schema.sectionKey);

  const setItem = (idx: number, key: string, value: unknown) => {
    const next = items.map((it, i) => (i === idx ? { ...it, [key]: value } : it));
    onChange(writeItems(content, schema.sectionKey, next));
  };
  const addItem = () => {
    onChange(writeItems(content, schema.sectionKey, [...items, schema.newItem()]));
  };
  const removeItem = (idx: number) => {
    onChange(writeItems(content, schema.sectionKey, items.filter((_, i) => i !== idx)));
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-xs italic text-muted-foreground">No {schema.itemNoun} yet.</p>
      )}
      {items.map((item, idx) => (
        <div
          key={(item.id as string) ?? idx}
          className="relative rounded border border-border p-2"
        >
          <button
            type="button"
            aria-label={`Remove ${schema.itemNoun}`}
            className="absolute right-1 top-1 p-1 text-muted-foreground hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              removeItem(idx);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <FieldGroupEditor
            fields={schema.fields}
            values={item}
            onChange={(key, value) => setItem(idx, key, value)}
            className="pr-6"
          />
        </div>
      ))}
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-brand-purple hover:text-brand-purple"
        onClick={(e) => {
          e.stopPropagation();
          addItem();
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        Add {schema.itemNoun}
      </button>
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
  return <FieldGroupEditor fields={schema.fields} values={obj} onChange={setField} />;
}

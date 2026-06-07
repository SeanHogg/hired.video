/**
 * SectionEditor — inline, field-bound editing of a document section on the
 * canvas (#1916, "the canvas is the form"). Driven entirely by the declarative
 * `document-field-schema.ts`, so it handles every editable section of every
 * entity (resume / job …) with one component. Edits produce a fresh content
 * record via `onChange`; the host owns persistence (write-back to the entity
 * row on save).
 *
 * Two shapes (from the schema):
 *   • "array"  — a list of items (resume work / education …); add/remove
 *     preserve each item's stable `id` (resume items carry one for
 *     skill-evidence + metaData binding — see [[project_skill_evidence]]).
 *   • "object" — one object's fields, at a nested key (resume `basics`) or the
 *     content root (the flat job record).
 */
import { Plus, Trash2 } from "lucide-react";
import type { DocumentEntityContent, DocumentEntityKind } from "@/lib/studio/editor-v2/document-state";
import {
  documentSectionSchema,
  type DocumentSectionSchema,
  type SectionFieldDef,
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

  const setItem = (idx: number, patch: Item) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
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
        <p className="text-xs italic text-slate-400">No {schema.itemNoun} yet.</p>
      )}
      {items.map((item, idx) => (
        <div
          key={(item.id as string) ?? idx}
          className="relative rounded border border-slate-200 p-2"
        >
          <button
            type="button"
            aria-label={`Remove ${schema.itemNoun}`}
            className="absolute right-1 top-1 p-1 text-slate-400 hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              removeItem(idx);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <div className="grid grid-cols-2 gap-2 pr-6">
            {schema.fields.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={item[field.key]}
                onChange={(v) => setItem(idx, { [field.key]: v })}
              />
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-brand-purple hover:text-brand-purple"
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
  return (
    <div className="grid grid-cols-2 gap-2">
      {schema.fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={obj[field.key]}
          onChange={(v) => setField(field.key, v)}
        />
      ))}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: SectionFieldDef;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const labelEl = (
    <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
      {field.label}
    </label>
  );

  if (field.type === "list") {
    // One value per line ⇄ string[].
    const lines = Array.isArray(value) ? (value as string[]).join("\n") : "";
    return (
      <div className="col-span-2">
        {labelEl}
        <textarea
          value={lines}
          rows={3}
          onClick={stop}
          onChange={(e) =>
            onChange(
              e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          placeholder="One per line"
          className="w-full resize-y rounded border border-slate-200 px-1.5 py-1 text-sm outline-none focus:border-brand-purple"
        />
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="col-span-2">
        {labelEl}
        <textarea
          value={typeof value === "string" ? value : ""}
          rows={2}
          onClick={stop}
          onChange={(e) => onChange(e.target.value)}
          className="w-full resize-y rounded border border-slate-200 px-1.5 py-1 text-sm outline-none focus:border-brand-purple"
        />
      </div>
    );
  }

  if (field.type === "select") {
    const current =
      value === undefined || value === null ? "" : String(value);
    return (
      <div>
        {labelEl}
        <select
          value={current}
          onClick={stop}
          onChange={(e) =>
            onChange(field.numeric ? Number(e.target.value) : e.target.value)
          }
          className="w-full rounded border border-slate-200 px-1.5 py-1 text-sm outline-none focus:border-brand-purple"
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div>
        {labelEl}
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          onClick={stop}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
          className="w-full rounded border border-slate-200 px-1.5 py-1 text-sm outline-none focus:border-brand-purple"
        />
      </div>
    );
  }

  if (field.type === "image") {
    const url = typeof value === "string" ? value : "";
    return (
      <div className="col-span-2">
        {labelEl}
        {url ? (
          <div className="flex items-start gap-2">
            <img
              src={url}
              alt=""
              className="h-16 w-28 rounded border border-slate-200 object-cover"
            />
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                onChange("");
              }}
              className="text-xs text-slate-400 hover:text-red-600"
            >
              Remove
            </button>
          </div>
        ) : null}
        <input
          type="text"
          value={url}
          onClick={stop}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… image URL"
          className="mt-1 w-full rounded border border-slate-200 px-1.5 py-1 text-sm outline-none focus:border-brand-purple"
        />
      </div>
    );
  }

  // text / date
  return (
    <div>
      {labelEl}
      <input
        type="text"
        value={typeof value === "string" ? value : ""}
        onClick={stop}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.type === "date" ? "YYYY-MM" : undefined}
        className="w-full rounded border border-slate-200 px-1.5 py-1 text-sm outline-none focus:border-brand-purple"
      />
    </div>
  );
}

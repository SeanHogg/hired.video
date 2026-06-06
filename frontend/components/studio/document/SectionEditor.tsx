/**
 * SectionEditor — inline, field-bound editing of a resume section on the
 * document canvas (#1916, "the canvas is the form"). Driven entirely by the
 * declarative `RESUME_SECTION_SCHEMAS`, so it handles every editable section
 * with one component. Edits produce a fresh `ResumeData` via `onChange`; the
 * host owns persistence (write-back to the resume row on save).
 *
 * Items are id-keyed (resume items carry a stable `id` for skill-evidence +
 * metaData binding — see [[project_skill_evidence]]); add/remove preserve ids.
 */
import { Plus, Trash2 } from "lucide-react";
import type { ResumeData } from "@/types/resume";
import {
  resumeSectionSchema,
  type ResumeSectionSchema,
  type SectionFieldDef,
} from "@/lib/studio/document/resume-field-schema";

interface SectionEditorProps {
  sectionKey: string;
  content: ResumeData;
  onChange: (next: ResumeData) => void;
}

type Item = Record<string, unknown>;

function itemsFor(content: ResumeData, sectionKey: string): Item[] {
  const rows = (content as unknown as Record<string, unknown>)[sectionKey];
  return Array.isArray(rows) ? (rows as Item[]) : [];
}

function writeItems(content: ResumeData, sectionKey: string, items: Item[]): ResumeData {
  return { ...(content as object), [sectionKey]: items } as unknown as ResumeData;
}

export default function SectionEditor({ sectionKey, content, onChange }: SectionEditorProps) {
  const schema = resumeSectionSchema(sectionKey);
  if (!schema) return null;
  const items = itemsFor(content, sectionKey);

  const setItem = (idx: number, patch: Item) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(writeItems(content, sectionKey, next));
  };
  const addItem = () => {
    onChange(writeItems(content, sectionKey, [...items, schema.newItem()]));
  };
  const removeItem = (idx: number) => {
    onChange(writeItems(content, sectionKey, items.filter((_, i) => i !== idx)));
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

  return (
    <div>
      {labelEl}
      <input
        type={field.type === "date" ? "text" : "text"}
        value={typeof value === "string" ? value : ""}
        onClick={stop}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.type === "date" ? "YYYY-MM" : undefined}
        className="w-full rounded border border-slate-200 px-1.5 py-1 text-sm outline-none focus:border-brand-purple"
      />
    </div>
  );
}

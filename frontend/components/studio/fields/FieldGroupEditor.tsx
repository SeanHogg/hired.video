/**
 * FieldGroupEditor — the shared, schema-driven field-rendering engine for the
 * Studio (#1916/#1955 T0.2). Given a list of `SectionFieldDef`s + a values
 * object + an onChange, it renders the right control per field type and writes
 * patches back. ONE engine drives every studio "form":
 *   • [SectionEditor](../document/SectionEditor.tsx) — document section blocks
 *     (resume basics, job overview/details, …),
 *   • [MetaPanel](../shared/MetaPanel.tsx) — the entity META form (title /
 *     cover / price / tags …) shown in the create/edit flow,
 *   • (future) the structured-builder node editors.
 *
 * Keeping the input switch here means a new field type lights up everywhere it
 * is used at once (DRY), and the document/builder runtimes don't each
 * reimplement form controls.
 */
import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import MediaPicker from "@/components/shared/MediaPicker";
import type { SectionFieldDef } from "@/lib/studio/document/document-field-schema";

/** Render a group of fields against a flat values object. Each change emits a
 *  single-key patch via `onChange` so callers control where it's written. */
export function FieldGroupEditor({
  fields,
  values,
  onChange,
  className,
}: {
  fields: SectionFieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Defaults to a 2-col grid (matches the section/meta layout). */
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={values[field.key]}
          onChange={(v) => onChange(field.key, v)}
        />
      ))}
    </div>
  );
}

export function FieldInput({
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

  if (field.type === "chips") {
    return <ChipsInput value={value} onChange={onChange} labelEl={labelEl} stop={stop} />;
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
    const current = value === undefined || value === null ? "" : String(value);
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

  if (field.type === "multiselect") {
    const arr = Array.isArray(value) ? (value as unknown[]) : [];
    const selected = (optValue: string) => arr.some((x) => String(x) === optValue);
    const toggle = (optValue: string) => {
      const raw: unknown = field.numeric ? Number(optValue) : optValue;
      onChange(
        selected(optValue)
          ? arr.filter((x) => String(x) !== optValue)
          : [...arr, raw],
      );
    };
    return (
      <div className="col-span-2">
        {labelEl}
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => {
                stop(e);
                toggle(opt.value);
              }}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs transition",
                selected(opt.value)
                  ? "border-brand-purple bg-brand-purple/10 text-brand-purple"
                  : "border-slate-200 text-slate-500 hover:border-slate-300",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "day") {
    return (
      <div>
        {labelEl}
        <input
          type="date"
          value={typeof value === "string" ? value : ""}
          onClick={stop}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-slate-200 px-1.5 py-1 text-sm outline-none focus:border-brand-purple"
        />
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
      <div className="col-span-2" onClick={stop} role="presentation">
        {labelEl}
        {url ? (
          <div className="flex items-start gap-2">
            <img
              src={url}
              alt=""
              className="h-16 w-28 rounded border border-slate-200 object-cover"
            />
            <div className="flex flex-col gap-1">
              <MediaPicker
                accept="image"
                title={`Choose ${field.label.toLowerCase()}`}
                triggerLabel="Replace"
                onPick={(asset) => onChange(asset.url)}
              />
              <button
                type="button"
                onClick={() => onChange("")}
                className="text-xs text-slate-400 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <MediaPicker
            accept="image"
            title={`Choose ${field.label.toLowerCase()}`}
            triggerLabel={`Add ${field.label.toLowerCase()}`}
            onPick={(asset) => onChange(asset.url)}
          />
        )}
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

/** Tag-pill editor: type-and-Enter to add, × to remove. Stores `string[]`. */
function ChipsInput({
  value,
  onChange,
  labelEl,
  stop,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  labelEl: React.ReactNode;
  stop: (e: React.SyntheticEvent) => void;
}) {
  const chips = Array.isArray(value) ? (value as string[]) : [];
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || chips.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...chips, v]);
    setDraft("");
  };
  return (
    <div className="col-span-2">
      {labelEl}
      {chips.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center gap-1 rounded-full bg-brand-purple/10 px-2 py-0.5 text-xs text-brand-purple"
            >
              {chip}
              <button
                type="button"
                aria-label={`Remove ${chip}`}
                onClick={(e) => {
                  stop(e);
                  onChange(chips.filter((c) => c !== chip));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={draft}
        onClick={stop}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Type and press Enter"
        className="w-full rounded border border-slate-200 px-1.5 py-1 text-sm outline-none focus:border-brand-purple"
      />
    </div>
  );
}

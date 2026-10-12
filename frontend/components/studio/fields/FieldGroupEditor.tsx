/**
 * FieldGroupEditor — the shared, schema-driven field-rendering engine for the
 * Studio (#1916/#1955 T0.2). Given a list of `SectionFieldDef`s + a values
 * object + an onChange, it renders the right control per field type and writes
 * patches back. ONE engine drives every studio "form":
 *   • [SectionEditor](../document/SectionEditor.tsx) — document section blocks
 *     (resume basics, job overview/details, …),
 *   • (future) the structured-builder node editors.
 *
 * Keeping the input switch here means a new field type lights up everywhere it
 * is used at once (DRY), and the document/builder runtimes don't each
 * reimplement form controls.
 *
 * Labels, options and validation messages are translated here: the schema
 * carries i18n keys (`labelKey`) and validation returns message keys.
 */
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import MediaPicker from "@/components/shared/MediaPicker";
import { localizedLabel, type SectionFieldDef } from "@/lib/studio/document/document-field-schema";
import {
  formatFieldError,
  validateFields,
  type FieldError,
  type FieldErrors,
} from "@/lib/studio/document/field-validation";

/** Field types that span the full 2-col grid width. */
const FULL_WIDTH_TYPES = new Set<SectionFieldDef["type"]>([
  "list",
  "textarea",
  "chips",
  "multiselect",
  "image",
]);

/** Render a group of fields against a flat values object. Each change emits a
 *  single-key patch via `onChange` so callers control where it's written. The
 *  engine computes its OWN per-field validation (the same `validateFields` the
 *  save-gate calls — DRY) and shows it inline; `crossFieldErrors` lets a parent
 *  inject section-level errors (date ranges) it alone can compute. */
export function FieldGroupEditor({
  fields,
  values,
  onChange,
  className,
  crossFieldErrors,
}: {
  fields: SectionFieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** Defaults to a 2-col grid (matches the section/meta layout). */
  className?: string;
  /** Section-level errors (e.g. end-before-start) keyed by field key. */
  crossFieldErrors?: FieldErrors;
}) {
  const errors: FieldErrors = { ...validateFields(fields, values), ...(crossFieldErrors ?? {}) };
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={values[field.key]}
          error={errors[field.key]}
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
  error,
}: {
  field: SectionFieldDef;
  value: unknown;
  onChange: (next: unknown) => void;
  error?: FieldError;
}) {
  const { t } = useTranslation();
  const id = useId();
  const label = localizedLabel(field, t);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  // Shared control class so the error border is applied uniformly (DRY).
  const inputClass = cn(
    "w-full rounded border px-1.5 py-1 text-sm outline-none focus:border-brand-primary",
    error ? "border-red-400" : "border-border",
  );

  let control: React.ReactNode;

  if (field.type === "list") {
    control = <ListInput id={id} value={value} onChange={onChange} stop={stop} className={inputClass} />;
  } else if (field.type === "chips") {
    control = <ChipsInput id={id} value={value} onChange={onChange} stop={stop} className={inputClass} />;
  } else if (field.type === "textarea") {
    control = (
      <textarea
        id={id}
        value={typeof value === "string" ? value : ""}
        rows={2}
        onClick={stop}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "resize-y")}
      />
    );
  } else if (field.type === "select") {
    const current = value === undefined || value === null ? "" : String(value);
    control = (
      <select
        id={id}
        value={current}
        onClick={stop}
        onChange={(e) => onChange(field.numeric ? Number(e.target.value) : e.target.value)}
        className={inputClass}
      >
        {(field.options ?? []).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {localizedLabel(opt, t)}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "multiselect") {
    const arr = Array.isArray(value) ? (value as unknown[]) : [];
    const selected = (optValue: string) => arr.some((x) => String(x) === optValue);
    const toggle = (optValue: string) => {
      const raw: unknown = field.numeric ? Number(optValue) : optValue;
      onChange(selected(optValue) ? arr.filter((x) => String(x) !== optValue) : [...arr, raw]);
    };
    control = (
      <div id={id} role="group" aria-label={label} className="flex flex-wrap gap-1.5">
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
                ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                : "border-border text-muted-foreground hover:border-border",
            )}
          >
            {localizedLabel(opt, t)}
          </button>
        ))}
      </div>
    );
  } else if (field.type === "day") {
    control = (
      <input
        id={id}
        type="date"
        value={typeof value === "string" ? value : ""}
        onClick={stop}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    );
  } else if (field.type === "number") {
    control = (
      <input
        id={id}
        type="number"
        value={typeof value === "number" ? value : ""}
        onClick={stop}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className={inputClass}
      />
    );
  } else if (field.type === "image") {
    const url = typeof value === "string" ? value : "";
    control = url ? (
      <div className="flex items-start gap-2">
        <img src={url} alt="" className="h-16 w-28 rounded border border-border object-cover" />
        <div className="flex flex-col gap-1">
          <MediaPicker
            accept="image"
            title={t("studioFields.chooseImage")}
            triggerLabel={t("studioFields.replace")}
            onPick={(asset) => onChange(asset.url)}
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-muted-foreground hover:text-red-600"
          >
            {t("studioFields.remove")}
          </button>
        </div>
      </div>
    ) : (
      <MediaPicker
        accept="image"
        title={t("studioFields.chooseImage")}
        triggerLabel={t("studioFields.addImage")}
        onPick={(asset) => onChange(asset.url)}
      />
    );
  } else {
    // text / date
    control = (
      <input
        id={id}
        type="text"
        value={typeof value === "string" ? value : ""}
        onClick={stop}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.type === "date" ? t("studioFields.monthPlaceholder") : undefined}
        className={inputClass}
      />
    );
  }

  return (
    <div className={cn(FULL_WIDTH_TYPES.has(field.type) && "col-span-2")} onClick={stop} role="presentation">
      <label
        htmlFor={field.type === "image" ? undefined : id}
        className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
      {control}
      {error && <p className="mt-0.5 text-[10px] font-medium text-red-600">{formatFieldError(error, t)}</p>}
    </div>
  );
}

/** Parse "one per line" text into the stored list (blank lines dropped). */
function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function joinLines(value: unknown): string {
  return Array.isArray(value) ? (value as string[]).join("\n") : "";
}

/**
 * One value per line ⇄ `string[]`. The textarea shows a local draft so a new
 * (still empty) line survives the keystroke that creates it — writing the
 * parsed list straight back would strip it and Enter would do nothing. The
 * draft re-syncs whenever the stored list changes from outside (undo, an AI
 * revision) rather than from this input.
 */
function ListInput({
  id,
  value,
  onChange,
  stop,
  className,
}: {
  id: string;
  value: unknown;
  onChange: (next: unknown) => void;
  stop: (e: React.SyntheticEvent) => void;
  className: string;
}) {
  const { t } = useTranslation();
  const stored = joinLines(value);
  const [draft, setDraft] = useState(stored);
  useEffect(() => {
    setDraft((d) => (parseLines(d).join("\n") === stored ? d : stored));
  }, [stored]);
  return (
    <textarea
      id={id}
      value={draft}
      rows={3}
      onClick={stop}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(parseLines(e.target.value));
      }}
      placeholder={t("studioFields.onePerLine")}
      className={cn(className, "resize-y")}
    />
  );
}

/** Tag-pill editor: type-and-Enter to add, × to remove. Stores `string[]`. */
function ChipsInput({
  id,
  value,
  onChange,
  stop,
  className,
}: {
  id: string;
  value: unknown;
  onChange: (next: unknown) => void;
  stop: (e: React.SyntheticEvent) => void;
  className?: string;
}) {
  const { t } = useTranslation();
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
    <>
      {chips.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs text-brand-primary"
            >
              {chip}
              <button
                type="button"
                aria-label={t("studioFields.removeValue", { value: chip })}
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
        id={id}
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
        placeholder={t("studioFields.typeAndEnter")}
        className={className ?? "w-full rounded border border-border px-1.5 py-1 text-sm outline-none focus:border-brand-primary"}
      />
    </>
  );
}

/**
 * Inspector form primitives. Every section in the right panel composes
 * its UI from these — same labels, sizes, and number-clamp behaviour
 * across widget / scene / canvas surfaces so the panel feels uniform.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeRotationDegrees } from "@/lib/studio/editor-v2/canvas-state";

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => {
        const raw = Number(e.target.value);
        const next = Number.isFinite(raw) ? raw : 0;
        const clamped =
          min !== undefined && next < min
            ? min
            : max !== undefined && next > max
              ? max
              : next;
        onChange(clamped);
      }}
    />
  );
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1" />
    </div>
  );
}

/** Fractional 0..1 position / size field, shown to 3 decimal places. */
export function PositionField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={0.01}
        min={0}
        max={1}
        value={Number(value.toFixed(3))}
        onChange={(e) => onChange(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
      />
    </div>
  );
}

export function DegreesField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={1}
        value={Math.round(value)}
        onChange={(e) => onChange(normalizeRotationDegrees(Number(e.target.value) || 0))}
      />
    </div>
  );
}

/**
 * Multi-line text input that grows with its content so the user always
 * sees the full string they're editing. Resetting height to `auto`
 * before reading `scrollHeight` lets the textarea SHRINK when content
 * is deleted, not just grow. Used wherever an inspector field hosts
 * free-form prose (text/heading widgets today).
 */
export function AutoSizeTextarea({
  value,
  onChange,
  minRows = 3,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  minRows?: number;
  placeholder?: string;
  ariaLabel?: string;
  /** Extra classes — e.g. `font-mono text-xs` for code-shaped content. */
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <Textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn("resize-none overflow-hidden", className)}
    />
  );
}

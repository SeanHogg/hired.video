/**
 * Inspector form primitives. Every section in the right panel composes
 * its UI from these — same labels, sizes, and number-clamp behaviour
 * across widget / scene / canvas surfaces so the panel feels uniform.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        onChange={(e) => onChange(normaliseDegrees(Number(e.target.value) || 0))}
      />
    </div>
  );
}

// Fold rotation into [-180, 180) so the input stays readable after many
// spins and a user can type -45 directly without snapping to 315.
function normaliseDegrees(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

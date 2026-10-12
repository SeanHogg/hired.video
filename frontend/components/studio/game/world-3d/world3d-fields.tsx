/**
 * Small field primitives for the world-3d properties panel — a labelled
 * x/y/z number triple and a stats row.
 */
export interface Vec3FieldProps {
  label: string;
  value: [number, number, number];
  step?: number;
  min?: number;
  onChange: (next: [number, number, number]) => void;
}

export function Vec3Field({ label, value, step = 0.5, min, onChange }: Vec3FieldProps) {
  const update = (idx: number, raw: string) => {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) return;
    const next: [number, number, number] = [...value];
    next[idx] = n;
    onChange(next);
  };
  return (
    <div>
      {label && <div className="mb-1 text-[10px] text-muted-foreground">{label}</div>}
      <div className="grid grid-cols-3 gap-1">
        {(["x", "y", "z"] as const).map((axis, i) => (
          <label key={axis} className="flex items-center gap-1">
            <span className="w-3 text-[10px] text-muted-foreground">{axis}</span>
            <input
              type="number"
              value={Number(value[i].toFixed(3))}
              step={step}
              min={min}
              onChange={(ev) => update(i, ev.target.value)}
              className="w-full rounded border border-border bg-background px-1 py-0.5 text-[11px]"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

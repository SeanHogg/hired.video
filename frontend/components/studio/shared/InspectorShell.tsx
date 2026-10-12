/**
 * `InspectorShell` — shared inspector chrome primitives for the
 * studio editor's right-rail panels. Closes the studio-audit DRY
 * finding that `GamePropertiesPanel` redefined `PanelShell` / `Section` /
 * `Field` / `ReadOnlyRow` / `NumberInput` / `DangerZone` inline (six
 * primitives × 100+ lines of duplication that would triple once
 * Animation and Image inspectors land).
 *
 * Per the project's DRY rule: extract a shared component / hook /
 * function with the logic inside; the consumer pulls from one place.
 * Adding a new per-kind inspector now = one file under
 * `components/studio/<kind>/<Kind>PropertiesPanel.tsx` that imports
 * from this module — no chrome reinvention, no visual drift.
 *
 * Icon is parameterised (`<PanelShell icon={Gamepad2}>` for game,
 * `Brush` for drawing, `Sparkles` for animation, etc.) so the chrome
 * stays kind-aware without per-shell branching.
 */
import { type ReactNode, type ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export interface PanelShellProps {
  /** Title rendered next to the icon. */
  title: string;
  /** Icon component — kind-specific. Defaults to the brand colour
   *  fuchsia accent the game panel uses; passing `iconColorClass`
   *  swaps it for a per-kind tint. */
  icon: LucideIcon | ComponentType<{ className?: string }>;
  /** Tailwind colour class for the icon (e.g. `"text-teal-500"`,
   *  `"text-sky-500"`). Defaults to fuchsia. */
  iconColorClass?: string;
  /** Optional "Done" affordance — when present, the shell renders a
   *  top-right pill that closes the inspector + restores the
   *  default-canvas selection. */
  onDeselect?: () => void;
  children: ReactNode;
}

/** Outermost inspector wrapper — vertical column with overflow-y +
 *  a header row + a flex-col body. Every per-kind inspector mounts
 *  inside this. */
export function PanelShell({
  title,
  icon: Icon,
  iconColorClass = "text-teal-500",
  onDeselect,
  children,
}: PanelShellProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-3 py-3 text-sm">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconColorClass}`} />
          <h3 className="font-semibold">{title}</h3>
        </div>
        {onDeselect && (
          <button
            type="button"
            onClick={onDeselect}
            className="rounded px-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Done
          </button>
        )}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

/** Labeled inspector section — uppercase header + a vertical stack of
 *  fields. Pair with `<Field>` and `<ReadOnlyRow>` children. */
export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

/** Labelled-row field — label on the left, control on the right.
 *  Standard interactive row inside a `<Section>`. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Read-only field — label on the left, value (tabular-nums) on the
 *  right. Use for derived counts / engine names / status indicators. */
export function ReadOnlyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{children}</span>
    </div>
  );
}

export interface NumberInputProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/** Standard inspector number input — short, right-aligned, tabular
 *  digits. Coerces NaN to 0 so a deleted-then-empty field doesn't
 *  poison the state shape. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
}: NumberInputProps) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      className="h-7 w-20 rounded border border-border bg-background px-1 text-right text-xs tabular-nums"
    />
  );
}

/** Destructive-actions zone at the bottom of an inspector. Adds a
 *  subtle top border + "Danger zone" header so destructive buttons
 *  (Delete level, Delete sprite, Reset project) are visually
 *  quarantined. */
export function DangerZone({ children }: { children: ReactNode }) {
  return (
    <section className="mt-2 border-t border-border pt-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Danger zone
      </p>
      {children}
    </section>
  );
}

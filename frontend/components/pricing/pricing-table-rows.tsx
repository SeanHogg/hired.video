// ─── Shared feature-row helpers for the /pricing comparison table ────────────
//
// One helper owns the row shape: adding a feature is a single
// `<FeatureRow …>` declaration. Free/Pro cells accept either a string
// ("Unlimited", "1 published") OR `true` / `false` (rendered as a green check
// / em-dash) so callers don't repeat the inline-check JSX. CellValue owns the
// visual contract for the whole table.

import type { ComponentType, ReactNode } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UpgradeSlug } from "@shared/upgrade-slugs";

export interface FeatureRowProps {
  icon: ComponentType<{ className?: string }>;
  label: ReactNode;
  free: ReactNode | boolean;
  pro: ReactNode | boolean;
  /** Optional `data-upgrade-id` for `/pricing?upgrade=<slug>` deep links
   *  (gap #810). Matching `UpgradeSlug` values smooth-scroll this row into
   *  view + apply the highlight ring. */
  upgradeId?: UpgradeSlug;
}

export function FeatureRow({ icon: Icon, label, free, pro, upgradeId }: FeatureRowProps) {
  return (
    <tr
      data-upgrade-id={upgradeId}
      className={
        upgradeId
          ? "transition-colors data-[upgrade-active=true]:bg-accent data-[upgrade-active=true]:ring-2 data-[upgrade-active=true]:ring-primary/40"
          : undefined
      }
    >
      <td className="p-4">
        <span className="flex items-center gap-2.5 text-[15px] text-foreground">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {label}
        </span>
      </td>
      <CellValue value={free} />
      <CellValue value={pro} pro />
    </tr>
  );
}

/** Single source of truth for "what does a feature-cell look like". `true`
 *  renders the green check; `false` the em-dash placeholder; anything else
 *  renders as muted text. The Pro column carries a faint accent tint. */
function CellValue({ value, pro = false }: { value: ReactNode | boolean; pro?: boolean }) {
  const { t } = useTranslation();
  const base = pro ? "bg-accent/40 p-4 text-center" : "p-4 text-center";
  if (value === true) {
    return (
      <td className={base}>
        <Check className="mx-auto h-5 w-5 text-brand-green-text" aria-label={t("comparison.legend.yes")} />
      </td>
    );
  }
  if (value === false) {
    return (
      <td className={base}>
        <span className="text-muted-foreground" aria-hidden="true">
          —
        </span>
      </td>
    );
  }
  return <td className={`${base} text-sm text-muted-foreground`}>{value}</td>;
}

/** Persona-gated row. Shows the row but renders the cells as em-dashes
 *  when the active persona isn't in `visibleFor`. */
export function PersonaGatedRow({
  icon,
  label,
  free,
  pro,
  visibleFor,
  currentPersona,
}: FeatureRowProps & { visibleFor: string[]; currentPersona: string }) {
  const visible = visibleFor.includes(currentPersona);
  return <FeatureRow icon={icon} label={label} free={visible ? free : false} pro={visible ? pro : false} />;
}

/** Section heading row spanning all three table columns. */
export function SectionRow({ label }: { label: string }) {
  return (
    <tr className="bg-muted">
      <td
        className="px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
        colSpan={3}
      >
        {label}
      </td>
    </tr>
  );
}

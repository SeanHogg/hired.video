/**
 * TransitionInPicker — how ONE scene comes in: a transition from the shared
 * catalog (`lib/studio/motion-presets.ts` TRANSITION_PRESETS) or "inherit"
 * (null) the project / video default. Shared by the studio's scene inspector
 * (Transition in) and the kit video's scene drill-in, so the option list and
 * the inherit semantics never drift.
 */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { TRANSITION_PRESETS, type TransitionKind } from "@/lib/studio/motion-presets";
import { cn } from "@/lib/utils";

export interface TransitionInPickerProps {
  value: TransitionKind | null;
  onChange: (next: TransitionKind | null) => void;
  /** The "no override" option's text; defaults to the studio's wording. */
  inheritLabel?: string;
  className?: string;
}

export default function TransitionInPicker({ value, onChange, inheritLabel, className }: TransitionInPickerProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[13px] font-semibold text-foreground">
        {t("studio.inspector.transitionIn")}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || null) as TransitionKind | null)}
        className="h-11 w-full rounded-[10px] border border-input bg-card px-2.5 text-[13px] text-foreground"
      >
        <option value="">{inheritLabel ?? t("studio.inspector.transitionInherit")}</option>
        {TRANSITION_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {t(preset.labelKey)} — {t(preset.hintKey)}
          </option>
        ))}
      </select>
    </div>
  );
}

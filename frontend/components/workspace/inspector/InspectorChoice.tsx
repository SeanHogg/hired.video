/**
 * InspectorChoice — one pick from a few options (font, spacing, page…), as
 * a row of pressed / unpressed buttons under a caption. The ONE choice
 * control the résumé and letter style drills share; ≥ 44px tap targets.
 * Pressing the picked option again keeps it (never an empty choice).
 */
import { useId } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { INSPECTOR_LABEL } from "./inspector-styles";

const ITEM =
  "min-h-11 flex-1 px-3 text-sm font-semibold data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary";

interface InspectorChoiceProps<T extends string> {
  label: string;
  options: readonly T[];
  value: T;
  optionLabel: (option: T) => string;
  onPick: (option: T) => void;
  disabled?: boolean;
}

export default function InspectorChoice<T extends string>({ label, options, value, optionLabel, onPick, disabled }: InspectorChoiceProps<T>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className={INSPECTOR_LABEL}>
        {label}
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-labelledby={id}
        value={value}
        disabled={disabled}
        // Radix sends "" when the pressed item is pressed again: keep the choice.
        onValueChange={(next) => next && onPick(next as T)}
        className="flex-wrap justify-start"
      >
        {options.map((option) => (
          <ToggleGroupItem key={option} value={option} className={ITEM}>
            {optionLabel(option)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export const PAPER_OPTIONS = ["letter", "a4"] as const;
export type PaperOption = (typeof PAPER_OPTIONS)[number];
/** The page names every document inspector shows. */
export const PAPER_LABEL_KEYS: Record<PaperOption, string> = {
  letter: "workspace.letter.style.letter",
  a4: "workspace.letter.style.a4",
};

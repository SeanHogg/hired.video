// One selectable resume row in the consolidator's target / source lists.
// `tone` picks the selected-state palette: target = accent/primary,
// source = brand-green.

import type { ReactNode } from "react";
import { CheckCircle2, FileText } from "lucide-react";

const TONE_CLASSES = {
  target: { selected: "bg-accent border border-primary/40", check: "text-primary" },
  source: { selected: "bg-brand-green/10 border border-brand-green/30", check: "text-brand-green-text" },
} as const;

interface ResumePickButtonProps {
  tone: keyof typeof TONE_CLASSES;
  selected: boolean;
  label: string;
  onClick: () => void;
  /** Optional trailing element (e.g. the "Master" badge). */
  trailing?: ReactNode;
}

export function ResumePickButton({ tone, selected, label, onClick, trailing }: ResumePickButtonProps) {
  const palette = TONE_CLASSES[tone];
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`w-full min-h-11 text-left flex items-center gap-2 p-3 rounded-xl text-sm transition-colors ${
        selected ? palette.selected : "hover:bg-muted border border-transparent"
      }`}
      onClick={onClick}
    >
      {selected && <CheckCircle2 aria-hidden="true" className={`h-4 w-4 ${palette.check} shrink-0`} />}
      <FileText aria-hidden="true" className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="truncate">{label}</span>
      {trailing}
    </button>
  );
}

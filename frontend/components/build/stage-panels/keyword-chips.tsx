/**
 * The job-match keyword chips — ONE look for the Target stage's job match
 * (JobMatchPanel) and the "This line" inspector's Job match: a captioned
 * group of chips, green for a keyword shown, red for one still missing.
 */
import type { ReactNode } from "react";
import { INSPECTOR_LABEL } from "@/components/workspace/inspector/inspector-styles";

export const KEYWORD_CHIP = "inline-flex max-w-full items-center break-words rounded-full px-2.5 py-1 text-left text-xs font-medium leading-snug";
export const KEYWORD_FOUND = "bg-diff-added text-diff-added-foreground";
export const KEYWORD_MISSING = "bg-diff-removed text-diff-removed-foreground";

/** A caption over a wrapping list of keyword chips (`children` are <li>s). */
export function KeywordGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={`m-0 ${INSPECTOR_LABEL}`}>{label}</p>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">{children}</ul>
    </div>
  );
}

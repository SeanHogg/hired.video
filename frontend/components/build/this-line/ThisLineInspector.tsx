/**
 * ThisLineInspector — the kit's "This line" inspector (A2 board: kicker
 * THIS LINE, title "Experience · CIO"): the rows for the résumé line
 * selected on the page (Simple: Wording · Findings · Job match; Advanced
 * appends Font & size · Spacing · Colour · Page — line-drills.ts), or the
 * open row's view in their place (the slot header shows ‹ back; see
 * useKitSlotPanels). Container: data from useThisLine, actions and the
 * résumé design from the kit.
 */
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { sectionLabelKey } from "@/lib/build/editable-sections";
import type { ResolvedLine } from "@/lib/build/this-line";
import InspectorBody from "@/components/workspace/inspector/InspectorBody";
import { LINE_DRILLS, type LineDrillId } from "./line-drills";
import type { LineDrillProps } from "./types";

/** "Experience · CIO" — the line's section, and its entry when it has a name. */
export function thisLineTitle(t: TFunction, line: ResolvedLine): string {
  const section = t(sectionLabelKey(line.section));
  return line.itemTitle ? `${section} · ${line.itemTitle}` : section;
}

interface ThisLineInspectorProps extends LineDrillProps {
  advanced: boolean;
  /** The open row, or null for the rows. */
  drill: LineDrillId | null;
  onDrill: (id: LineDrillId) => void;
}

export default function ThisLineInspector({ advanced, drill, onDrill, ...ctx }: ThisLineInspectorProps) {
  const { t } = useTranslation();
  return (
    <InspectorBody
      registry={LINE_DRILLS}
      ctx={ctx}
      advanced={advanced}
      drill={drill}
      onOpen={onDrill}
      label={t("workspace.slot.thisLine")}
    />
  );
}

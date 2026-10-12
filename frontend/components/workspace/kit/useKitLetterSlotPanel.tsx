/**
 * useKitLetterSlotPanel — the letter page's panel for the ONE right slot
 * (A2 board: kicker THE LETTER, title "Macomb · CIO"): the letter's rows,
 * or an open row with ‹ back to them (LetterInspector,
 * components/build/cover-letter/). Null when the kit has no letter yet.
 */
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { CoverLetter } from "@shared/cover-letter";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import LetterInspector from "@/components/build/cover-letter/LetterInspector";
import { LETTER_DRILLS } from "@/components/build/cover-letter/letter-drills";
import { drillSlotHeader } from "@/components/workspace/inspector/InspectorBody";
import { useInspectorDrill } from "@/components/workspace/inspector/use-inspector-drill";
import { INSPECTOR_PAD } from "@/components/workspace/inspector/inspector-styles";
import type { SlotPanel } from "../RightSlot";

/** "Macomb · CIO" — the organisation and the role, else "Cover letter". Pure. */
export function letterInspectorTitle(t: TFunction, letter: Pick<CoverLetter, "organization" | "jobTitle">): string {
  return (
    [letter.organization, letter.jobTitle]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" · ") || t("build.letter.title")
  );
}

export function useKitLetterSlotPanel(kit: KitWorkspace, advanced: boolean): SlotPanel | null {
  const { t } = useTranslation();
  const { drill, open, back } = useInspectorDrill(LETTER_DRILLS, "letter", advanced);
  const letter = kit.letter?.letter;
  if (!letter) return null;

  const header = drillSlotHeader({
    t,
    registry: LETTER_DRILLS,
    drill,
    onBack: back,
    kicker: t("workspace.slot.theLetter"),
    title: letterInspectorTitle(t, letter),
  });
  return {
    ...header,
    content: (
      <div className={INSPECTOR_PAD}>
        <LetterInspector letter={letter} onChange={kit.letter?.onChange} advanced={advanced} drill={drill} onDrill={open} />
      </div>
    ),
  };
}

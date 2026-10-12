/**
 * LetterInspector — beside the cover letter in a kit's right slot: its rows
 * (Simple: To · Highlights · Tone; Advanced appends Font & size · Spacing ·
 * Page — letter-drills.ts), or the open row's view in their place (the slot
 * header shows ‹ back; see useKitSlotPanels). It holds the Tone rewrite
 * (useLetterTone) so a rewrite in flight survives going back to the rows,
 * and renders its sign-in sheet. Every change goes through `onChange` (the
 * letter view's commit, so Undo and autosave cover it); read-only when the
 * letter can't be edited here (a review is proposing it).
 */
import { useTranslation } from "react-i18next";
import type { CoverLetter } from "@shared/cover-letter";
import { useLetterTone } from "@/lib/build/cover-letter/use-letter-tone";
import InspectorBody from "@/components/workspace/inspector/InspectorBody";
import { LETTER_DRILLS, type LetterDrillId } from "./letter-drills";
import type { LetterCommit, LetterDrillProps } from "./letter-types";
import { AuthGateSheet } from "@/components/auth/useAuthGate";

interface LetterInspectorProps {
  letter: CoverLetter;
  onChange: LetterCommit | undefined;
  advanced: boolean;
  /** The open row, or null for the rows. */
  drill: LetterDrillId | null;
  onDrill: (id: LetterDrillId) => void;
}

export default function LetterInspector({ letter, onChange, advanced, drill, onDrill }: LetterInspectorProps) {
  const { t } = useTranslation();
  const tone = useLetterTone(letter, onChange);
  const ctx: LetterDrillProps = { letter, onChange, tone };
  return (
    <>
      <InspectorBody
        registry={LETTER_DRILLS}
        ctx={ctx}
        advanced={advanced}
        drill={drill}
        onOpen={onDrill}
        label={t("workspace.slot.theLetter")}
        before={!onChange && <p className="text-xs text-muted-foreground">{t("workspace.letter.readOnly")}</p>}
      />
      <AuthGateSheet {...tone.gateSheet} />
    </>
  );
}

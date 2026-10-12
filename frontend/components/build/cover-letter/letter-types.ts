/**
 * What every letter inspector drill receives: the letter, its commit (the
 * letter view's — Undo and autosave cover it; absent = read-only, a review
 * is proposing the letter) and the Tone rewrite (useLetterTone, held by the
 * inspector so a rewrite in flight survives going back to the rows).
 */
import type { CoverLetter } from "@shared/cover-letter";
import type { LetterTone } from "@/lib/build/cover-letter/use-letter-tone";

export type LetterCommit = (letter: CoverLetter, group?: string) => void;

export interface LetterDrillProps {
  letter: CoverLetter;
  onChange: LetterCommit | undefined;
  tone: LetterTone;
}

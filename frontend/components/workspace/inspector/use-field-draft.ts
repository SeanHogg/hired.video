/**
 * useFieldDraft — a text field over a value that must stay valid (a
 * letter's greeting, a highlight's text: never empty). The field shows
 * what is typed, so it CAN be cleared while retyping; each valid keystroke
 * commits (the page follows live), and leaving the field with an invalid
 * draft puts back the last valid value.
 */
import { useState, type ChangeEvent } from "react";

interface FieldDraft {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
}

/** A required text: something other than whitespace. */
export const notBlank = (text: string): boolean => text.trim().length > 0;

export function useFieldDraft(value: string, commit: (next: string) => void, valid: (next: string) => boolean = notBlank): FieldDraft {
  // null = not editing: the field shows the value (external edits, Undo).
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? value,
    onChange: (e) => {
      const next = e.target.value;
      setDraft(next);
      if (valid(next) && next !== value) commit(next);
    },
    onBlur: () => setDraft(null),
  };
}

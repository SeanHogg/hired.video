/**
 * Highlights — the letter's evidence, each a job priority matched to proof
 * from the résumé: the line before them, then each highlight's label and
 * text (reword, relabel, reorder, add, remove). A highlight always says
 * something (the letter's schema): its text can be cleared while retyping
 * and leaving it empty puts the last text back. Items keep stable keys
 * (useListKeys), so a reorder never hands one item's draft to another.
 */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { CoverLetter } from "@shared/cover-letter";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListKeys } from "@/lib/build/cover-letter/use-list-keys";
import { useFieldDraft } from "@/components/workspace/inspector/use-field-draft";
import { INSPECTOR_ICON_BUTTON as ICON } from "@/components/workspace/inspector/inspector-styles";
import type { LetterDrillProps } from "../letter-types";

type Highlight = CoverLetter["highlights"][number];

interface ItemProps {
  item: Highlight;
  n: number;
  first: boolean;
  last: boolean;
  onEdit: (patch: Partial<Highlight>, field: "label" | "text") => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}

function HighlightItem({ item, n, first, last, onEdit, onMove, onRemove }: ItemProps) {
  const { t } = useTranslation();
  const text = useFieldDraft(item.text, (next) => onEdit({ text: next }, "text"));
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
      <div className="flex items-center gap-1">
        <Input
          aria-label={t("workspace.letter.highlightLabel", { n })}
          placeholder={t("workspace.letter.highlightLabelHint")}
          value={item.label}
          onChange={(e) => onEdit({ label: e.target.value }, "label")}
          className="h-11 min-w-0 flex-1"
        />
        <button type="button" className={ICON} disabled={first} onClick={() => onMove(-1)} aria-label={t("workspace.letter.moveUp")}>
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={ICON} disabled={last} onClick={() => onMove(1)} aria-label={t("workspace.letter.moveDown")}>
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={ICON} onClick={onRemove} aria-label={t("workspace.letter.removeHighlight", { n })}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <Textarea aria-label={t("workspace.letter.highlightText", { n })} rows={3} {...text} />
    </li>
  );
}

export default function LetterHighlightsDrill({ letter, onChange }: LetterDrillProps) {
  const { t } = useTranslation();
  const ids = useId();
  const { highlights } = letter;
  const keys = useListKeys(highlights.length, "highlight");
  const commit = (next: CoverLetter["highlights"], group?: string) => onChange?.({ ...letter, highlights: next }, group);

  const move = (from: number, to: number) => {
    const next = [...highlights];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    keys.move(from, to);
    commit(next);
  };
  const remove = (index: number) => {
    keys.remove(index);
    commit(highlights.filter((_, j) => j !== index));
  };

  return (
    <fieldset className="flex flex-col gap-3" disabled={!onChange}>
      <legend className="sr-only">{t("workspace.letter.highlights")}</legend>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`${ids}-intro`}>
        {t("workspace.letter.highlightsIntro")}
        <Input
          id={`${ids}-intro`}
          className="h-11"
          value={letter.highlightsIntro}
          onChange={(e) => onChange?.({ ...letter, highlightsIntro: e.target.value }, "letter:highlights:intro")}
        />
      </label>
      <ol className="flex flex-col gap-3">
        {highlights.map((item, i) => (
          <HighlightItem
            key={keys.keys[i]}
            item={item}
            n={i + 1}
            first={i === 0}
            last={i === highlights.length - 1}
            onEdit={(patch, field) =>
              commit(
                highlights.map((h, j) => (j === i ? { ...h, ...patch } : h)),
                `letter:highlight:${keys.keys[i]}:${field}`,
              )
            }
            onMove={(by) => move(i, i + by)}
            onRemove={() => remove(i)}
          />
        ))}
      </ol>
      <button
        type="button"
        onClick={() => commit([...highlights, { label: "", text: t("workspace.letter.newHighlight") }])}
        className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-[10px] border border-input bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t("workspace.letter.addHighlight")}
      </button>
    </fieldset>
  );
}

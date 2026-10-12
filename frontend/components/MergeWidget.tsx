/**
 * MergeWidget — generic multi-select + merge UI for any list of items
 * the user wants to combine. Built to be domain-agnostic so the
 * skill-merge flow, the bullet-merge flow ("combine these three
 * highlights into one"), and the volunteer-position-dedup flow ("two
 * resumes both have the same Habitat for Humanity gig — pick one")
 * share a single visual language.
 *
 * Per the DRY rule the merge SCAFFOLDING (selection state, toolbar,
 * primary-picker dialog) lives here. The actual merge function — what
 * fields to combine and how to remap related state like skill evidence
 * — is domain-specific and stays in shared/skill-evidence.ts (or
 * wherever the matching domain code lives).
 *
 * Usage:
 *   const sel = useMergeSelection(skills.length);
 *   <MergeWidget
 *     noun="skill"
 *     items={skills}
 *     selectedIndexes={[...sel.selected]}
 *     onClear={sel.clear}
 *     onConfirm={(primaryIndex) => doMerge([...sel.selected], primaryIndex)}
 *     renderLabel={(s) => s.name}
 *   />
 *   {skills.map((s, i) => <Row checked={sel.isSelected(i)} onCheck={() => sel.toggle(i)} />)}
 *
 * The widget self-gates: returns null when fewer than 2 items are
 * selected. Consumers don't pass a `showToolbar` or `canMerge` boolean.
 */

import { useCallback, useMemo, useState } from "react";
import { Combine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

// ─── Selection hook ────────────────────────────────────────────────────────

/**
 * Stable selection state keyed by array index. Cheaper than a Set on
 * objects + survives item-id churn since the consumer drives checkbox
 * binding by index.
 */
export function useMergeSelection(itemCount: number) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  // If items shrink (e.g. after a successful merge removes rows), drop
  // out-of-bounds indexes so a stale selection doesn't survive the next
  // toggle. Cheap O(n) over a small selection set.
  useMemo(() => {
    setSelected((prev) => {
      let mutated = false;
      const next = new Set<number>();
      for (const i of prev) {
        if (i < itemCount) next.add(i);
        else mutated = true;
      }
      return mutated ? next : prev;
    });
    // We intentionally only care when itemCount changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCount]);

  const isSelected = useCallback((idx: number) => selected.has(idx), [selected]);

  return {
    selected,
    selectedCount: selected.size,
    isSelected,
    toggle,
    clear,
  };
}

// ─── Public widget ────────────────────────────────────────────────────────

interface MergeWidgetProps<T> {
  /** Word used in copy: "Merge 3 skills?" / "Merge 2 highlights?" /
   *  "Merge 2 positions?". Keep singular — the widget pluralises as
   *  needed for English; for other languages override `nounPlural`. */
  noun: string;
  nounPlural?: string;
  /** The full list — only the indexes in `selectedIndexes` are shown in
   *  the dialog, but the widget reads `items[idx]` to render the labels. */
  items: T[];
  selectedIndexes: number[];
  /** Reset selection without performing a merge — wired to the toolbar's
   *  cancel button and to the dialog's cancel button. */
  onClear: () => void;
  /** Called with the user's pick of primary. Caller is responsible for
   *  invoking the domain-specific merge function (e.g. `mergeSkills`)
   *  and clearing selection afterwards. */
  onConfirm: (primaryIndex: number) => void;
  /** Renders the dialog's "which one wins?" label per candidate. Returns
   *  a string or a small ReactNode — keep it tight (one line). */
  renderLabel: (item: T, index: number) => React.ReactNode;
}

export function MergeWidget<T>({
  noun,
  nounPlural,
  items,
  selectedIndexes,
  onClear,
  onConfirm,
  renderLabel,
}: MergeWidgetProps<T>) {
  const [open, setOpen] = useState(false);
  const [primaryIndex, setPrimaryIndex] = useState<number | null>(null);

  // Self-gating: less than 2 selected means there's nothing to merge.
  // This is what the DRY rule is asking for — the consumer doesn't have
  // to compute or pass a `canMerge` boolean.
  if (selectedIndexes.length < 2) return null;

  const plural =
    nounPlural ?? (noun.endsWith("s") ? noun : `${noun}s`);
  const countLabel = `${selectedIndexes.length} ${plural}`;

  const sortedSelected = [...selectedIndexes].sort((a, b) => a - b);
  const effectivePrimary =
    primaryIndex != null && sortedSelected.includes(primaryIndex)
      ? primaryIndex
      : sortedSelected[0];

  const handleOpen = () => {
    setPrimaryIndex(sortedSelected[0]);
    setOpen(true);
  };

  const handleConfirm = () => {
    setOpen(false);
    if (effectivePrimary != null) onConfirm(effectivePrimary);
  };

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-primary/10 border border-primary/30 rounded-md px-3 py-2 mb-3">
        <div className="text-sm">
          <strong>{countLabel}</strong> selected to merge
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleOpen}>
            <Combine className="h-4 w-4 mr-1" />
            Merge {countLabel}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Merge {countLabel}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Pick the {noun} whose name and details should survive — the
            others will fold in as keywords / details, and any evidence
            tied to them will be re-attached to the surviving {noun}.
          </p>
          <RadioGroup
            value={String(effectivePrimary ?? "")}
            onValueChange={(v) => setPrimaryIndex(Number(v))}
            className="space-y-2"
          >
            {sortedSelected.map((idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 border rounded-md px-3 py-2 hover:bg-muted/30"
              >
                <RadioGroupItem value={String(idx)} id={`merge-primary-${idx}`} className="mt-1" />
                <Label
                  htmlFor={`merge-primary-${idx}`}
                  className="flex-1 cursor-pointer text-sm leading-snug"
                >
                  {renderLabel(items[idx], idx)}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={effectivePrimary == null}>
              <Combine className="h-4 w-4 mr-1" />
              Merge into selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

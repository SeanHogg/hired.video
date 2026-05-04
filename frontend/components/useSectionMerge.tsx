/**
 * useSectionMerge — the shared scaffolding every resume-section editor
 * uses to surface its merge UI. Eliminates the ~30-line block of
 * MergeWidget + checkbox + tip-paragraph + onConfirm-handler that used
 * to live inline in SkillsSection AND CertificatesSection (and would
 * have multiplied across nine more sections under the original plan).
 *
 * Per the DRY rule:
 *   - Self-gating: returns `null` for `bar` and `checkbox(idx)` when
 *     the consumer didn't pass `onReplace` or there are < 2 items.
 *     Consumers don't pass `canMerge` / `showMergeBar` / `showCheckbox`
 *     booleans — the hook decides.
 *   - The merge function itself stays in shared/ (mergeSkills,
 *     mergeWork, etc.) so the wire-format rules don't drift between
 *     UI and the API merge step.
 *
 * Usage:
 *   const merge = useSectionMerge({
 *     items: work,
 *     noun: "work entry",
 *     onReplace,
 *     mergeFn: ({ selectedIndexes, primaryIndex }) =>
 *       mergeWork({ work, evidence, selectedIndexes, primaryIndex }),
 *     renderLabel: (w) => `${w.position} · ${w.name}`,
 *   });
 *   // render order: card header → bar → list of items
 *   return <BaseSectionCard>{merge.bar}{items.map(...) — checkbox via merge.checkbox(i)}</BaseSectionCard>;
 */

import { Checkbox } from "@/components/ui/checkbox";
import { MergeWidget, useMergeSelection } from "@/components/MergeWidget";

interface SectionMergeArgs<T> {
  items: T[];
  /** Singular noun used in copy: "Merge 3 work entries?" / "Merge 2
   *  certificates?". Pluralised by appending "s" unless `nounPlural`
   *  overrides. */
  noun: string;
  nounPlural?: string;
  /** Presence flag — the hook only checks truthiness to decide whether
   *  to render merge controls. Each section's actual replace callback
   *  has a different signature (some take items + evidence, some just
   *  items), so this prop is intentionally typed permissively. The
   *  hook never invokes it; the consumer's `mergeFn` closure does. */
  onReplace?: (...args: never[]) => void;
  /** Domain-specific merge action. The hook calls this with the
   *  user-picked indexes; the consumer is responsible for invoking
   *  the appropriate `merge<Section>` shared function and applying the
   *  result to state. */
  mergeFn?: (args: { selectedIndexes: number[]; primaryIndex: number }) => void;
  /** Renders one candidate's label inside the dialog's primary-picker
   *  list. Keep tight — one line. */
  renderLabel?: (item: T, index: number) => React.ReactNode;
  /** Tip line shown under the section title when no items are selected
   *  yet. Defaults to a generic "tick two or more to merge duplicates"
   *  hint. */
  tipText?: string;
}

interface SectionMergeApi {
  /** Sticky toolbar + primary-picker dialog. Renders null when
   *  `onReplace` is missing OR fewer than 2 items are selected. Drop
   *  this immediately under the BaseSectionCard's title row. */
  bar: React.ReactNode;
  /** Per-item checkbox. Returns null when merge isn't enabled or there
   *  are fewer than 2 items in the section. Drop into BaseSectionItem's
   *  title slot inside an `inline-flex` span. */
  checkbox: (index: number) => React.ReactNode;
  /** Optional tip line shown when no items are selected. Renders null
   *  when merge isn't enabled or items < 2 or selection is non-empty. */
  tip: React.ReactNode;
}

export function useSectionMerge<T>(args: SectionMergeArgs<T>): SectionMergeApi {
  const { items, noun, nounPlural, onReplace, mergeFn, renderLabel, tipText } = args;
  const selection = useMergeSelection(items.length);
  const enabled = !!onReplace && !!mergeFn && !!renderLabel && items.length >= 2;

  const handleConfirm = (primaryIndex: number) => {
    if (!mergeFn || !onReplace) return;
    mergeFn({ selectedIndexes: [...selection.selected], primaryIndex });
    selection.clear();
  };

  const bar = enabled ? (
    <MergeWidget
      noun={noun}
      nounPlural={nounPlural}
      items={items}
      selectedIndexes={[...selection.selected]}
      onClear={selection.clear}
      onConfirm={handleConfirm}
      renderLabel={renderLabel!}
    />
  ) : null;

  const checkbox = (index: number) =>
    enabled ? (
      <Checkbox
        checked={selection.isSelected(index)}
        onCheckedChange={() => selection.toggle(index)}
        aria-label={`Select ${noun} ${index + 1} for merge`}
      />
    ) : null;

  const tip =
    enabled && selection.selectedCount === 0 ? (
      <p className="text-xs text-muted-foreground -mt-2 mb-2">
        {tipText ??
          `Tip: tick two or more ${nounPlural ?? `${noun}s`} to merge duplicates.`}
      </p>
    ) : null;

  return { bar, checkbox, tip };
}

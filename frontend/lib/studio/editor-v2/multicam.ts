/**
 * #807 — Multi-cam group primitive on the V2 canvas. Real NLEs
 * (Premiere / Final Cut / Lightworks) all expose this — N synced
 * video sources, one output, a cut list deciding which source is
 * active per time range.
 *
 * The shape sits OUTSIDE the per-scene widget array — multiple
 * widgets can reference a single MulticamGroup id via
 * `widget.multicamGroupId`, so adding/removing angles from the group
 * doesn't churn every consumer. The cut-list lane in the editor reads
 * `activeAngleAt[]` to render the colored "A → B → C" markers; the
 * renderer picks the active source per-frame by binary-searching the
 * same list.
 */

export interface MulticamSource {
  id: string;
  label: string;
  /** Source video widget id this angle resolves to. Either the URL is
   *  fetched directly (when the widget already carries it) or the
   *  widget is mounted off-screen at render time so its frames are
   *  available to the picker. */
  videoWidgetId: string;
  /** Per-source clock offset (seconds) relative to the group anchor.
   *  Used by the existing audio-sync pass to align angles before the
   *  picker chooses one. */
  syncOffsetSec: number;
}

export interface MulticamCutListEntry {
  /** Time (seconds) on the output clock from which this source becomes
   *  active. Sorted ascending; entries are exhaustive — the source
   *  with the largest `atSec <= currentTime` wins. */
  atSec: number;
  sourceId: string;
}

export interface MulticamGroup {
  id: string;
  label: string;
  sources: MulticamSource[];
  /** Ordered cut list. The picker reads this on every frame. */
  cutList: MulticamCutListEntry[];
  /** Output anchor — which source's clock the group's `atSec` axis
   *  shares with. Falls back to the first source when omitted. */
  anchorSourceId?: string;
}

/** Pick the active source id for a given output time. Logarithmic on
 *  the cut list length so a 200-cut group is still cheap to scrub. */
export function pickActiveSourceId(group: MulticamGroup, atSec: number): string | null {
  if (group.cutList.length === 0) return group.sources[0]?.id ?? null;
  let lo = 0;
  let hi = group.cutList.length - 1;
  let answer = group.cutList[0].sourceId;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (group.cutList[mid].atSec <= atSec) {
      answer = group.cutList[mid].sourceId;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return answer;
}

/** Insert / replace a cut at the given time. Maintains the
 *  sorted-by-atSec invariant. */
export function setCutAt(group: MulticamGroup, atSec: number, sourceId: string): MulticamGroup {
  const filtered = group.cutList.filter((c) => c.atSec !== atSec);
  const next = [...filtered, { atSec, sourceId }].sort((a, b) => a.atSec - b.atSec);
  return { ...group, cutList: next };
}

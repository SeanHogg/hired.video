/**
 * The compare panel: a slide-out from the right (90% wide; the whole
 * screen under 640px) over the dimmed workspace — not a page. Before on the
 * left (what it is compared with: the review's Before, the ★ master, the
 * last save, another version), After on the right, with "3 of N" change
 * navigation, Scroll together, Only changed sections, Revert all and the
 * selected change's why + Keep / Revert / Edit pinned to the foot.
 *
 * An accessible modal dialog (Radix: focus trap, Esc, aria-modal). ✕, Esc,
 * the backdrop and "Keep changes" all close it; the workspace underneath
 * never scrolled, so closing returns to exactly where the person was.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import type { ResumeContent } from "@shared/resume";
import type { ResumeAnnotations } from "@/components/resume-renderer/annotations";
import { toPreviewResume } from "@/lib/build/preview-resume";
import { diffContent } from "@/lib/build/review/content-diff";
import type { BuildReview } from "@/lib/build/review/use-build-review";
import { useCompareSource } from "@/lib/build/review/use-compare-source";
import { useScrollTogether } from "@/lib/build/review/use-scroll-together";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";
import { addMarks, addPins, addRemovedMarks, type Mutable } from "./annotation-builders";
import ChangePopover from "./ChangePopover";
import CompareColumn from "./CompareColumn";
import CompareHeader, { type CompareToggles } from "./CompareHeader";

interface ComparePanelProps {
  review: BuildReview;
  draft: ResumeContent | null;
  resumeId: string | null;
  descriptor: ResumeTemplateDescriptor;
  title: string;
}

/** Only the sections a change touches (header always stays). */
function onlyChanged(descriptor: ResumeTemplateDescriptor, sections: ReadonlySet<string>): ResumeTemplateDescriptor {
  return {
    ...descriptor,
    sections: descriptor.sections.map((b) => (b.kind === "section" && !sections.has(b.key) ? { ...b, enabled: false } : b)),
  };
}

export default function ComparePanel({ review, draft, resumeId, descriptor, title }: ComparePanelProps) {
  const { t } = useTranslation();
  const active = review.active;
  const open = review.compareOpen;
  const source = useCompareSource({ open, reviewBaseline: active?.baseline ?? null, lineage: review.lineage, resumeId });
  const [toggles, setToggles] = useState<CompareToggles>({ together: true, onlyChanged: false });
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const scroll = useScrollTogether(leftRef, rightRef, toggles.together);

  const right = active ? (active.proposed ?? draft) : draft;
  const left = source.content;
  const change = active?.changes[review.selected];

  const view = useMemo(() => {
    if (!left || !right) return null;
    const l: Mutable = {};
    const r: Mutable = {};
    addRemovedMarks(l, left, right);
    addMarks(r, left, right);
    if (active && active.kind !== "merge" && active.kind !== "pull" && active.kind !== "compare") {
      addPins(r, active.changes, change?.id ?? null, null);
    }
    const sections = new Set(diffContent(left, right).map((c) => c.section));
    const shown = toggles.onlyChanged ? onlyChanged(descriptor, sections) : descriptor;
    return {
      leftAnnotations: l as ResumeAnnotations,
      rightAnnotations: r as ResumeAnnotations,
      descriptor: shown,
      leftResume: toPreviewResume(left, title),
      rightResume: toPreviewResume(right, title),
    };
  }, [left, right, active, change?.id, toggles.onlyChanged, descriptor, title]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? review.openCompare() : review.closeCompare())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/45 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-background shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:w-[90vw]"
        >
          <CompareHeader review={review} source={source} toggles={toggles} onToggles={setToggles} />
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto px-4 py-4 sm:grid-cols-2 sm:overflow-hidden sm:px-5">
            <CompareColumn
              ref={leftRef}
              onScroll={scroll.fromLeft}
              label={t("review.compare.before")}
              meta={t(`review.compare.with.${source.choice.kind}`)}
              resume={view?.leftResume ?? null}
              descriptor={view?.descriptor ?? descriptor}
              annotations={view?.leftAnnotations}
              emptyText={source.loading ? t("review.loading") : t("review.compare.nothing")}
            />
            <CompareColumn
              ref={rightRef}
              onScroll={scroll.fromRight}
              label={t("review.compare.after")}
              meta={active ? t(`review.kind.${active.kind}`) : t("review.compare.thisResume")}
              resume={view?.rightResume ?? null}
              descriptor={view?.descriptor ?? descriptor}
              annotations={view?.rightAnnotations}
              emptyText={t("review.compare.nothing")}
            />
          </div>
          {active && change && (
            <div className="border-t border-border bg-card px-4 py-3 sm:px-5">
              <ChangePopover review={active} change={change} index={review.selected} onSelect={review.select} variant="footer" />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

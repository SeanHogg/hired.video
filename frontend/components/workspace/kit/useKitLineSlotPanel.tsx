/**
 * useKitLineSlotPanel — the résumé page's "This line" panel for the ONE
 * right slot: the rows for the line selected on the page (or its finding
 * flag), or an open row with ‹ back to them (ThisLineInspector,
 * components/build/this-line/). The open row belongs to the line it was
 * opened on. With no line selected (or a review open) it is null, and the
 * host falls back to what the stage shows — or to `emptyLinePanel`, so
 * the closed slot still keeps its "This line" edge tab.
 */
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { KitWorkspace } from "@/lib/workspace/use-kit-workspace";
import ThisLineInspector, { thisLineTitle } from "@/components/build/this-line/ThisLineInspector";
import { useThisLine } from "@/components/build/this-line/use-this-line";
import { LINE_DRILLS } from "@/components/build/this-line/line-drills";
import { drillSlotHeader } from "@/components/workspace/inspector/InspectorBody";
import { useInspectorDrill } from "@/components/workspace/inspector/use-inspector-drill";
import { INSPECTOR_PAD } from "@/components/workspace/inspector/inspector-styles";
import type { SlotPanel } from "../RightSlot";

export function useKitLineSlotPanel(kit: KitWorkspace, advanced: boolean): SlotPanel | null {
  const { t } = useTranslation();
  const { ready, journey, review, picks } = kit;
  // The résumé line selected on the page (KitLineRef → its field, findings, keywords).
  const thisLine = useThisLine({
    content: ready?.content ?? null,
    findings: kit.findings,
    jobMatch: journey.jobMatch,
    commit: kit.history.commit,
  });
  const line = review.active ? null : thisLine.line;
  const { drill, open, back } = useInspectorDrill(LINE_DRILLS, line?.path ?? "", advanced);
  if (!ready || !line) return null;

  const header = drillSlotHeader({
    t,
    registry: LINE_DRILLS,
    drill,
    onBack: back,
    kicker: t("workspace.slot.thisLine"),
    title: thisLineTitle(t, line),
  });
  return {
    ...header,
    content: (
      <div className={INSPECTOR_PAD}>
        <ThisLineInspector
          key={line.path}
          data={{ ...thisLine, line }}
          actions={kit.findingActions}
          onAsk={(text) => void kit.askChat(text)}
          design={{ style: picks.style, setStyle: picks.setStyle, descriptor: picks.descriptor }}
          advanced={advanced}
          drill={drill}
          onDrill={open}
        />
      </div>
    ),
  };
}

/** "This line" with nothing selected: how to pick one. */
export function emptyLinePanel(t: TFunction): SlotPanel {
  return {
    kicker: t("workspace.slot.thisLine"),
    title: t("workspace.inspector.pickLineTitle"),
    content: (
      <div className={INSPECTOR_PAD}>
        <p className="m-0 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          {t("workspace.inspector.pickLine")}
        </p>
      </div>
    ),
  };
}

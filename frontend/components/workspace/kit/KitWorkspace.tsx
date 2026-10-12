/**
 * KitWorkspace — a career kit (a résumé, its cover letter and its video,
 * made and edited together) in THE workspace frame. Render only: the kit's
 * state is useKitWorkspace; each region's content comes from its own
 * builder (useKitTools, useKitSlotPanels, KitCanvas, KitStrip, KitHeader).
 *
 *   /studio/new                    a new kit (the canvas is the drop zone)
 *   /studio/resume/:resumeId       that résumé's kit
 *   /studio/:projectId             a kit project (subject `resume_video`)
 *
 * Guest-first as the kit always was: build, preview and edit signed out;
 * Download and Post ask for an account in place.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { useIsWideWorkspace } from "@/hooks/use-media-query";
import { useKitWorkspace } from "@/lib/workspace/use-kit-workspace";
import { useKitPlayback } from "@/lib/workspace/use-kit-playback";
import { useWorkspaceDepth } from "@/lib/workspace/use-workspace-depth";
import { useRightSlot } from "@/lib/workspace/use-right-slot";
import { useLeftSheet } from "@/lib/workspace/use-left-sheet";
import { RAIL_TOOLS, type RailToolId } from "@/lib/workspace/workspace-panels";
import WorkspaceFrame from "../WorkspaceFrame";
import WorkspaceLeftPanel from "../WorkspaceLeftPanel";
import RightSlot from "../RightSlot";
import KitHeader from "./KitHeader";
import KitStepper, { KitNextButton, KitStepperSkeleton } from "./KitStepper";
import KitCanvas from "./KitCanvas";
import KitStrip from "./KitStrip";
import KitPreview from "./KitPreview";
import { useKitTools } from "./useKitTools";
import { useKitSlotPanels } from "./useKitSlotPanels";
import { KitLineSelectionProvider } from "@/lib/workspace/kit/use-kit-line-selection";
import { useLineSelectionSlot } from "@/components/build/this-line/use-line-selection-slot";
import { AuthGateSheet } from "@/components/auth/useAuthGate";
import { ProGateSheet } from "@/components/billing/useProGate";

interface KitWorkspaceProps {
  projectId: string | null;
  resumeId: string | null;
}

/** One line-selection store per kit: the page emits, "This line" reads. */
export default function KitWorkspace(props: KitWorkspaceProps) {
  return (
    <KitLineSelectionProvider>
      <KitWorkspaceBody {...props} />
    </KitLineSelectionProvider>
  );
}

function KitWorkspaceBody({ projectId, resumeId }: KitWorkspaceProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  useSEO(pathname);
  useBreadcrumbs([{ name: t("build.breadcrumb"), url: NEW_KIT_PATH }]);
  const wide = useIsWideWorkspace();
  const depth = useWorkspaceDepth();
  const kit = useKitWorkspace({ projectId, resumeId });
  const { ready, nav, post, journey, panel, video, editor, intake } = kit;
  const [previewOpen, setPreviewOpen] = useState(false);

  // Slot priority: a tool page, then Post, then the inspector. A tool counts
  // only when it has a page to show (an unknown id leaves the slot alone).
  const panels = useKitSlotPanels(kit, depth.advanced);
  const postSlot = { open: post.open, show: post.show, close: post.close };
  const toolSlot = { open: panels.tool !== null, close: journey.panel.close };
  // A selected résumé line opens the inspector; ✕ on it clears the selection.
  const slot = useLineSelectionSlot(
    useRightSlot({
      tool: toolSlot,
      post: postSlot,
      hasInspector: panels.inspector !== null,
      initialInspectorOpen: wide,
    }),
  );
  const { sheetOpen, setSheetOpen } = useLeftSheet(slot.active !== null, slot.close);

  const clock = useKitPlayback({
    canvas: editor.canvas,
    // The Preview shares this clock, so it doesn't count as covering the video.
    active: ready !== null && nav.page === "video" && slot.active !== "post",
    autoplayKey: intake.source,
    selected: video.selected,
  });

  const showCanvas = useCallback(() => setSheetOpen(false), [setSheetOpen]);

  // A link that opened a tool (`?tool=`): show it — in Advanced when it is
  // an Advanced tool, and in its sheet on phones. Once: later slot changes
  // rebuild `setSheetOpen`, and must not re-open the sheet or re-raise.
  const landedTool = kit.entry.landedTool;
  const { raise } = depth;
  const shownLanding = useRef<RailToolId | null>(null);
  useEffect(() => {
    if (!landedTool || shownLanding.current === landedTool) return;
    shownLanding.current = landedTool;
    if (RAIL_TOOLS.find((tool) => tool.id === landedTool)?.depth === "advanced") raise();
    if (!wide) setSheetOpen(true);
    // `wide` is read when the link lands, not watched.
  }, [landedTool, raise, setSheetOpen]);
  const tools = useKitTools({ kit, depth: depth.depth, showCanvas });

  return (
    <WorkspaceFrame
      label={t("workspace.kit.label")}
      header={
        <KitHeader
          kit={kit}
          depth={depth}
          page={pathname}
          onPreview={ready ? () => setPreviewOpen(true) : null}
        />
      }
      stepper={
        ready ? (
          <KitStepper
            stage={nav.stage}
            statuses={journey.statuses}
            readiness={journey.readiness}
            onStageChange={nav.goToStage}
            onNext={nav.next}
          />
        ) : (
          // Intake: hold the stepper's place so the canvas never jumps.
          <KitStepperSkeleton />
        )
      }
      rail={
        <WorkspaceLeftPanel
          tools={tools}
          active={panel.tool}
          onChange={panel.show}
          sheetOpen={sheetOpen}
          onSheetOpenChange={setSheetOpen}
          idPrefix="kit"
        />
      }
      canvas={<KitCanvas kit={kit} clock={clock} onCanvasClick={slot.openInspector} advanced={depth.advanced} />}
      strip={<KitStrip kit={kit} clock={clock} advanced={depth.advanced} />}
      slot={<RightSlot slot={slot} panels={panels} />}
      slotWidthPx={slot.widthPx}
      footer={
        ready ? (
          <KitNextButton stage={nav.stage} onNext={nav.next} className="w-full" />
        ) : (
          <span aria-hidden="true" className="block h-11 w-full rounded-[10px] bg-muted" />
        )
      }
    >
      {previewOpen && <KitPreview kit={kit} clock={clock} onClose={() => setPreviewOpen(false)} />}
      <ProGateSheet {...journey.toolGateSheet} />
      <AuthGateSheet {...kit.handoff.gateSheet} />
      <AuthGateSheet {...editor.uploadGateSheet} />
    </WorkspaceFrame>
  );
}

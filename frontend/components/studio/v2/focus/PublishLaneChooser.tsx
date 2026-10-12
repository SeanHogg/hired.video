/**
 * PublishLaneChooser — "Your accounts" vs "hired.video's channels" in the
 * Post dock (#2045). Lane B posts to the user's own connected accounts
 * (within the plan's channel cap); Lane A submits the video to hired.video's
 * brand channels (free, reviewed before it goes out).
 *
 * Self-gating: when Lane A isn't on offer for this project (signed out,
 * unsaved draft, no brand account live — usePromotionLane) it renders the
 * Lane B content alone, with no switch. Hosts never pass a `canPromote` flag.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { usePromotionLane } from "@/components/studio/share/usePromotionLane";
import SegmentToggle from "./SegmentToggle";

export type PublishLane = "self" | "managed";

export interface PublishLaneChooserProps {
  projectId: string | null;
  /** Lane B — the user's own accounts. Always available. */
  self: ReactNode;
  /** Lane A — hired.video's brand channels. */
  managed: ReactNode;
}

export default function PublishLaneChooser({ projectId, self, managed }: PublishLaneChooserProps) {
  const { t } = useTranslation();
  const { available } = usePromotionLane(projectId);
  const [lane, setLane] = useState<PublishLane>("self");

  if (!available) return <>{self}</>;

  return (
    <>
      <SegmentToggle<PublishLane>
        ariaLabel={t("publish.lane.label")}
        value={lane}
        onChange={setLane}
        options={[
          { id: "self", label: t("publish.lane.self") },
          { id: "managed", label: t("publish.lane.managed") },
        ]}
      />
      <p className="text-[13px] text-muted-foreground">
        {lane === "self" ? t("publish.lane.selfHint") : t("publish.lane.managedHint")}
      </p>
      {lane === "self" ? self : managed}
    </>
  );
}

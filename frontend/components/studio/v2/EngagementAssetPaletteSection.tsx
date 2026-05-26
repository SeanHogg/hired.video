/**
 * EngagementAssetPaletteSection — palette section that lists the
 * active project's authored engagement artifacts (forms, chapters,
 * thumbnails, review threads) as draggable tiles. Same `LeftPanelTile`
 * the rest of the palette uses so the surface feels unified.
 *
 * Per the DRY rule: reads `ENGAGEMENT_ASSET_REGISTRY` directly and
 * renders one collapsible sub-section per registered kind. Adding a
 * new engagement kind = one row in the registry; this component picks
 * it up automatically with no edits.
 *
 * Self-gating: returns `null` when there's no persisted projectId —
 * the per-project `listForProject(projectId)` calls would have nothing
 * to fetch. Each sub-section also self-renders empty / loading state,
 * so the parent never branches on "does the project have any forms?".
 */
import { useEffect, useState } from "react";

import { LeftPanelSection } from "./LeftPanelScroller";
import LeftPanelTile from "./LeftPanelTile";
import { useCollapsibleSections } from "@/lib/hooks/useCollapsibleSections";
import { writeDragPayload } from "@/lib/studio/editor-v2/drag-protocol";
import {
  ENGAGEMENT_ASSET_KINDS,
  ENGAGEMENT_ASSET_REGISTRY,
  encodeEngagementAssetRef,
  type EngagementAssetKind,
  type EngagementAssetSummary,
} from "@/lib/studio/editor-v2/engagement-assets";

interface EngagementAssetPaletteSectionProps {
  projectId: string | null;
  onInsert: (assetKind: EngagementAssetKind, assetId: string) => void;
}

export default function EngagementAssetPaletteSection({
  projectId,
  onInsert,
}: EngagementAssetPaletteSectionProps) {
  const sections = useCollapsibleSections(ENGAGEMENT_ASSET_KINDS, {
    storageKey: "studio.v2.left.engagement-assets.sections",
  });

  if (!projectId) return null;

  return (
    <>
      {ENGAGEMENT_ASSET_KINDS.map((kind) => {
        const meta = ENGAGEMENT_ASSET_REGISTRY[kind];
        return (
          <EngagementAssetKindSection
            key={kind}
            kind={kind}
            sectionLabel={meta.sectionLabel}
            open={sections.isOpen(kind)}
            onToggle={() => sections.toggle(kind)}
            projectId={projectId}
            onInsert={onInsert}
          />
        );
      })}
    </>
  );
}

interface EngagementAssetKindSectionProps {
  kind: EngagementAssetKind;
  sectionLabel: string;
  open: boolean;
  onToggle: () => void;
  projectId: string;
  onInsert: (assetKind: EngagementAssetKind, assetId: string) => void;
}

function EngagementAssetKindSection({
  kind,
  sectionLabel,
  open,
  onToggle,
  projectId,
  onInsert,
}: EngagementAssetKindSectionProps) {
  const meta = ENGAGEMENT_ASSET_REGISTRY[kind];
  const [items, setItems] = useState<EngagementAssetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (items !== null) return;
    let cancelled = false;
    meta
      .listForProject(projectId)
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setError(err instanceof Error ? err.message : "Couldn't load items.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, items, meta, projectId]);

  return (
    <LeftPanelSection
      title={sectionLabel}
      open={open}
      onToggle={onToggle}
      contentClassName="grid grid-cols-2 gap-2"
    >
      {items === null && (
        <div className="col-span-2 px-1 py-2 text-[11px] text-muted-foreground">
          Loading…
        </div>
      )}
      {items !== null && items.length === 0 && (
        <div className="col-span-2 px-1 py-2 text-[11px] text-muted-foreground">
          {error ??
            `No ${meta.label.toLowerCase()}s yet — create one from the dialog below, then drag it onto the canvas.`}
        </div>
      )}
      {items?.map((item) => (
        <LeftPanelTile
          key={item.id}
          label={item.title}
          icon={meta.icon}
          hint={item.subtitle}
          onClick={() => onInsert(item.kind, item.id)}
          draggable
          onDragStart={(e) =>
            writeDragPayload(e.dataTransfer, {
              kind: "engagement-asset",
              data: encodeEngagementAssetRef(item.kind, item.id),
            })
          }
        />
      ))}
    </LeftPanelSection>
  );
}

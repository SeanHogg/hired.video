/**
 * LinkedContentPaletteSection — palette section that lists the current
 * user's owned entities (resumes / jobs / future kinds) as draggable
 * tiles. Each tile is the same `LeftPanelTile` the static widget catalog
 * uses, so the bottom of the palette feels unified with the top.
 *
 * Per the DRY rule: this component reads `LINKED_CONTENT_REGISTRY`
 * directly and renders one collapsible section per registered kind.
 * Adding a new entity kind = one row in the registry; this component
 * picks it up automatically with no edits.
 *
 * Self-gating: each section renders its own empty / loading / signed-out
 * state. The parent never branches on "does the user have any
 * content?" — it just mounts this section.
 */
import { useEffect, useState } from "react";
import { LeftPanelSection } from "./LeftPanelScroller";
import LeftPanelTile from "./LeftPanelTile";
import { useCollapsibleSections } from "@/lib/hooks/useCollapsibleSections";
import { writeDragPayload } from "@/lib/studio/editor-v2/drag-protocol";
import {
  LINKED_CONTENT_KINDS,
  LINKED_CONTENT_REGISTRY,
  encodeLinkedContentRef,
  type LinkedContentKind,
  type LinkedContentSummary,
} from "@/lib/studio/editor-v2/linked-content";

interface LinkedContentPaletteSectionProps {
  onInsert: (entityKind: LinkedContentKind, entityId: string) => void;
}

export default function LinkedContentPaletteSection({
  onInsert,
}: LinkedContentPaletteSectionProps) {
  const sections = useCollapsibleSections(LINKED_CONTENT_KINDS, {
    storageKey: "studio.v2.left.linked-content.sections",
  });

  return (
    <>
      {LINKED_CONTENT_KINDS.map((kind) => {
        const meta = LINKED_CONTENT_REGISTRY[kind];
        return (
          <LinkedContentKindSection
            key={kind}
            kind={kind}
            sectionLabel={meta.sectionLabel}
            open={sections.isOpen(kind)}
            onToggle={() => sections.toggle(kind)}
            onInsert={onInsert}
          />
        );
      })}
    </>
  );
}

interface LinkedContentKindSectionProps {
  kind: LinkedContentKind;
  sectionLabel: string;
  open: boolean;
  onToggle: () => void;
  onInsert: (entityKind: LinkedContentKind, entityId: string) => void;
}

function LinkedContentKindSection({
  kind,
  sectionLabel,
  open,
  onToggle,
  onInsert,
}: LinkedContentKindSectionProps) {
  const meta = LINKED_CONTENT_REGISTRY[kind];
  const [items, setItems] = useState<LinkedContentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (items !== null) return;
    let cancelled = false;
    meta
      .listForUser()
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
  }, [open, items, meta]);

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
          {error ?? `No ${meta.label.toLowerCase()}s yet — sign in or create one to drop it here.`}
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
              kind: "linked-content",
              data: encodeLinkedContentRef(item.kind, item.id),
            })
          }
        />
      ))}
    </LeftPanelSection>
  );
}

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
 * content?" — it just mounts this section. When the visitor is signed
 * OUT we never call `listForUser()` (the API would 401 with "Missing or
 * malformed Authorization header"); instead each expanded section shows
 * an in-place "sign in / create account" CTA that opens the shared
 * `useAuthGate` panel without leaving the canvas.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LeftPanelSection } from "./LeftPanelScroller";
import LeftPanelTile from "./LeftPanelTile";
import { Button } from "@/components/ui/button";
import { useAuthGate } from "@/components/auth/useAuthGate";
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
  const { t } = useTranslation();
  const sections = useCollapsibleSections(LINKED_CONTENT_KINDS, {
    storageKey: "studio.v2.left.linked-content.sections",
  });

  // Shared in-place auth panel — opened when a signed-out visitor taps
  // the CTA inside any of the "Your …" sections. After signup (which
  // redirects through email verify) we return to the current studio
  // location so the draft + palette come back.
  const redirectTo =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : undefined;
  const { requireAuth, gate, isAuthed } = useAuthGate({
    redirectTo,
    defaultReason: t("studio.linkedContent.authReason"),
    title: t("studio.linkedContent.authTitle"),
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
            isAuthed={isAuthed}
            onRequireAuth={() =>
              requireAuth({ reason: t("studio.linkedContent.authReason") })
            }
          />
        );
      })}
      {gate}
    </>
  );
}

interface LinkedContentKindSectionProps {
  kind: LinkedContentKind;
  sectionLabel: string;
  open: boolean;
  onToggle: () => void;
  onInsert: (entityKind: LinkedContentKind, entityId: string) => void;
  /** Whether the current visitor is authenticated. Drives the CTA vs.
   *  fetch branch — we never hit the owner-scoped API while signed out. */
  isAuthed: boolean;
  /** Opens the shared in-place auth panel. */
  onRequireAuth: () => void;
}

function LinkedContentKindSection({
  kind,
  sectionLabel,
  open,
  onToggle,
  onInsert,
  isAuthed,
  onRequireAuth,
}: LinkedContentKindSectionProps) {
  const { t } = useTranslation();
  const meta = LINKED_CONTENT_REGISTRY[kind];
  const [items, setItems] = useState<LinkedContentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Signed-out visitors get the CTA below — don't fetch (the API 401s)
    // and reset any stale cache so a sign-in triggers a fresh load.
    if (!isAuthed) {
      setItems(null);
      setError(null);
      return;
    }
    if (items !== null) return;
    let cancelled = false;
    meta
      .listForUser()
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        // Never surface the raw server message (e.g. "Missing or
        // malformed Authorization header") — show a friendly retry line.
        setItems([]);
        setError(t("studio.linkedContent.loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, items, meta, isAuthed, t]);

  return (
    <LeftPanelSection
      title={sectionLabel}
      open={open}
      onToggle={onToggle}
      contentClassName="grid grid-cols-2 gap-2"
    >
      {!isAuthed ? (
        <div className="col-span-2 space-y-2 px-1 py-2">
          <p className="text-[11px] text-muted-foreground">
            {t("studio.linkedContent.authPrompt")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 w-full text-[11px]"
            onClick={onRequireAuth}
          >
            {t("studio.linkedContent.authCta")}
          </Button>
        </div>
      ) : (
        <>
          {items === null && (
            <div className="col-span-2 px-1 py-2 text-[11px] text-muted-foreground">
              {t("status.loading")}
            </div>
          )}
          {items !== null && items.length === 0 && (
            <div className="col-span-2 px-1 py-2 text-[11px] text-muted-foreground">
              {error ??
                t("studio.linkedContent.emptyKind", {
                  label: meta.label.toLowerCase(),
                })}
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
        </>
      )}
    </LeftPanelSection>
  );
}

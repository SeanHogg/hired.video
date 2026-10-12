import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Pagination, { usePaginatedList } from "@/components/Pagination";
import type { ViewMode } from "@/lib/hooks/useViewMode";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import type { ContentTemplate } from "@/lib/studio/templates/catalog";
import type {
  TemplateKindFilter,
  TemplateUseForFilter,
} from "@/lib/studio/templates/template-filters";
import type { StudioTemplate } from "@/lib/services/studio-templates-service";
import type { TemplateRow } from "@/lib/studio/landing/types";
import { mediaKindLabelKey } from "@shared/template-kinds";
import BuiltinTemplateCard from "./BuiltinTemplateCard";
import OwnedTemplateCard from "./OwnedTemplateCard";
import TemplateTable from "./TemplateTable";

/**
 * Single carousel that renders the consolidated Templates section —
 * built-in catalog rows and user-owned rows live side-by-side in one
 * horizontal scroller, gated by the same filter pills above. Owned rows
 * already lead the list when "All" is active (composed in `filteredRows`)
 * so the user's library sits ahead of the starter catalog.
 */
export default function UnifiedTemplateCarousel({
  rows,
  loading,
  useForFilter,
  kindFilter,
  viewMode,
  onPickBuiltin,
  onPreviewBuiltin,
  onPickOwned,
  onPreviewOwned,
}: {
  rows: TemplateRow[];
  loading: boolean;
  useForFilter: TemplateUseForFilter;
  kindFilter: TemplateKindFilter;
  viewMode: ViewMode;
  onPickBuiltin: (id: string) => void;
  onPreviewBuiltin: (id: ContentTemplate) => void;
  onPickOwned: (template: StudioTemplate) => void;
  onPreviewOwned: (template: StudioTemplate) => void;
}) {
  const { t } = useTranslation();
  // Owned-ONLY filters depend on the licensed-templates fetch; the built-in
  // catalog is static so it must never wait on `loading`. The "all" view
  // includes built-ins (the page's primary CTA), so it renders them
  // immediately and lets owned rows prepend when the fetch resolves — a slow
  // or hanging owned-templates request must NOT hide built-in matches (e.g.
  // searching "actor" → "Actor showreel"). Only created/purchased — which show
  // owned rows exclusively — gate on the skeleton.
  const dependsOnOwned = useForFilter === "created" || useForFilter === "purchased";
  if (loading && dependsOnOwned) {
    return (
      <div className="flex gap-4 overflow-hidden pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="aspect-video w-60 shrink-0 animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    // Kind-aware empty-state copy. Driven by the shared, localized kind
    // label (@shared/template-kinds) so the "No Podcast templates yet…"
    // message rolls out automatically when the user filters to a kind that
    // has no entries in the catalog.
    const kindLabel = kindFilter !== "all" ? t(mediaKindLabelKey(kindFilter)) : null;
    const message = useForFilter === "created"
      ? kindLabel
        ? t("messages.studioLanding.emptyCreatedKind", { kind: kindLabel })
        : t("messages.studioLanding.emptyCreated")
      : useForFilter === "purchased"
        ? kindLabel
          ? t("messages.studioLanding.emptyPurchasedKind", { kind: kindLabel })
          : t("messages.studioLanding.emptyPurchased")
        : kindLabel
          ? t("messages.studioLanding.emptySearchKind", { kind: kindLabel })
          : t("messages.studioLanding.emptySearch");
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
        {message}
      </div>
    );
  }
  const rowKey = (row: TemplateRow) =>
    row.kind === "builtin"
      ? `builtin:${row.template.id}`
      : `owned:${row.owned.provenance}:${row.owned.template.id}`;
  const renderCard = (row: TemplateRow) =>
    row.kind === "builtin" ? (
      <BuiltinTemplateCard
        template={row.template}
        onPick={onPickBuiltin}
        onPreview={onPreviewBuiltin}
      />
    ) : (
      <OwnedTemplateCard
        owned={row.owned}
        onPick={onPickOwned}
        onPreview={onPreviewOwned}
      />
    );

  if (viewMode === "table") {
    return (
      <TemplateTable
        rows={rows}
        onPickBuiltin={onPickBuiltin}
        onPreviewBuiltin={onPreviewBuiltin}
        onPickOwned={onPickOwned}
        onPreviewOwned={onPreviewOwned}
      />
    );
  }
  if (viewMode === "grid") {
    return <TemplateGrid rows={rows} rowKey={rowKey} renderCard={renderCard} />;
  }
  return (
    <HorizontalScroller
      itemCount={rows.length}
      cellClassName="w-[72vw] max-w-[15rem] shrink-0 snap-start sm:w-60 sm:max-w-none"
    >
      {rows.map((row) => (
        <Fragment key={rowKey(row)}>{renderCard(row)}</Fragment>
      ))}
    </HorizontalScroller>
  );
}

/** Paginated grid of template rows. Mirrors `StudioContentGrid` — the
 *  scroll view stays a free carousel, but the grid pages the full row set
 *  through the shared `usePaginatedList` anchor so a large owned-template
 *  library plus the starter catalog don't render in one wall. */
function TemplateGrid({
  rows,
  rowKey,
  renderCard,
}: {
  rows: TemplateRow[];
  rowKey: (row: TemplateRow) => string;
  renderCard: (row: TemplateRow) => ReactNode;
}) {
  const { pageItems, paginationProps } = usePaginatedList(rows, 12);
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {pageItems.map((row) => (
          <div key={rowKey(row)}>{renderCard(row)}</div>
        ))}
      </div>
      <Pagination {...paginationProps} />
    </div>
  );
}

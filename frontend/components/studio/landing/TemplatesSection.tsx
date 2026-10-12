import { useTranslation } from "react-i18next";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import TemplateCatalogFilters from "@/components/studio/templates/TemplateCatalogFilters";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { ACTION_BAR_SURFACE } from "@/lib/ui/action-bar";
import type { OwnedTemplates } from "@/lib/studio/landing/use-owned-templates";
import { useTemplateRows } from "@/lib/studio/landing/use-template-rows";
import { useTemplateActions } from "@/lib/studio/landing/use-template-actions";
import type { CreateStudioDraft } from "@/lib/studio/landing/types";
import UnifiedTemplateCarousel from "./UnifiedTemplateCarousel";

/**
 * /studio Templates section (`#templates` — the New menu's "Browse every
 * format" lands here): built-in catalog + the viewer's owned templates in
 * one scroller / grid / table, with the Type + Use-for filters and the
 * view toggle in its header bar.
 */
export default function TemplatesSection({
  owned,
  query,
  create,
}: {
  owned: OwnedTemplates;
  query: string;
  create: CreateStudioDraft;
}) {
  const { t } = useTranslation();
  const { useForFilter, setUseForFilter, kindFilter, setKindFilter, filteredRows } =
    useTemplateRows(owned.ownedTemplates, query);
  const { openTemplate, openStudioTemplate, previewStudioTemplate, previewTemplate } =
    useTemplateActions(create);
  // Per-section layout mode (Scroll | Grid | Table), persisted to
  // localStorage via `useViewMode` so the choice survives reloads.
  const [templatesView, setTemplatesView] = useViewMode(
    "studio.templates",
    "scroll",
    BROWSE_VIEW_MODES,
  );

  return (
    <section id="templates" className="scroll-mt-24">
      <div className={ACTION_BAR_SURFACE}>
      {/* One row: title + description on the left, the condensed Type /
          Use-for dropdowns and the view toggle aligned to the far right.
          The two filter axes used to render as ~23 wrapping pills which
          overwhelmed the chooser — now two compact dropdowns. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-[-0.02em]">{t("headings.studioLanding.templates")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("messages.studioLanding.templatesDescription")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Type + Use-for filters — shared with the New-project Wizard
              via `<TemplateCatalogFilters>`. `includeOwnedPills` adds the
              "Created" / "Purchased" options the wizard hides (it only
              authors fresh built-in templates). */}
          <TemplateCatalogFilters
            kindFilter={kindFilter}
            onKindFilterChange={setKindFilter}
            useForFilter={useForFilter}
            onUseForFilterChange={setUseForFilter}
            includeOwnedPills
          />
          <ViewModeToggle
            value={templatesView}
            onChange={setTemplatesView}
            modes={BROWSE_VIEW_MODES}
          />
        </div>
      </div>
      </div>

      <UnifiedTemplateCarousel
        rows={filteredRows}
        loading={owned.loading}
        useForFilter={useForFilter}
        kindFilter={kindFilter}
        viewMode={templatesView}
        onPickBuiltin={openTemplate}
        onPreviewBuiltin={previewTemplate}
        onPickOwned={openStudioTemplate}
        onPreviewOwned={previewStudioTemplate}
      />
    </section>
  );
}

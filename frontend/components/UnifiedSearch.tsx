import * as React from "react";
import { useTranslation } from "react-i18next";
import ActionsModal from "@/components/ActionsModal";
import SearchBar from "@/components/SearchBar";
import Pagination from "@/components/Pagination";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import { cn } from "@/lib/utils";
import { SearchCategoryBar } from "@/components/search/SearchCategoryBar";
import { SearchResultsTable } from "@/components/search/SearchResultsTable";
import { SearchEmptyState, SearchErrorState, SearchLoadingGrid } from "@/components/search/SearchResultStates";
import { useUnifiedSearch } from "@/components/search/useUnifiedSearch";

interface UnifiedSearchProps {
  /**
   * Stick the search + category chips bar to the top of the viewport
   * (just under the fixed Navigation header) while the user scrolls.
   */
  stickySearch?: boolean;
  /**
   * Optional promo cell injected into the results grid (first page only) so it
   * reads as one of the result cards rather than an out-of-place sidebar ad.
   * Kept as a prop so UnifiedSearch stays generic — only /search opts in.
   */
  promoCard?: React.ReactNode;
}

export default function UnifiedSearch({
  stickySearch = false,
  promoCard,
}: UnifiedSearchProps) {
  const { t } = useTranslation();
  const {
    searchFilters,
    selectedCategory,
    viewMode,
    setViewMode,
    handleSearch,
    handleFilterChange,
    handleClearFilters,
    handleCategoryChange,
    clientSearchNeedle,
    totalFound,
    contentError,
    isLoadingContent,
    filteredItems,
    paginatedItems,
    renderResultCard,
    entityHref,
    handleView,
    retry,
    currentPage,
    itemsPerPage,
    startIndex,
    endIndex,
    setCurrentPage,
    handleItemsPerPageChange,
    actionsModalProps,
  } = useUnifiedSearch();

  // Build the card list for Grid/Scroll once, including the page-1 promo
  // slot, so both modes stay identical.
  const resultCards: React.ReactNode[] = paginatedItems.map((item, index) =>
    renderResultCard(item, index),
  );
  if (promoCard && currentPage === 1) {
    resultCards.splice(
      Math.min(2, resultCards.length),
      0,
      <React.Fragment key="creator-promo">{promoCard}</React.Fragment>,
    );
  }

  return (
    <>
      {/* Search + filters control */}
      <section
        className={cn(
          // `bg-actionbar` gives the search/filter bar a tone distinct from the
          // page canvas — matching the shared action-bar treatment on the entity
          // pages. Sticky when the host opts in via `stickySearch`.
          "border-b border-border bg-actionbar/95 px-6 py-4 backdrop-blur-md sm:py-6",
          stickySearch && "sticky top-16 z-40",
        )}
      >
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 sm:gap-4">
          <SearchBar
            context="all"
            value={searchFilters.search}
            filters={searchFilters}
            onSearch={handleSearch}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
          />

          {/* Category pills + the shared Scroll/Grid/Table toggle on ONE
           * horizontally-scrollable row. SearchBar's own legacy grid/list
           * toggle is intentionally not wired here: UnifiedSearch owns the
           * canonical browse-mode control. */}
          <SearchCategoryBar
            selectedCategory={selectedCategory}
            onCategoryChange={handleCategoryChange}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </section>

      {/* Results */}
      <section className="px-6 pb-6 pt-8 sm:pb-8">
        <div className="mx-auto w-full max-w-[1200px]">
          <div className="mb-4 sm:mb-6">
            <p className="font-mono text-xs text-muted-foreground sm:text-sm">
              {clientSearchNeedle !== ""
                ? t("search.resultsCountForQuery", {
                    count: totalFound,
                    query: clientSearchNeedle,
                  })
                : t("search.resultsCount", { count: totalFound })}
              {totalFound > itemsPerPage &&
                ` ${t("search.showingRange", {
                  start: startIndex + 1,
                  end: Math.min(endIndex, totalFound),
                })}`}
            </p>
          </div>

          {contentError ? (
            <SearchErrorState onRetry={retry} />
          ) : isLoadingContent && filteredItems.length === 0 ? (
            <SearchLoadingGrid />
          ) : filteredItems.length > 0 ? (
            <>
              {viewMode === "table" ? (
                <SearchResultsTable
                  items={paginatedItems}
                  hrefFor={entityHref}
                  onView={handleView}
                />
              ) : viewMode === "scroll" ? (
                <HorizontalScroller itemCount={resultCards.length}>
                  {resultCards.map((card, i) => (
                    <React.Fragment key={(card as any)?.key ?? i}>
                      {card}
                    </React.Fragment>
                  ))}
                </HorizontalScroller>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-5">
                  {resultCards}
                </div>
              )}

              <Pagination
                currentPage={currentPage}
                totalItems={totalFound}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            </>
          ) : (
            <SearchEmptyState />
          )}
        </div>
      </section>

      <ActionsModal {...actionsModalProps} />
    </>
  );
}

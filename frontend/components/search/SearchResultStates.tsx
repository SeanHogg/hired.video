// Non-result states for <UnifiedSearch />: load error (with retry), the
// skeleton grid while the first page loads, and the empty state. Design-system
// surfaces only (rounded-20 card, accent icon tile, muted copy).

import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const STATE_CARD = "flex flex-col items-center gap-3 rounded-[20px] border border-border bg-card p-6 py-12 text-center";

export function SearchErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className={STATE_CARD}>
      <p className="text-muted-foreground">{t("errors.loadContentFailed")}</p>
      <Button variant="outline" onClick={onRetry}>
        {t("actions.retry")}
      </Button>
    </div>
  );
}

export function SearchLoadingGrid() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-label={t("status.loading")}
      className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-5"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-[20px] border border-border bg-muted" />
      ))}
    </div>
  );
}

export function SearchEmptyState() {
  const { t } = useTranslation();
  return (
    <div className={STATE_CARD}>
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
        <Search className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="text-lg font-semibold text-foreground">{t("messages.noContentFound")}</h3>
      <p className="text-muted-foreground">{t("messages.tryAdjustingSearch")}</p>
    </div>
  );
}

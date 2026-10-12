// Controls for /templates: the Resume | Video segmented switch (sits in the
// page header row), the search + sort row, and the industry chip strip.
// Presentational: state + setters come from useTemplateBrowse.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { PillChip } from "@/components/content/ChipFilterRow";
import { cn } from "@/lib/utils";
import type { BrowseSort, BrowseState, BrowseTab } from "@/lib/templates/browse";

type OnChange = (patch: Partial<BrowseState>) => void;

const TABS: Array<{ id: BrowseTab; labelKey: string }> = [
  { id: "resume", labelKey: "labels.resume" },
  { id: "video", labelKey: "templates.browse.tabVideo" },
];

const SEARCH_DEBOUNCE_MS = 250;

/** Resume | Video segmented switch. */
export function BrowseTabs({ tab, onChange }: { tab: BrowseTab; onChange: OnChange }) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("templates.browse.typeAria")}
      className="inline-flex gap-1 rounded-xl bg-border p-1"
    >
      {TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={tab === item.id}
          onClick={() => onChange({ tab: item.id })}
          className={cn(
            "min-h-[44px] rounded-[9px] px-[18px] text-sm font-semibold transition-colors",
            tab === item.id
              ? "bg-card text-foreground shadow-sm"
              : "text-foreground/80 hover:text-foreground",
          )}
        >
          {t(item.labelKey)}
        </button>
      ))}
    </div>
  );
}

interface Props {
  state: BrowseState;
  industries: string[];
  onChange: OnChange;
}

/** Search + sort row, then (resume tab) the scrollable industry chips. */
export default function BrowseControls({ state, industries, onChange }: Props) {
  const { t } = useTranslation();

  // Local draft so typing stays responsive; committed to the URL after a pause.
  const [draft, setDraft] = useState(state.q);
  useEffect(() => setDraft(state.q), [state.q]);
  useEffect(() => {
    if (draft.trim() === state.q) return;
    const id = window.setTimeout(() => onChange({ q: draft }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [draft, state.q, onChange]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-[48px] min-w-0 flex-[1_1_280px] items-center gap-2.5 rounded-xl border border-input bg-card px-3.5 focus-within:ring-2 focus-within:ring-ring">
          <span className="sr-only">{t("templates.browse.searchLabel")}</span>
          <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("templates.browse.searchPlaceholder")}
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          {t("templates.browse.sortLabel")}
          <select
            value={state.sort}
            onChange={(e) => onChange({ sort: e.target.value as BrowseSort })}
            className="min-h-[48px] rounded-xl border border-input bg-card px-3 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="recommended">{t("templates.browse.sortRecommended")}</option>
            <option value="name">{t("labels.name")}</option>
          </select>
        </label>
      </div>

      {state.tab === "resume" && industries.length > 0 && (
        <div
          role="group"
          aria-label={t("templates.browse.industryAria")}
          className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 sm:mx-0 sm:px-0"
        >
          <PillChip active={!state.industry} onClick={() => onChange({ industry: "" })}>
            {t("labels.allShort")}
          </PillChip>
          {industries.map((ind) => (
            <PillChip key={ind} active={state.industry === ind} onClick={() => onChange({ industry: ind })}>
              {ind}
            </PillChip>
          ))}
        </div>
      )}
    </>
  );
}

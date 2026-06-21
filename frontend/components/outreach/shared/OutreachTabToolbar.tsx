/**
 * OutreachTabToolbar — the shared sticky action band for the Outreach list
 * tabs (Templates, Contacts, Campaigns, My Content). It pins as a SECOND
 * stacked band directly beneath the Outreach tab strip (which is itself a
 * sticky `ACTION_BAR_STICKY` PageHeader), so each tab's title + search + view
 * toggle + primary action read as one continuous sticky action panel.
 *
 * The search lives inline on the right next to the view toggle / action
 * button rather than as a separate full-width row below the header (#outreach
 * action-panel consolidation). Tabs without a search (My Content) simply omit
 * the `search` prop.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ACTION_BAR_STICKY_STACKED, ACTION_BAR_SURFACE } from "@/lib/ui/action-bar";
import { SearchInput } from "@/components/outreach/shared/SearchInput";

export interface OutreachTabToolbarProps {
  /** Left-aligned heading. Omit on surfaces that don't want a redundant title. */
  title?: string;
  /** Inline search, rendered to the left of the right-side controls. Omit when
   *  the tab has nothing to search. */
  search?: {
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
  };
  /** Right-side controls — the view-mode toggle + primary action button(s). */
  children?: ReactNode;
}

export function OutreachTabToolbar({ title, search, children }: OutreachTabToolbarProps) {
  return (
    <div
      className={cn(
        ACTION_BAR_STICKY_STACKED,
        ACTION_BAR_SURFACE,
        "flex flex-col gap-3 sm:flex-row sm:items-center",
      )}
    >
      {title && <h2 className="text-2xl font-bold shrink-0">{title}</h2>}
      <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
        {search && (
          <SearchInput
            placeholder={search.placeholder}
            value={search.value}
            onChange={search.onChange}
            className="w-full sm:w-64"
          />
        )}
        {children}
      </div>
    </div>
  );
}

export default OutreachTabToolbar;

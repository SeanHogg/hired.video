/**
 * useStudioEntryParams — the editor's entry contract with deep links, read
 * ONCE on mount:
 *
 *   ?share=1  → open the Post panel on load (e.g. the promotion-notification
 *               link `/studio/:id?share=1`)
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

export interface StudioEntryParams {
  shareOnLoad: boolean;
}

/** Pure parse of the entry params (tested). */
export function parseStudioEntryParams(search: URLSearchParams): StudioEntryParams {
  return {
    shareOnLoad: search.get("share") === "1",
  };
}

export function useStudioEntryParams(): StudioEntryParams {
  const [searchParams] = useSearchParams();
  // Mount-time snapshot — later param edits must not reopen the panel.
  const [entry] = useState(() => parseStudioEntryParams(searchParams));
  return entry;
}

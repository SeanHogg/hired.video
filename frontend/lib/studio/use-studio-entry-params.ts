/**
 * useStudioEntryParams — the editor's entry contract with deep links, read
 * ONCE on mount:
 *
 *   ?share=1  → open the Post panel on load (e.g. the promotion-notification
 *               link `/studio/:id?share=1`)
 *   ?render=1 → render + host the video once it has loaded (the Chrome
 *               extension's "Render & post" — the API cannot render, so the
 *               tab it opens does; the hosted render also publishes it)
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

export interface StudioEntryParams {
  shareOnLoad: boolean;
  renderOnLoad: boolean;
}

/** Pure parse of the entry params (tested). */
export function parseStudioEntryParams(search: URLSearchParams): StudioEntryParams {
  return {
    shareOnLoad: search.get("share") === "1",
    renderOnLoad: search.get("render") === "1",
  };
}

export function useStudioEntryParams(): StudioEntryParams {
  const [searchParams] = useSearchParams();
  // Mount-time snapshot — later param edits must not reopen the panel.
  const [entry] = useState(() => parseStudioEntryParams(searchParams));
  return entry;
}

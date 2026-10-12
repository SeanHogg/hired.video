// useComposerLinkPreview — resolves the OpenGraph card for the first URL
// in the feed composer's text (#1968). Debounced so typing a URL doesn't
// fire a request per keystroke, and stale responses (the text moved on
// to a different URL, or lost it) are dropped. Clearing the text clears
// the preview, so callers never reset it by hand.

import { useEffect, useState } from "react";
import { getLinkPreview } from "@/lib/services/feed-service";
import type { LinkPreviewResponse } from "@/types/feed";

const URL_IN_TEXT = /https?:\/\/[^\s]+/;
const DEBOUNCE_MS = 500;

/** First absolute http(s) URL in `text`, or null. */
export function firstUrlIn(text: string): string | null {
  const match = text.match(URL_IN_TEXT)?.[0];
  if (!match) return null;
  try {
    new URL(match);
    return match;
  } catch {
    return null;
  }
}

export function useComposerLinkPreview(content: string): {
  preview: LinkPreviewResponse | null;
  loading: boolean;
} {
  const url = firstUrlIn(content);
  const [preview, setPreview] = useState<LinkPreviewResponse | null>(null);
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) {
      setPreview(null);
      setResolvedFor(null);
      setLoading(false);
      return;
    }
    if (url === resolvedFor) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      getLinkPreview({ url })
        .then((next) => {
          if (cancelled) return;
          setPreview(next);
          setLoading(false);
          setResolvedFor(url);
        })
        .catch(() => {
          // Unreachable / refused URL — the bare link in the text stands.
          if (cancelled) return;
          setPreview(null);
          setLoading(false);
          setResolvedFor(url);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [url, resolvedFor]);

  return { preview: url && resolvedFor === url ? preview : null, loading: loading && url !== null };
}

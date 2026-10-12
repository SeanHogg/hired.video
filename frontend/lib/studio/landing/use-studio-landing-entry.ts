/**
 * useStudioLandingEntry — the /studio deep-link bounce.
 *
 * Extensions, entity cards (ResumeCard / JobCard / etc.), marketing CTAs,
 * and the marketplace "Use" button sometimes hit /studio with
 * editor-relevant query params (`?capture=`, `?subject=`,
 * `?contentTemplate=`, `?studioTemplate=`, `?template=`, `?new=1`, the
 * document edit params). Each is one handler in `entry/table.ts`; the
 * handler mints / finds the project SERVER-SIDE via the page's shared
 * `create` and the hook replace-navigates to `/studio/<real-id>`.
 *
 * Returns `pending` — true only while a handler is actually running, so the
 * page shows the loading shell instead of flashing the chooser (#1882). It
 * is derived from the URL on first paint (no chooser flash) and cleared when
 * a handler fails: the toast is the handler's, the URL is replaced to
 * `/studio` so a refresh doesn't retry. Runs each deep link once, and again
 * when the deep-link params change on the same mounted page (in-app
 * navigation to `/studio?new=1`).
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { entryKey, matchEntry, runEntry, STUDIO_LANDING_PATH } from "./entry/table";
import type { CreateStudioDraft } from "./types";

export function useStudioLandingEntry(create: CreateStudioDraft): boolean {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const key = entryKey(searchParams);
  // The deep link whose handler failed — pending stays off for it until the
  // replace-navigate to /studio lands.
  const [settledKey, setSettledKey] = useState<string | null>(null);
  // The deep link already started — guards StrictMode's double effect and
  // re-renders (the effect re-fires whenever `create` is re-minted).
  const startedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (key === null) {
      startedKeyRef.current = null;
      setSettledKey(null);
      return;
    }
    if (startedKeyRef.current === key) return;
    const handler = matchEntry(searchParams);
    if (!handler) return;
    startedKeyRef.current = key;
    setSettledKey(null);
    // The create seam navigates by itself for signed-out visitors (anon
    // editor) and kit templates (career kit) and returns null — compare the
    // address bar so that isn't mistaken for a failure.
    const startHref = window.location.href;
    void runEntry(
      handler,
      { params: searchParams, create, t, toast },
      () => window.location.href !== startHref,
    ).then((resolution) => {
      // A newer deep link replaced this one on the same page — ignore.
      if (startedKeyRef.current !== key) return;
      if (resolution.type === "navigate") {
        navigate(resolution.to, { replace: true });
      } else if (resolution.type === "failed") {
        setSettledKey(key);
        navigate(STUDIO_LANDING_PATH, { replace: true });
      }
    });
  }, [key, searchParams, create, t, toast, navigate]);

  return key !== null && key !== settledKey;
}

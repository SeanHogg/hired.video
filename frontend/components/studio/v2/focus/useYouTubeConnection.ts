/**
 * useYouTubeConnection — whether the signed-in user has a YouTube channel
 * connected, for every surface that posts to YouTube (the Post dock and the
 * Distribution Hub). YouTube channels live in `youtube_accounts` (connected
 * through /api/youtube), not the shared social connection query, so this
 * reads them on its own: while `active`, on window focus (the OAuth finishes
 * in another tab) and when the integration callback broadcasts.
 *
 * `onConnected` runs each time a read finds a channel (the dock auto-picks
 * YouTube then). It is read through a ref, so passing a fresh closure
 * doesn't re-subscribe.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { youtubeService } from "@/lib/services/youtube-service";
import { useIntegrationOAuthLinked } from "@/lib/studio/integration-oauth";

export type YouTubeConnectionState = "unknown" | "connected" | "disconnected";

export function useYouTubeConnection(active: boolean, onConnected?: () => void) {
  const [state, setState] = useState<YouTubeConnectionState>("unknown");
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  const reload = useCallback(async () => {
    if (!active) return;
    try {
      const res = await youtubeService.getAccount();
      const connected = !!res.data;
      setState(connected ? "connected" : "disconnected");
      if (connected) onConnectedRef.current?.();
    } catch {
      setState("disconnected");
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    void reload();
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active, reload]);

  useIntegrationOAuthLinked("youtube", reload, active);

  /** A post answered "not connected": show Connect again. */
  const markDisconnected = useCallback(() => setState("disconnected"), []);

  return { state, connected: state === "connected", reload, markDisconnected };
}

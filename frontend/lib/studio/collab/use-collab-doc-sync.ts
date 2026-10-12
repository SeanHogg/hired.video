/**
 * Live document sync over the StudioRoom (#2243): joins the room, broadcasts
 * local edits (debounced, change-detected) and applies peer snapshots. Echo
 * is suppressed by one baseline — set after a broadcast AND before applying
 * a remote doc — so the re-render an apply causes never bounces the same
 * content back. The caller owns WHAT the document is (`buildDoc`) and how a
 * peer's doc lands in its state (`applyDoc`); this owns the sync mechanics.
 */
import { useCallback, useEffect, useRef } from "react";
import { useStudioRoom, type StudioRoomState } from "./use-studio-room";

/** Far tighter than autosave so co-editors see changes near-instantly, while
 *  a fast burst (e.g. dragging) still coalesces into one frame. */
const BROADCAST_DEBOUNCE_MS = 350;

interface Options<Doc> {
  projectId: string | null;
  identity: { userId: string; displayName: string } | null;
  active: boolean;
  buildDoc: () => Doc;
  applyDoc: (doc: Doc) => void;
}

export function useCollabDocSync<Doc extends object>({
  projectId,
  identity,
  active,
  buildDoc,
  applyDoc,
}: Options<Doc>): StudioRoomState {
  const baselineRef = useRef<string | null>(null);
  const armedRef = useRef(false);

  const onRemoteDoc = useCallback(
    (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      // Baseline BEFORE the caller's setState calls so the broadcast effect
      // that fires on the resulting re-render sees no net change.
      baselineRef.current = JSON.stringify(raw);
      applyDoc(raw as Doc);
    },
    [applyDoc],
  );

  const room = useStudioRoom({ projectId, identity, active, onRemoteDoc });

  useEffect(() => {
    if (!room.connected) return;
    // First armed pass = the just-connected baseline (or the doc the room
    // just synced in), not a user edit — record and bail.
    if (!armedRef.current) {
      armedRef.current = true;
      baselineRef.current = JSON.stringify(buildDoc());
      return;
    }
    const handle = window.setTimeout(() => {
      const snap = JSON.stringify(buildDoc());
      if (snap === baselineRef.current) return; // unchanged / remote echo
      baselineRef.current = snap;
      room.broadcast(JSON.parse(snap));
    }, BROADCAST_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [room, buildDoc]);

  // Re-arm when the connection drops so a reconnect re-seeds from the
  // then-current state instead of a stale baseline.
  useEffect(() => {
    if (!room.connected) armedRef.current = false;
  }, [room.connected]);

  return room;
}

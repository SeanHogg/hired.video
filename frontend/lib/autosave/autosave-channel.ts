/**
 * autosave-channel — tells the other open tabs of this browser that a
 * document was just saved (#2242).
 *
 * Every tab that autosaves a document listens on its key (e.g.
 * `studio:<projectId>`, `resume:<id>`). When another tab saves the same
 * document, this tab knows its copy is no longer the newest one, and the
 * editor asks the user which copy to keep instead of silently overwriting
 * the other tab's work on its next save. Self-gated: a no-op where
 * BroadcastChannel is unavailable (old Safari, SSR) — the server's version
 * check (409) still catches the conflict there.
 */

const CHANNEL_NAME = "hired-autosave";

/** This tab's identity, so a tab ignores its own messages. */
export const AUTOSAVE_TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export interface AutosaveSavedMessage {
  type: "saved";
  key: string;
  tabId: string;
  savedAt: number;
}

function isSavedMessage(data: unknown): data is AutosaveSavedMessage {
  const m = data as Partial<AutosaveSavedMessage> | null;
  return !!m && m.type === "saved" && typeof m.key === "string" && typeof m.tabId === "string";
}

let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/** Announce that `key` was saved by this tab. */
export function announceAutosave(key: string): void {
  const ch = getChannel();
  if (!ch) return;
  const message: AutosaveSavedMessage = { type: "saved", key, tabId: AUTOSAVE_TAB_ID, savedAt: Date.now() };
  try {
    ch.postMessage(message);
  } catch {
    /* channel closed — nothing to tell */
  }
}

/** Call `onRemoteSave` when ANOTHER tab saves `key`. Returns the unsubscribe. */
export function onRemoteAutosave(key: string, onRemoteSave: (message: AutosaveSavedMessage) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const listener = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (isSavedMessage(data) && data.key === key && data.tabId !== AUTOSAVE_TAB_ID) onRemoteSave(data);
  };
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}

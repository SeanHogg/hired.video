/**
 * When `key` last became non-null (ms) — e.g. when the open review started —
 * so the chat can place it among the turns in the order things happened.
 * Null while `key` is null.
 */
import { useState } from "react";

export function useOpenedAt(key: string | null): number | null {
  const [held, setHeld] = useState<{ key: string | null; at: number | null }>({ key: null, at: null });
  if (held.key !== key) {
    // Adjust-state-during-render: a new key stamps the time once.
    const next = { key, at: key === null ? null : Date.now() };
    setHeld(next);
    return next.at;
  }
  return held.at;
}

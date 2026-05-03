/**
 * useSessions — fetch + manage the caller's active sessions.
 *
 * Single source of truth for any UI that displays or mutates the
 * sessions list. Components that render rows do NOT take canRevoke /
 * isCurrent props — they call this hook and read from the returned
 * sessions array, which already carries the `current` flag from the
 * backend.
 */

import { useCallback, useEffect, useState } from "react";
import { sessionsService, type SessionRow } from "@/lib/services/sessions-service";

export type UseSessionsApi = {
  sessions: SessionRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  revoke: (id: string) => Promise<void>;
  revokeAllOthers: () => Promise<void>;
};

export function useSessions(): UseSessionsApi {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await sessionsService.list();
      setSessions(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load sessions";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revoke = useCallback(
    async (id: string) => {
      await sessionsService.revoke(id);
      await refresh();
    },
    [refresh],
  );

  const revokeAllOthers = useCallback(async () => {
    await sessionsService.revokeAllOthers();
    await refresh();
  }, [refresh]);

  return { sessions, loading, error, refresh, revoke, revokeAllOthers };
}

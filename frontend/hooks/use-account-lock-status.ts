/**
 * useAccountLockStatus — single source of truth for "is this user
 * currently locked?". Fetches from a dedicated lightweight endpoint
 * so any component (LockedAccountBadge, user list rows, profile
 * headers) can self-decide what to render without prop drilling.
 *
 * Cached at the React-Query / shared-state layer would be ideal; the
 * current impl is a per-component fetch which is fine for the admin
 * surfaces this is used on (small lists, infrequent re-renders).
 */

import { useEffect, useState } from "react";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const StatusSchema = z.object({
  locked: z.boolean(),
  reason: z.string().nullable(),
  unlocksAt: z.string().nullable(),
});

export type AccountLockStatus = z.infer<typeof StatusSchema>;

export function useAccountLockStatus(userId: string | null | undefined) {
  const [status, setStatus] = useState<AccountLockStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiClient
      .get(`/api/admin/security/locked-accounts/${encodeURIComponent(userId)}/status`, StatusSchema)
      .then((res) => {
        if (cancelled) return;
        setStatus(res.data);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { status, loading };
}

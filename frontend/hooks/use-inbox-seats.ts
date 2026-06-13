/**
 * Shared inbox-seat add-on hook (#809).
 *
 * Single source of truth for "how many mailboxes can this user connect, and
 * how many extra slots have they bought?". Both the connect gate
 * (`<ConnectMailboxButtons />`) and the purchase control
 * (`<InboxSeatAddonControl />`) read it, so a purchase made in the control
 * propagates to the gate's `atCap` check without a manual round-trip — they
 * share one value via the `useGatedResource` cross-instance cache (gap #1692).
 *
 * `effectiveCap` is the included base + purchased slots, mirroring the
 * server-side cap in `checkInboxSyncEntitlement` (routes/email-integration.ts)
 * so the client gate and the API gate can't disagree.
 *
 * `enabled` is the caller's "is this user a Pro who can hold an add-on?"
 * predicate (typically `isPro`). When false we skip the network call (the
 * route is Pro-gated and would 402) and report the included-base cap, which
 * is all a non-Pro consumer needs before its own upgrade CTA short-circuits.
 */

import { useCallback } from "react";
import { useGatedResource } from "@/hooks/use-gated-resource";
import { billingService, type InboxSeatState } from "@/lib/services/billing-service";
import {
  INBOX_SYNC_INCLUDED_ACCOUNTS,
  INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
} from "@shared/pricing";

const BASE_STATE: InboxSeatState = {
  quantity: 0,
  unitPriceCents: Math.round(INBOX_SYNC_EXTRA_ACCOUNT_PRICE * 100),
  monthlyTotalCents: 0,
  effectiveCap: INBOX_SYNC_INCLUDED_ACCOUNTS,
  status: "active",
};

export interface InboxSeatsHook {
  state: InboxSeatState;
  /** Included base + purchased slots — the real connect ceiling. */
  effectiveCap: number;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Set the extra-slot count (0–50); broadcasts the new state to every
   *  consumer on the shared key so the gate re-evaluates immediately. */
  setQuantity: (quantity: number) => Promise<InboxSeatState | null>;
}

export function useInboxSeats(enabled: boolean): InboxSeatsHook {
  const { data, isLoading, refresh, setData } = useGatedResource<InboxSeatState>({
    fetcher: () => (enabled ? billingService.getInboxSeats() : Promise.resolve(BASE_STATE)),
    defaults: BASE_STATE,
    // Share one value across the gate + the control only when enabled — a
    // non-Pro consumer keeps its own un-fetched BASE_STATE.
    cacheKey: enabled ? "inbox-seats" : undefined,
    deps: [enabled],
  });

  const setQuantity = useCallback(
    async (quantity: number): Promise<InboxSeatState | null> => {
      try {
        const next = await billingService.setInboxSeats(quantity);
        setData(next); // broadcasts to every subscriber on the shared key
        return next;
      } catch {
        return null;
      }
    },
    [setData],
  );

  return { state: data, effectiveCap: data.effectiveCap, loading: isLoading, refresh, setQuantity };
}

/**
 * Self-gating "Extra inbox slots" add-on control (#809).
 *
 * The single source of truth for buying / reducing paid mailbox slots
 * above the {INBOX_SYNC_INCLUDED_ACCOUNTS} included with Pro. It owns ALL
 * the purchase logic and decides its own visibility — no consumer passes a
 * `canBuy` flag:
 *
 *   • Anonymous / non-Pro / still-loading → renders null.
 *   • Pro user who is NOT at cap and owns 0 extra slots → renders null
 *     (they still have free included slots; nothing to manage yet).
 *   • Otherwise → renders the stepper so the user can add slots (when at
 *     cap) or reduce them (when they over-bought and freed a mailbox).
 *
 * Reducing below the number of currently-connected mailboxes is blocked —
 * you can't strand an active inbox by removing the slot under it.
 *
 * On change it PATCHes `/api/Billing/inbox-seats`, then refreshes the
 * shared `useEmailAccounts()` cache so the sibling `<ConnectMailboxButtons />`
 * gate re-evaluates against the new cap without a manual round-trip.
 */

import { useCallback, useState } from "react";
import { Loader2, Minus, Plus, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { useEmailAccounts } from "@/hooks/use-email-accounts";
import { useInboxSeats } from "@/hooks/use-inbox-seats";
import { useToast } from "@/components/ui/use-toast";
import {
  INBOX_SYNC_INCLUDED_ACCOUNTS,
  INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
} from "@shared/pricing";

const MAX_EXTRA_SLOTS = 50;

export function InboxSeatAddonControl() {
  const { isAuthenticated } = useAuth();
  const { isPro, loading: subLoading } = useSubscription();
  const { activeCount, loading: accountsLoading, refresh: refreshAccounts } = useEmailAccounts();
  // Shared with the connect gate — a purchase here broadcasts to
  // `<ConnectMailboxButtons />` so it can connect the new mailbox at once.
  const { state, loading, setQuantity } = useInboxSeats(isPro);
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);

  const apply = useCallback(
    async (quantity: number) => {
      setSaving(true);
      try {
        const next = await setQuantity(quantity);
        if (!next) throw new Error("Update failed");
        // Cap changed → re-evaluate the connect gate against the new ceiling.
        await refreshAccounts();
        toast({
          title:
            quantity === 0
              ? "Extra inbox slots removed"
              : `Inbox add-on updated — ${quantity} extra slot${quantity === 1 ? "" : "s"}`,
          description:
            quantity === 0
              ? "You're back to the included mailboxes."
              : `$${(next.monthlyTotalCents / 100).toFixed(2)}/mo · ${next.effectiveCap} mailboxes total.`,
        });
      } catch (err) {
        toast({
          title: "Couldn't update inbox slots",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
    },
    [setQuantity, refreshAccounts, toast],
  );

  // Self-gating: nothing to show until we know the user is a Pro with
  // either an existing add-on or a reason to buy one.
  if (!isAuthenticated || subLoading || accountsLoading || loading) return null;
  if (!isPro) return null;

  const quantity = state.quantity;
  const atCap = activeCount >= INBOX_SYNC_INCLUDED_ACCOUNTS + quantity;
  if (quantity === 0 && !atCap) return null;

  // Can't reduce the cap below the mailboxes already connected.
  const minQuantity = Math.max(0, activeCount - INBOX_SYNC_INCLUDED_ACCOUNTS);
  const canDecrement = !saving && quantity > minQuantity;
  const canIncrement = !saving && quantity < MAX_EXTRA_SLOTS;
  const monthlyTotal = (state.monthlyTotalCents / 100).toFixed(2);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4" />
          Extra inbox slots
        </CardTitle>
        <CardDescription>
          Pro includes {INBOX_SYNC_INCLUDED_ACCOUNTS} connected mailboxes. Add more for $
          {INBOX_SYNC_EXTRA_ACCOUNT_PRICE}/mo each — billed on your Pro subscription.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => apply(quantity - 1)}
              disabled={!canDecrement}
              aria-label="Remove an inbox slot"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Minus className="h-4 w-4" />}
            </Button>
            <span className="min-w-[2ch] text-center font-medium tabular-nums">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => apply(quantity + 1)}
              disabled={!canIncrement}
              aria-label="Add an inbox slot"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
            <span className="text-sm text-muted-foreground">
              extra slot{quantity === 1 ? "" : "s"}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            {quantity > 0 ? (
              <span className="font-medium text-foreground">${monthlyTotal}/mo</span>
            ) : (
              "No add-on yet"
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {activeCount} of {state.effectiveCap} mailboxes connected
          {quantity > 0 && quantity === minQuantity
            ? " · disconnect a mailbox to remove a paid slot"
            : ""}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Shared, self-gating "Connect Gmail / Connect Outlook" affordance.
 *
 * Single source of truth for the OAuth-start UI — used by the Settings
 * Integrations section and by the inbox empty-state CTA. The component
 * decides its own visibility:
 *
 *   • Anonymous user → renders null (auth is a prerequisite for the
 *     OAuth round-trip's `link_token`).
 *   • Non-Pro user → renders an "Inbox Sync is a Pro feature" upgrade
 *     CTA pointing at the Pricing page. The /api gate would also
 *     redirect them, but blocking client-side avoids the round-trip.
 *   • Pro user with `INBOX_SYNC_INCLUDED_ACCOUNTS` mailboxes already
 *     connected → renders a disabled state with an upgrade CTA pointing
 *     at the extra-inbox add-on. Mirrors the /api gate.
 *   • Otherwise → renders the standard Connect buttons.
 *
 * Consumers compose `<ConnectMailboxButtons />` without re-declaring the
 * buttons, the URL builder, or any of the gating logic. No prop-drilled
 * `canX` booleans — the gate state comes from `useSubscription` and
 * `useEmailAccounts`.
 */

import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  emailIntegrationService,
  type EmailProviderId,
} from "@/lib/services/email-integration-service";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { useEmailAccounts } from "@/hooks/use-email-accounts";
import {
  INBOX_SYNC_INCLUDED_ACCOUNTS,
  INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
} from "@shared/pricing";

interface ConnectMailboxButtonsProps {
  /** Where to return to after the OAuth round-trip. Defaults to the
   *  Settings integrations tab so the user lands back on the surface
   *  where they manage mailboxes. Inbox-side callers pass the inbox
   *  URL so the user lands back on the inbox they just lit up. */
  redirect?: string;
}

const PROVIDERS: Array<{ id: EmailProviderId; label: string }> = [
  { id: "gmail", label: "Connect Gmail" },
  { id: "outlook", label: "Connect Outlook" },
];

export function ConnectMailboxButtons({ redirect }: ConnectMailboxButtonsProps) {
  const { isAuthenticated } = useAuth();
  const { isPro, loading: subLoading } = useSubscription();
  const { activeCount, loading: accountsLoading } = useEmailAccounts();

  // Anonymous users have no `link_token` to send through the OAuth flow.
  if (!isAuthenticated) return null;

  // Hold UI while we know whether the user is Pro / at-cap — otherwise
  // we'd flash the wrong CTA on first render.
  if (subLoading || accountsLoading) return null;

  if (!isPro) {
    return (
      <Link to="/pricing?upgrade=inbox-sync">
        <Button variant="outline">
          Inbox Sync is a Pro feature — upgrade
        </Button>
      </Link>
    );
  }

  const atCap = activeCount >= INBOX_SYNC_INCLUDED_ACCOUNTS;
  if (atCap) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-xs text-muted-foreground">
          You've connected the {INBOX_SYNC_INCLUDED_ACCOUNTS} included
          mailboxes. Add more for ${INBOX_SYNC_EXTRA_ACCOUNT_PRICE}/mo each.
        </p>
        <Link to="/pricing?upgrade=inbox-extra">
          <Button variant="outline">Add more inboxes</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {PROVIDERS.map((p) => (
        <Button
          key={p.id}
          variant="outline"
          onClick={() => {
            window.location.href = emailIntegrationService.connectUrl(p.id, redirect);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> {p.label}
        </Button>
      ))}
    </div>
  );
}

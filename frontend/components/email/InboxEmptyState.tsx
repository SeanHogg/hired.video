/**
 * Self-gating empty-state for the unified Communication Hub inbox.
 *
 * Two branches, decided internally:
 *   • No mailbox connected → "Close the loop on your job search" CTA
 *     with the shared connect buttons. Promotes the email-integration
 *     feature exactly where the user notices the inbox is empty.
 *   • At least one active mailbox → standard "You're all caught up"
 *     copy. The cron sweep keeps the inbox warm; nothing for the user
 *     to do.
 *
 * Owns its own data fetch so the InboxPanel doesn't have to know about
 * mailbox accounts. Logged-out / unauth callers fall through to the
 * "all caught up" branch — the connect CTA only renders for authenticated
 * users (the OAuth flow needs a session).
 */

import { useEffect, useState } from "react";
import { Inbox as InboxIcon, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  emailIntegrationService,
  type ConnectedEmailAccount,
} from "@/lib/services/email-integration-service";
import { ConnectMailboxButtons } from "./ConnectMailboxButtons";

interface AccountState {
  loading: boolean;
  hasActive: boolean;
}

function useHasActiveMailbox(): AccountState {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<AccountState>({ loading: true, hasActive: false });

  useEffect(() => {
    if (!isAuthenticated) {
      setState({ loading: false, hasActive: false });
      return;
    }
    let cancelled = false;
    emailIntegrationService
      .listAccounts()
      .then((accounts: ConnectedEmailAccount[]) => {
        if (cancelled) return;
        setState({
          loading: false,
          hasActive: accounts.some((a) => a.status === "active"),
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Endpoint failure: don't block the empty state behind a spinner.
        setState({ loading: false, hasActive: false });
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return state;
}

export function InboxEmptyState() {
  const { isAuthenticated } = useAuth();
  const { loading, hasActive } = useHasActiveMailbox();

  // While probing, render the neutral "all caught up" — beats flashing a
  // "connect inbox" CTA at users who actually have one connected.
  if (loading || hasActive || !isAuthenticated) {
    return (
      <div className="text-center py-12 px-4">
        <InboxIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium">You're all caught up</p>
        <p className="text-xs text-muted-foreground mt-1">
          Messages, notifications, connection requests, and synced emails will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-10 px-4 flex flex-col items-center gap-3">
      <Mail className="h-9 w-9 text-emerald-600/70" />
      <div>
        <p className="text-sm font-semibold">Close the loop on your job search</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          Connect Gmail or Outlook and we'll surface ATS replies, recruiter outreach, interviews, and offers
          right here — automatically classified and linked to jobs you've applied to.
        </p>
      </div>
      <ConnectMailboxButtons redirect="/outreach?tab=inbox" />
    </div>
  );
}

export default InboxEmptyState;

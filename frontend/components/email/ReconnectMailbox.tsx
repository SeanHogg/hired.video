/**
 * Reconnect affordance for mailboxes whose stored refresh token Google
 * or Microsoft has rejected (`invalid_grant`). Two self-gating surfaces
 * share one OAuth-start path so the Inbox tab and the Settings list
 * can't drift:
 *
 *   • `<ReconnectMailboxButton>` — inline per-row button. Renders null
 *     when the account isn't in `status: "error"`, so the consumer can
 *     drop it next to every row without computing a `shouldShow` flag.
 *
 *   • `<ReconnectMailboxBanner>` — top-of-surface banner that lists
 *     every errored mailbox in the list. Renders null when the list
 *     has no errored mailboxes. The Inbox tab mounts it unconditionally
 *     because the visibility decision lives inside the component.
 *
 * Reconnect just re-runs the OAuth flow against the same account email.
 * The callback's `upsert` keys on `(userId, provider, accountEmail)`,
 * so a re-consent of the same Google / Microsoft account refreshes the
 * existing row in place (`status: "active"`, fresh refresh token,
 * `lastError: null`). Synced messages stay because the row's id
 * doesn't change.
 */

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  emailIntegrationService,
  type EmailProviderId,
} from "@/lib/services/email-integration-service";

/** Structural shape both `InboxAccount` (from `useCommHub`) and
 *  `ConnectedEmailAccount` (from the Settings page service) already
 *  satisfy — using a Pick decouples this UI from either consumer's
 *  full type. `lastError` is optional so callers whose DTO doesn't
 *  carry it yet can still gate on `status` alone. */
export interface ReconnectableAccount {
  id: string;
  provider: string;
  accountEmail: string;
  accountLabel: string | null;
  status: string;
  lastError?: string | null;
}

function providerLabel(provider: string): string {
  if (provider === "gmail") return "Gmail";
  if (provider === "outlook") return "Outlook";
  return provider;
}

function startReconnect(account: ReconnectableAccount, redirect?: string): void {
  // Reuses the same `/connect` route the initial setup hits; the OAuth
  // callback's upsert keys on (userId, provider, accountEmail) so a
  // re-consent of the same mailbox refreshes the existing row in place.
  window.location.href = emailIntegrationService.connectUrl(
    account.provider as EmailProviderId,
    redirect,
  );
}

interface ReconnectMailboxButtonProps {
  account: ReconnectableAccount;
  /** Where to return after re-consent. Defaults to the Settings email
   *  tab; Inbox callers pass their own URL so the user lands back where
   *  they triggered the reconnect from. */
  redirect?: string;
  size?: "sm" | "default";
}

export function ReconnectMailboxButton({
  account,
  redirect,
  size = "sm",
}: ReconnectMailboxButtonProps) {
  // Self-gating: a row that isn't in error doesn't need a Reconnect
  // affordance, so the consumer can mount the button on every row
  // without a `account.status === "error" &&` ternary.
  if (account.status !== "error") return null;
  return (
    <Button
      variant="outline"
      size={size}
      onClick={() => startReconnect(account, redirect)}
      className="text-amber-700 border-amber-300 hover:bg-amber-50 hover:text-amber-900"
    >
      <RefreshCw className="h-3.5 w-3.5 mr-1" />
      Reconnect {providerLabel(account.provider)}
    </Button>
  );
}

interface ReconnectMailboxBannerProps {
  accounts: ReconnectableAccount[];
  redirect?: string;
}

export function ReconnectMailboxBanner({
  accounts,
  redirect,
}: ReconnectMailboxBannerProps) {
  const errored = accounts.filter((a) => a.status === "error");
  // Self-gating: nothing to reconnect → render nothing. Consumers can
  // mount this at the top of any mailbox-aware surface without first
  // checking whether any are in error.
  if (errored.length === 0) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 px-3 py-2 flex flex-col gap-2">
      <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="text-xs leading-snug">
          <span className="font-medium">
            {errored.length === 1
              ? "1 mailbox needs reconnecting"
              : `${errored.length} mailboxes need reconnecting`}
            .
          </span>{" "}
          The provider rejected the saved refresh token — re-consent to keep
          syncing. Synced messages and rules stay intact.
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-6">
        {errored.map((a) => (
          <Button
            key={a.id}
            variant="outline"
            size="sm"
            onClick={() => startReconnect(a, redirect)}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Reconnect {providerLabel(a.provider)} ({a.accountEmail})
          </Button>
        ))}
      </div>
    </div>
  );
}

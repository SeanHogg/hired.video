/**
 * Shared connected-mailbox data hook.
 *
 * Wraps `emailIntegrationService.listAccounts()` in the standard
 * `useGatedResource` lifecycle so both the Inbox panel and the
 * self-gating `<ConnectMailboxButtons />` can read the same data without
 * each component re-implementing the auth-ready / loading / error
 * dance. Stays SSoT for "what does the user's connected-mailbox state
 * look like right now?" — counts, active flag, raw list.
 */

import {
  emailIntegrationService,
  type ConnectedEmailAccount,
} from "@/lib/services/email-integration-service";
import { useGatedResource } from "@/hooks/use-gated-resource";

const EMPTY: ConnectedEmailAccount[] = [];

export interface EmailAccountsState {
  accounts: ConnectedEmailAccount[];
  activeCount: number;
  hasActive: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Optimistic-update entry point — consumers that mutate the
   *  connected-mailbox list (disconnect, patch label) can drop the
   *  next-state in immediately instead of waiting for a refresh. */
  setAccounts: (
    next:
      | ConnectedEmailAccount[]
      | ((prev: ConnectedEmailAccount[]) => ConnectedEmailAccount[]),
  ) => void;
}

export function useEmailAccounts(): EmailAccountsState {
  const { data, isLoading, refresh, setData } = useGatedResource<ConnectedEmailAccount[]>({
    fetcher: () => emailIntegrationService.listAccounts(),
    defaults: EMPTY,
  });
  const activeCount = data.filter((a) => a.status === "active").length;
  return {
    accounts: data,
    activeCount,
    hasActive: activeCount > 0,
    loading: isLoading,
    refresh,
    setAccounts: setData,
  };
}

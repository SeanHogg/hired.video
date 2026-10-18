import { useEffect, useState } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { settingsService } from "@/lib/services/settings-service";

export interface LinkedAccount {
  id: string;
  provider: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
}

export interface LinkedSecuritySettings {
  twoFactorEnabled: boolean;
  hasPassword: boolean;
  linkedAccounts: LinkedAccount[];
}

function errorMessage(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return undefined;
}

/**
 * Security tab data (linked OAuth accounts, password, 2FA) — lazy-loaded when
 * the tab is active; reloaded after returning from an OAuth connect flow.
 */
export function useSecuritySettings(
  isAuthenticated: boolean,
  activeTab: string,
  setActiveTab: (tab: string) => void,
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [security, setSecurity] = useState<LinkedSecuritySettings | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);

  // Lazy-load security settings when security tab is active
  useEffect(() => {
    if (!isAuthenticated || activeTab !== "security" || security !== null) return;
    setSecurityLoading(true);
    settingsService
      .getLinkedSecuritySettings()
      .then(setSecurity)
      .catch((err) => console.error("Failed to load security settings", err))
      .finally(() => setSecurityLoading(false));
  }, [isAuthenticated, activeTab, security]);

  // After returning from an OAuth connect flow, reload security data and clear the param
  useEffect(() => {
    if (!searchParams.get("connected") || !isAuthenticated) return;
    setActiveTab("security");
    setSecurity(null); // force reload
    setSearchParams((p) => { p.delete("connected"); return p; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isAuthenticated]);

  const handleUnlinkProvider = async (provider: string) => {
    setUnlinkingProvider(provider);
    try {
      await settingsService.unlinkOAuthProvider(provider);
      setSecurity((prev) =>
        prev ? { ...prev, linkedAccounts: prev.linkedAccounts.filter((a) => a.provider !== provider) } : null,
      );
      const providerLabel = `${provider.charAt(0).toUpperCase()}${provider.slice(1)}`;
      toast({ title: t("messages.providerDisconnected", { provider: providerLabel }) });
    } catch (err: unknown) {
      toast({ title: t("errors.disconnectAccountFailed"), description: errorMessage(err) ?? t("messages.pleaseTryAgain"), variant: "destructive" });
    } finally {
      setUnlinkingProvider(null);
    }
  };

  return { security, securityLoading, unlinkingProvider, handleUnlinkProvider };
}

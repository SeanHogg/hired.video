import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw } from "lucide-react";
import { AccountAuditLogPanel } from "@/components/settings/AccountAuditLogPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { oauthLinkUrl } from "@/lib/services/oauth-service";
import {
  OAUTH_LINK_PROVIDERS,
  OAUTH_PROVIDER_LABELS,
} from "@/components/settings/settings-tabs";
import type { LinkedSecuritySettings } from "@/components/settings/hooks/useSecuritySettings";

interface SecuritySettingsTabProps {
  security: LinkedSecuritySettings | null;
  securityLoading: boolean;
  unlinkingProvider: string | null;
  onUnlinkProvider: (provider: string) => void;
}

export function SecuritySettingsTab({
  security,
  securityLoading,
  unlinkingProvider,
  onUnlinkProvider,
}: SecuritySettingsTabProps) {
  const { t } = useTranslation();
  return (
    <>
      {/* Unified audit log — every login, password / email change,
          account lock, impersonation event, and admin action in
          one chronological stream. Mounts at the top of the
          Security tab so the most security-relevant context is
          the first thing the user sees. */}
      <AccountAuditLogPanel />
      <Card>
        <CardHeader>
          <CardTitle>{t("headings.connectedAccounts")}</CardTitle>
          <CardDescription>
            {t("messages.connectedAccountsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {securityLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("status.loading")}
            </div>
          ) : (
            <>
              {OAUTH_LINK_PROVIDERS.map((provider) => {
                const linked = security?.linkedAccounts.find((a) => a.provider === provider);
                const providerLabel = OAUTH_PROVIDER_LABELS[provider];
                return (
                  <div key={provider} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-sm font-bold">
                        {provider === "google" && <span className="text-primary">G</span>}
                        {provider === "linkedin" && <span className="text-primary">in</span>}
                        {provider === "github" && <span>⌬</span>}
                        {provider === "microsoft" && <span className="text-primary">⊞</span>}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{providerLabel}</p>
                        {linked ? (
                          <p className="text-xs text-muted-foreground">{linked.displayName ?? linked.email ?? t("labels.connected")}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">{t("labels.notConnected")}</p>
                        )}
                      </div>
                    </div>
                    {linked ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={unlinkingProvider === provider}
                        onClick={() => onUnlinkProvider(provider)}
                      >
                        {unlinkingProvider === provider ? <Loader2 className="h-3 w-3 animate-spin" /> : t("actions.disconnect")}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          window.location.href = oauthLinkUrl(provider, "/settings");
                        }}
                      >
                        {t("actions.connect")}
                      </Button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("headings.password")}</CardTitle>
          <CardDescription>
            {security?.hasPassword
              ? t("messages.passwordChangeDesc")
              : t("messages.passwordSetDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="gap-2" asChild>
            <Link to="/forgot-password">
              <RefreshCw className="h-4 w-4" />
              {security?.hasPassword ? t("actions.changePassword") : t("actions.setPassword")}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("headings.twoFactorAuth")}</CardTitle>
          <CardDescription>{t("messages.twoFactorAuthDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {security?.twoFactorEnabled ? t("labels.enabled") : t("labels.disabled")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {security?.twoFactorEnabled
                  ? t("messages.twoFactorEnabledDesc")
                  : t("messages.twoFactorDisabledDesc")}
              </p>
            </div>
            <Badge variant={security?.twoFactorEnabled ? "default" : "secondary"}>
              {security?.twoFactorEnabled ? t("labels.on") : t("labels.off")}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

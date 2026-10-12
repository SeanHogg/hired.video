// /settings/connections — Layer 3 of the social connection model (PRD §5.0):
// each user connects their OWN social accounts, enabling Lane B ("post to my
// account", Pro-gated). Lane availability is read from the shared
// useSocialPublishEntitlement hook (the SSoT the publish lane chooser also
// uses), so this page never re-derives "can I post to X".
//
// Mirrors the /settings/ads (PaidMediaPage) connection surface.

import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { APP_PAGE_COLUMN_NARROW, SUCCESS_CALLOUT } from "@/lib/ui/page-layout";
import { SocialConnectionsList } from "@/components/social/SocialConnectionsList";
import { integrationOAuthReasonText } from "@/lib/studio/integration-oauth";
import { cn } from "@/lib/utils";

export default function ConnectionsPage() {
  const { t } = useTranslation();
  useSEO("/settings/connections");
  useBreadcrumbs([
    { name: t("headings.settings"), url: "/settings" },
    { name: t("settings.connections.title"), url: "/settings/connections" },
  ]);
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status");
  const platformParam = searchParams.get("platform");
  const reason = searchParams.get("reason");

  return (
    <AppShell bgClassName="bg-background">
      <div className={APP_PAGE_COLUMN_NARROW}>
        <PageHeader
          title={t("settings.connections.title")}
          description={t("settings.connections.body")}
          meta={
            status === "connected" ? (
              <div role="status" className={cn(SUCCESS_CALLOUT, "flex items-center gap-2 px-3 py-2 text-sm")}>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-green-text" aria-hidden="true" />
                {t("settings.connections.connected", {
                  platform: platformParam ?? t("settings.connections.accountFallback"),
                })}
              </div>
            ) : status === "error" ? (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t("settings.connections.error", {
                  platform: platformParam ?? "",
                  reason: reason ? integrationOAuthReasonText(reason, t) : t("settings.connections.unknownError"),
                })}
              </div>
            ) : undefined
          }
        />

        <SocialConnectionsList />
      </div>
    </AppShell>
  );
}

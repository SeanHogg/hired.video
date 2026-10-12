import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Mail, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { useImpersonation } from "@/hooks/use-impersonation";
import { InvitationAnalytics } from "@/components/account/InvitationAnalytics";
import { AccountAnalytics as AccountAnalyticsPanel } from "@/components/account/AccountAnalytics";
import { accountService } from "@/lib/services/account-service";

export default function AccountAnalytics() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { canAccess } = useAdminPermissions();
  const { isImpersonating, targetUserLabel } = useImpersonation();
  const [activeTab, setActiveTab] = useState("invitations");

  if (!canAccess("accountAnalytics")) return null;

  // #785 — The endpoints behind these tabs resolve the active account
  // from the JWT, which on this SuperAdmin page means the SA's OWN
  // account — meaningless. Render the empty-state notice + an entry
  // point into the impersonation flow when SA isn't actively
  // impersonating a customer org. The actual data only renders when
  // we've crossed into impersonation, so the numbers are guaranteed
  // to reflect a real customer org.
  if (!isImpersonating) {
    return (
      <div className="rounded-lg border bg-amber-50/40 dark:bg-amber-950/20 border-amber-300/60 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <h2 className="text-base font-semibold">Impersonation required</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Account Analytics resolves data from the JWT-bound account. From a SuperAdmin session
              that means your own org, which isn't useful. Impersonate a customer org from the
              SuperAdmin → Users panel to view that org's invitation funnel + analytics here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleExportAnalytics = (format: "csv" | "pdf") => {
    toast({
      title: t("messages.exportStartedTitle"),
      description: t("messages.exportStartedDesc", { format: format.toUpperCase() }),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("headings.accountAnalytics")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("messages.accountAnalyticsDesc")}
        </p>
        {targetUserLabel && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
            Impersonating: <span className="font-medium">{targetUserLabel}</span> — figures below are for that account.
          </p>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
        <div className="w-full overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex sm:grid w-auto sm:w-full sm:grid-cols-2 gap-1 min-w-max sm:min-w-0">
            <TabsTrigger
              value="invitations"
              className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3"
            >
              <Mail className="h-4 w-4" />
              <span>{t("tabs.invitationAnalytics")}</span>
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3"
            >
              <BarChart3 className="h-4 w-4" />
              <span>{t("tabs.analytics")}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="invitations" className="space-y-6">
          <InvitationAnalytics />
        </TabsContent>

        <TabsContent value="analytics">
          <AccountAnalyticsPanel
            onExport={handleExportAnalytics}
            onLoadAnalytics={accountService.getAccountAnalytics}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

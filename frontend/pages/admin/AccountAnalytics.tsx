import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, Mail } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { InvitationAnalytics } from "@/components/account/InvitationAnalytics";
import { AccountAnalytics as AccountAnalyticsPanel } from "@/components/account/AccountAnalytics";
import { accountService } from "@/lib/services/account-service";

export default function AccountAnalytics() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { canAccess } = useAdminPermissions();
  const [activeTab, setActiveTab] = useState("invitations");

  if (!canAccess("accountAnalytics")) return null;

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

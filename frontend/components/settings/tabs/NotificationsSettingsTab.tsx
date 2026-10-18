import { useTranslation } from "react-i18next";
import { EmailPreferencesPanel } from "@/components/email/EmailPreferencesPanel";
import { PushDeviceToggle } from "@/components/settings/PushDeviceToggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type {
  NotificationChannel,
  NotificationToggles,
} from "@/components/settings/hooks/useAccountPreferences";
import { SettingsSwitchRow } from "./SettingsSwitchRow";

interface NotificationsSettingsTabProps {
  notifications: NotificationToggles;
  onChannelChange: (channel: NotificationChannel, checked: boolean) => void;
}

export function NotificationsSettingsTab({ notifications, onChannelChange }: NotificationsSettingsTabProps) {
  const { t } = useTranslation();
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("headings.notificationPreferences")}</CardTitle>
          <CardDescription>
            {t("messages.notificationPreferencesDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SettingsSwitchRow
            label={t("settings.notifications.emailLabel")}
            description={t("settings.notifications.emailDesc")}
            checked={notifications.email}
            onCheckedChange={(checked) => onChannelChange("email", checked)}
          />
          <Separator />
          <SettingsSwitchRow
            label={t("settings.notifications.pushLabel")}
            description={t("settings.notifications.pushDesc")}
            checked={notifications.push}
            onCheckedChange={(checked) => onChannelChange("push", checked)}
          />
          <PushDeviceToggle />
          {/* Granular marketing opt-out lives in its own card below
              (the authoritative email-keyed consent ledger the send
              path actually honors). The old coarse `marketing`
              toggle was superseded — see gap register. */}
          <Separator />
          <SettingsSwitchRow
            label={t("settings.notifications.weeklyLabel")}
            description={t("settings.notifications.weeklyDesc")}
            checked={notifications.weekly}
            onCheckedChange={(checked) => onChannelChange("weekly", checked)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("headings.marketingEmailPreferences")}</CardTitle>
          <CardDescription>
            {t("messages.marketingEmailPreferencesDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailPreferencesPanel />
        </CardContent>
      </Card>
    </>
  );
}

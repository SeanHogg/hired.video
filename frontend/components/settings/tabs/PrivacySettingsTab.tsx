import { useTranslation } from "react-i18next";
import PromoteWithoutAuthToggle from "@/components/settings/PromoteWithoutAuthToggle";
import ConfidentialModeToggle from "@/components/settings/ConfidentialModeToggle";
import ConnectedPlatformsCard from "@/components/settings/ConnectedPlatformsCard";
import PartnerAccessCard from "@/components/settings/PartnerAccessCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { PrivacySettings } from "@/lib/services/settings-service";
import type { LocalPrivacyFlag } from "@/components/settings/hooks/useAccountPreferences";
import { SettingsSwitchRow } from "./SettingsSwitchRow";

interface PrivacySettingsTabProps {
  privacy: PrivacySettings;
  savingPrivacy: boolean;
  onSavePatch: (patch: Partial<PrivacySettings>) => void;
  onLocalFlagChange: (flag: LocalPrivacyFlag, checked: boolean) => void;
}

export function PrivacySettingsTab({
  privacy,
  savingPrivacy,
  onSavePatch,
  onLocalFlagChange,
}: PrivacySettingsTabProps) {
  const { t } = useTranslation();
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("headings.privacySettings")}</CardTitle>
          <CardDescription>
            {t("messages.privacySettingsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SettingsSwitchRow
            label={t("settings.privacy.publicProfileLabel")}
            description={t("settings.privacy.publicProfileDesc")}
            checked={privacy.profileVisible}
            disabled={savingPrivacy}
            onCheckedChange={(checked) => onSavePatch({ profileVisible: checked })}
          />
          <Separator />
          <PromoteWithoutAuthToggle />
          <Separator />
          <ConfidentialModeToggle asCard={false} />
          <Separator />
          <SettingsSwitchRow
            label={t("settings.privacy.showEmailLabel")}
            description={t("settings.privacy.showEmailDesc")}
            checked={privacy.showEmail}
            disabled={savingPrivacy}
            onCheckedChange={(checked) => onLocalFlagChange("showEmail", checked)}
          />
          <Separator />
          <SettingsSwitchRow
            label={t("settings.privacy.showPhoneLabel")}
            description={t("settings.privacy.showPhoneDesc")}
            checked={privacy.showPhone}
            disabled={savingPrivacy}
            onCheckedChange={(checked) => onLocalFlagChange("showPhone", checked)}
          />
          <Separator />
          <SettingsSwitchRow
            label={t("settings.privacy.showLocationLabel")}
            description={t("settings.privacy.showLocationDesc")}
            checked={privacy.showLocation}
            disabled={savingPrivacy}
            onCheckedChange={(checked) => onLocalFlagChange("showLocation", checked)}
          />
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">
                {t("settings.privacy.indexableLabel")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.privacy.indexableDesc")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={privacy.indexable}
                disabled={savingPrivacy}
                onCheckedChange={(checked) => onSavePatch({ indexable: checked })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Third-party partner platforms the user has connected to
          their account — manage/revoke access here. */}
      <ConnectedPlatformsCard />

      {/* Self-service partner platform access — request access, then
          self-issue API keys once approved. */}
      <PartnerAccessCard />
    </>
  );
}

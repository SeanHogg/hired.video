import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NATIVE_LABELS } from "@/lib/i18n/locale-labels";
import type { Locale } from "@shared/i18n";
import type { AccountSettings } from "@/lib/services/settings-service";
import type { ThemeChoice } from "@/lib/theme/use-theme-preference";
import { TIMEZONE_OPTIONS } from "@/components/settings/settings-tabs";

interface AppearanceSettingsTabProps {
  currentTheme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  appearance: AccountSettings;
  availableLocales: readonly Locale[];
  onLanguageChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
}

export function AppearanceSettingsTab({
  currentTheme,
  onThemeChange,
  appearance,
  availableLocales,
  onLanguageChange,
  onTimezoneChange,
}: AppearanceSettingsTabProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("headings.appearanceSettings")}</CardTitle>
        <CardDescription>
          {t("messages.appearanceSettingsDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("settings.appearance.themeLabel")}</Label>
          <Select value={currentTheme} onValueChange={(value) => onThemeChange(value as ThemeChoice)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t("settings.appearance.themeOption.light")}</SelectItem>
              <SelectItem value="dark">{t("settings.appearance.themeOption.dark")}</SelectItem>
              <SelectItem value="system">{t("settings.appearance.themeOption.system")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("settings.appearance.languageLabel")}</Label>
          <Select value={appearance.language} onValueChange={onLanguageChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableLocales.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {/* Native-script name (Español, Français…) — the
                      universal picker convention, shared with
                      LocaleSwitcher via NATIVE_LABELS (DRY). */}
                  {NATIVE_LABELS[loc]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("settings.appearance.timezoneLabel")}</Label>
          <Select value={appearance.timezone} onValueChange={onTimezoneChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            {/* IANA timezone names — see TIMEZONE_OPTIONS. */}
            <SelectContent>
              {TIMEZONE_OPTIONS.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>{t(tz.labelKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

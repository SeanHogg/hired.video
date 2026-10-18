import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { UseCookiePreferencesApi } from "@/hooks/use-cookie-preferences";
import { SettingsSwitchRow } from "./SettingsSwitchRow";

const OPTIONAL_COOKIE_CATEGORIES = ["analytics", "marketing", "personalization"] as const;

interface CookiesSettingsTabProps {
  cookiePrefs: UseCookiePreferencesApi;
}

export function CookiesSettingsTab({ cookiePrefs }: CookiesSettingsTabProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("headings.cookiePreferences")}</CardTitle>
        <CardDescription>
          <Trans
            i18nKey="messages.cookiePreferencesDesc"
            components={{
              link: <Link to="/cookies" className="text-primary hover:underline" />,
            }}
          />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-sm font-medium flex items-center gap-2">
              {t("settings.cookies.essentialLabel")}
              <Badge variant="secondary" className="text-xs">
                {t("labels.required")}
              </Badge>
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("settings.cookies.essentialDesc")}
            </p>
          </div>
          <Switch checked disabled />
        </div>
        {OPTIONAL_COOKIE_CATEGORIES.map((category) => (
          <Fragment key={category}>
            <Separator />
            <SettingsSwitchRow
              label={t(`settings.cookies.${category}Label`)}
              description={t(`settings.cookies.${category}Desc`)}
              checked={cookiePrefs.preferences[category]}
              disabled={cookiePrefs.loading}
              onCheckedChange={(checked) =>
                void cookiePrefs.setCategory(category, checked)
              }
            />
          </Fragment>
        ))}
        <Separator />
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => void cookiePrefs.acceptAll()}
            disabled={cookiePrefs.loading}
            className="flex-1"
          >
            {t("actions.acceptAll")}
          </Button>
          <Button
            onClick={() => void cookiePrefs.rejectOptional()}
            disabled={cookiePrefs.loading}
            variant="outline"
            className="flex-1"
          >
            {t("actions.rejectOptional")}
          </Button>
        </div>
        {cookiePrefs.preferences.consentedAt && (
          <p className="text-xs text-muted-foreground">
            {t("messages.lastUpdatedAt", { date: new Date(cookiePrefs.preferences.consentedAt).toLocaleString() })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

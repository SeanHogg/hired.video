import {
  Cookie,
  Shield,
  Settings,
  BarChart3,
  Target,
  Users,
  Globe,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useCookiePreferences } from "@/hooks/use-cookie-preferences";
import { useAuth } from "@/lib/auth";

export default function CookiePolicy() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const {
    preferences: cookiePreferences,
    loading: cookieLoading,
    setCategory,
    acceptAll,
    rejectOptional,
  } = useCookiePreferences();

  // Cookie type rows. `key` is the persistence key on the backend;
  // typeKey/descriptionKey/exampleKeys are the i18n keys so the panel
  // renders in whatever locale the user has selected.
  const cookieTypes = [
    {
      key: "essential" as const,
      icon: Shield,
      required: true,
      typeKey: "legal.cookies.types.essential.type",
      descriptionKey: "legal.cookies.types.essential.description",
      exampleKeys: [
        "legal.cookies.types.essential.example.authentication",
        "legal.cookies.types.essential.example.security",
        "legal.cookies.types.essential.example.loadBalancing",
        "legal.cookies.types.essential.example.formSubmissions",
      ],
      color: "green",
    },
    {
      key: "analytics" as const,
      icon: BarChart3,
      required: false,
      typeKey: "legal.cookies.types.analytics.type",
      descriptionKey: "legal.cookies.types.analytics.description",
      exampleKeys: [
        "legal.cookies.types.analytics.example.pageViews",
        "legal.cookies.types.analytics.example.clickTracking",
        "legal.cookies.types.analytics.example.performanceMonitoring",
        "legal.cookies.types.analytics.example.errorReporting",
      ],
      color: "blue",
    },
    {
      key: "marketing" as const,
      icon: Target,
      required: false,
      typeKey: "legal.cookies.types.marketing.type",
      descriptionKey: "legal.cookies.types.marketing.description",
      exampleKeys: [
        "legal.cookies.types.marketing.example.adTargeting",
        "legal.cookies.types.marketing.example.conversionTracking",
        "legal.cookies.types.marketing.example.socialMedia",
        "legal.cookies.types.marketing.example.retargeting",
      ],
      color: "purple",
    },
    {
      key: "personalization" as const,
      icon: Users,
      required: false,
      typeKey: "legal.cookies.types.personalization.type",
      descriptionKey: "legal.cookies.types.personalization.description",
      exampleKeys: [
        "legal.cookies.types.personalization.example.languageSettings",
        "legal.cookies.types.personalization.example.themePreferences",
        "legal.cookies.types.personalization.example.recentlyViewed",
        "legal.cookies.types.personalization.example.savedSearches",
      ],
      color: "orange",
    },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-6">
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex items-center space-x-2 mb-4">
                <Cookie className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  {t("legal.cookies.brand")}
                </span>
              </div>
              <h1 className="text-4xl font-bold mb-4">{t("legal.cookies.headline")}</h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                {t("legal.cookies.intro")}
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                {t("legal.cookies.lastUpdated")}
              </p>
            </div>

            {/* Cookie Preferences Panel */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  {t("legal.cookies.preferences.title")}
                </CardTitle>
                <CardDescription>
                  {t("legal.cookies.preferences.descriptionShared")}{" "}
                  {isAuthenticated
                    ? t("legal.cookies.preferences.descriptionAuth")
                    : t("legal.cookies.preferences.descriptionAnon")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {cookieTypes.map((cookie) => {
                  const isEnabled = cookiePreferences[cookie.key];
                  const examplesLabel = cookie.exampleKeys.map((k) => t(k)).join(", ");

                  return (
                    <div
                      key={cookie.key}
                      className="flex items-start justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            cookie.color === "green"
                              ? "bg-green-100 dark:bg-green-900"
                              : cookie.color === "blue"
                                ? "bg-blue-100 dark:bg-blue-900"
                                : cookie.color === "purple"
                                  ? "bg-purple-100 dark:bg-purple-900"
                                  : "bg-orange-100 dark:bg-orange-900"
                          }`}
                        >
                          <cookie.icon
                            className={`h-5 w-5 ${
                              cookie.color === "green"
                                ? "text-green-600 dark:text-green-400"
                                : cookie.color === "blue"
                                  ? "text-blue-600 dark:text-blue-400"
                                  : cookie.color === "purple"
                                    ? "text-purple-600 dark:text-purple-400"
                                    : "text-orange-600 dark:text-orange-400"
                            }`}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium">{t(cookie.typeKey)}</h4>
                            {cookie.required && (
                              <Badge variant="secondary" className="text-xs">
                                {t("legal.cookies.preferences.required")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {t(cookie.descriptionKey)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("legal.cookies.preferences.examplesPrefix")} {examplesLabel}
                          </p>
                        </div>
                      </div>
                      <div className="ml-4">
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => {
                            if (cookie.key === "essential") return;
                            void setCategory(cookie.key, checked);
                          }}
                          disabled={cookie.required || cookieLoading}
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="flex gap-3 pt-4">
                  <Button onClick={() => void acceptAll()} className="flex-1">
                    {t("legal.cookies.preferences.acceptAll")}
                  </Button>
                  <Button
                    onClick={() => void rejectOptional()}
                    variant="outline"
                    className="flex-1"
                  >
                    {t("legal.cookies.preferences.rejectOptional")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* What Are Cookies */}
            <Card>
              <CardHeader>
                <CardTitle>{t("legal.cookies.whatAre.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">{t("legal.cookies.whatAre.body")}</p>

                <div className="grid md:grid-cols-2 gap-4 mt-6">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      {t("legal.cookies.whatAre.firstParty.title")}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t("legal.cookies.whatAre.firstParty.body")}
                    </p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-600" />
                      {t("legal.cookies.whatAre.thirdParty.title")}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t("legal.cookies.whatAre.thirdParty.body")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* How We Use Cookies */}
            <Card>
              <CardHeader>
                <CardTitle>{t("legal.cookies.howUsed.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-medium mb-3">{t("legal.cookies.howUsed.essential.title")}</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>{t("legal.cookies.howUsed.essential.item1")}</li>
                    <li>{t("legal.cookies.howUsed.essential.item2")}</li>
                    <li>{t("legal.cookies.howUsed.essential.item3")}</li>
                    <li>{t("legal.cookies.howUsed.essential.item4")}</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-3">{t("legal.cookies.howUsed.analytics.title")}</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>{t("legal.cookies.howUsed.analytics.item1")}</li>
                    <li>{t("legal.cookies.howUsed.analytics.item2")}</li>
                    <li>{t("legal.cookies.howUsed.analytics.item3")}</li>
                    <li>{t("legal.cookies.howUsed.analytics.item4")}</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-3">{t("legal.cookies.howUsed.personalization.title")}</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>{t("legal.cookies.howUsed.personalization.item1")}</li>
                    <li>{t("legal.cookies.howUsed.personalization.item2")}</li>
                    <li>{t("legal.cookies.howUsed.personalization.item3")}</li>
                    <li>{t("legal.cookies.howUsed.personalization.item4")}</li>
                  </ul>
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-3">{t("legal.cookies.howUsed.marketing.title")}</h4>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>{t("legal.cookies.howUsed.marketing.item1")}</li>
                    <li>{t("legal.cookies.howUsed.marketing.item2")}</li>
                    <li>{t("legal.cookies.howUsed.marketing.item3")}</li>
                    <li>{t("legal.cookies.howUsed.marketing.item4")}</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Cookie Retention */}
            <Card>
              <CardHeader>
                <CardTitle>{t("legal.cookies.retention.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2">{t("legal.cookies.retention.session.title")}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t("legal.cookies.retention.session.body")}
                    </p>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2">{t("legal.cookies.retention.persistent.title")}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t("legal.cookies.retention.persistent.body")}
                    </p>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                    {t("legal.cookies.retention.cleanup.title")}
                  </h4>
                  <p className="text-blue-700 dark:text-blue-300 text-sm">
                    {t("legal.cookies.retention.cleanup.body")}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Managing Cookies */}
            <Card>
              <CardHeader>
                <CardTitle>{t("legal.cookies.managing.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-3">{t("legal.cookies.managing.browser.title")}</h4>
                  <p className="text-muted-foreground mb-3">
                    {t("legal.cookies.managing.browser.body")}
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                    <li>{t("legal.cookies.managing.browser.chrome")}</li>
                    <li>{t("legal.cookies.managing.browser.firefox")}</li>
                    <li>{t("legal.cookies.managing.browser.safari")}</li>
                    <li>{t("legal.cookies.managing.browser.edge")}</li>
                  </ul>
                </div>

                <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                        {t("legal.cookies.managing.impact.title")}
                      </h4>
                      <p className="text-amber-700 dark:text-amber-300 text-sm">
                        {t("legal.cookies.managing.impact.body")}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Third-Party Services */}
            <Card>
              <CardHeader>
                <CardTitle>{t("legal.cookies.thirdParty.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  {t("legal.cookies.thirdParty.intro")}
                </p>

                <div className="grid gap-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">{t("legal.cookies.thirdParty.googleAnalytics.title")}</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      {t("legal.cookies.thirdParty.googleAnalytics.description")}
                    </p>
                    <a
                      href="https://policies.google.com/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-sm hover:underline"
                    >
                      {t("legal.cookies.thirdParty.googleAnalytics.link")} →
                    </a>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">{t("legal.cookies.thirdParty.linkedinAds.title")}</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      {t("legal.cookies.thirdParty.linkedinAds.description")}
                    </p>
                    <a
                      href="https://www.linkedin.com/legal/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-sm hover:underline"
                    >
                      {t("legal.cookies.thirdParty.linkedinAds.link")} →
                    </a>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-1">{t("legal.cookies.thirdParty.intercom.title")}</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      {t("legal.cookies.thirdParty.intercom.description")}
                    </p>
                    <a
                      href="https://www.intercom.com/legal/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-sm hover:underline"
                    >
                      {t("legal.cookies.thirdParty.intercom.link")} →
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact */}
            <Card>
              <CardHeader>
                <CardTitle>{t("legal.cookies.contact.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  {t("legal.cookies.contact.body")}
                </p>

                <div className="space-y-2">
                  <p className="text-sm">
                    {t("legal.cookies.contact.emailLabel")}{" "}
                    <a
                      href="mailto:privacy@hired.video"
                      className="text-primary hover:underline"
                    >
                      privacy@hired.video
                    </a>
                  </p>
                  <p className="text-sm">{t("legal.cookies.contact.subjectLine")}</p>
                </div>

                <div className="mt-6 p-4 bg-muted/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {t("legal.cookies.contact.reviewNote")}
                  </p>
                </div>
              </CardContent>
            </Card>
        </div>
      </div>
    </AppShell>
  );
}

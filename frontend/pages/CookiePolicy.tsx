import { usePageChrome } from "@/lib/seo";
import {
  Shield,
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
  LegalPage,
  LegalSection,
  LegalSectionContent,
  LegalSectionDescription,
  LegalSectionHeader,
  LegalSectionTitle,
} from "@/components/legal/LegalDocument";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useCookiePreferences } from "@/hooks/use-cookie-preferences";
import { useAuth } from "@/lib/auth";

export default function CookiePolicy() {
  usePageChrome();
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
    },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <LegalPage
        title={t("legal.cookies.headline")}
        meta={t("legal.cookies.lastUpdated")}
        intro={t("legal.cookies.intro")}
      >
            {/* Cookie Preferences Panel */}
            <LegalSection id="preferences">
              <LegalSectionHeader>
                <LegalSectionTitle>
                  {t("legal.cookies.preferences.title")}
                </LegalSectionTitle>
                <LegalSectionDescription>
                  {t("legal.cookies.preferences.descriptionShared")}{" "}
                  {isAuthenticated
                    ? t("legal.cookies.preferences.descriptionAuth")
                    : t("legal.cookies.preferences.descriptionAnon")}
                </LegalSectionDescription>
              </LegalSectionHeader>
              <LegalSectionContent className="space-y-6">
                {cookieTypes.map((cookie) => {
                  const isEnabled = cookiePreferences[cookie.key];
                  const examplesLabel = cookie.exampleKeys.map((k) => t(k)).join(", ");

                  return (
                    <div
                      key={cookie.key}
                      className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4"
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                          <cookie.icon className="h-5 w-5" aria-hidden="true" />
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
                      <div className="shrink-0">
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

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button onClick={() => void acceptAll()} className="min-h-[44px] flex-1">
                    {t("legal.cookies.preferences.acceptAll")}
                  </Button>
                  <Button
                    onClick={() => void rejectOptional()}
                    variant="outline"
                    className="min-h-[44px] flex-1"
                  >
                    {t("legal.cookies.preferences.rejectOptional")}
                  </Button>
                </div>
              </LegalSectionContent>
            </LegalSection>

            {/* What Are Cookies */}
            <LegalSection>
              <LegalSectionHeader>
                <LegalSectionTitle>{t("legal.cookies.whatAre.title")}</LegalSectionTitle>
              </LegalSectionHeader>
              <LegalSectionContent className="space-y-4">
                <p className="text-muted-foreground">{t("legal.cookies.whatAre.body")}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div className="rounded-xl border border-border p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-brand-green-text" />
                      {t("legal.cookies.whatAre.firstParty.title")}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t("legal.cookies.whatAre.firstParty.body")}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      {t("legal.cookies.whatAre.thirdParty.title")}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {t("legal.cookies.whatAre.thirdParty.body")}
                    </p>
                  </div>
                </div>
              </LegalSectionContent>
            </LegalSection>

            {/* How We Use Cookies */}
            <LegalSection>
              <LegalSectionHeader>
                <LegalSectionTitle>{t("legal.cookies.howUsed.title")}</LegalSectionTitle>
              </LegalSectionHeader>
              <LegalSectionContent className="space-y-6">
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
              </LegalSectionContent>
            </LegalSection>

            {/* Cookie Retention */}
            <LegalSection>
              <LegalSectionHeader>
                <LegalSectionTitle>{t("legal.cookies.retention.title")}</LegalSectionTitle>
              </LegalSectionHeader>
              <LegalSectionContent>
                <div className="space-y-4">
                  <div className="rounded-xl border border-border p-4">
                    <h4 className="font-medium mb-2">{t("legal.cookies.retention.session.title")}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t("legal.cookies.retention.session.body")}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <h4 className="font-medium mb-2">{t("legal.cookies.retention.persistent.title")}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t("legal.cookies.retention.persistent.body")}
                    </p>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-accent rounded-xl">
                  <h4 className="font-medium text-accent-foreground mb-2">
                    {t("legal.cookies.retention.cleanup.title")}
                  </h4>
                  <p className="text-primary text-sm">
                    {t("legal.cookies.retention.cleanup.body")}
                  </p>
                </div>
              </LegalSectionContent>
            </LegalSection>

            {/* Managing Cookies */}
            <LegalSection>
              <LegalSectionHeader>
                <LegalSectionTitle>{t("legal.cookies.managing.title")}</LegalSectionTitle>
              </LegalSectionHeader>
              <LegalSectionContent className="space-y-4">
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

                <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-xl">
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
              </LegalSectionContent>
            </LegalSection>

            {/* Third-Party Services */}
            <LegalSection>
              <LegalSectionHeader>
                <LegalSectionTitle>{t("legal.cookies.thirdParty.title")}</LegalSectionTitle>
              </LegalSectionHeader>
              <LegalSectionContent>
                <p className="text-muted-foreground mb-4">
                  {t("legal.cookies.thirdParty.intro")}
                </p>

                <div className="grid gap-4">
                  <div className="rounded-xl border border-border p-4">
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

                  <div className="rounded-xl border border-border p-4">
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

                  <div className="rounded-xl border border-border p-4">
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
              </LegalSectionContent>
            </LegalSection>

            {/* Contact */}
            <LegalSection>
              <LegalSectionHeader>
                <LegalSectionTitle>{t("legal.cookies.contact.title")}</LegalSectionTitle>
              </LegalSectionHeader>
              <LegalSectionContent>
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

                <div className="mt-6 p-4 bg-muted rounded-xl">
                  <p className="text-sm text-muted-foreground">
                    {t("legal.cookies.contact.reviewNote")}
                  </p>
                </div>
              </LegalSectionContent>
            </LegalSection>
      </LegalPage>
    </AppShell>
  );
}

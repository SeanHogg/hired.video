import {
  Shield,
  Eye,
  Lock,
  Server,
  Users,
  Mail,
  FileText,
  AlertTriangle,
  Globe,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { JurisdictionSelector } from "@/components/legal/JurisdictionSelector";
import {
  USCaliforniaRightsSection,
  PIPEDARightsSection,
  QuebecLaw25Section,
  MexicoARCOSection,
  GDPRRightsSection,
} from "@/components/legal/RegionalPrivacySections";

export default function PrivacyPolicy() {
  const location = useLocation();
  const { t } = useTranslation();

  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("legal.privacy.brand"), url: "/privacy-policy" }]);

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-6">
        <div className="max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex items-center space-x-2 mb-4">
                <Shield className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                  {t("legal.privacy.brand")}
                </span>
              </div>
              <h1 className="text-4xl font-bold mb-4">{t("legal.privacy.headline")}</h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                {t("legal.privacy.intro")}
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                {t("legal.privacy.lastUpdated")}
              </p>
              <div className="mt-6 flex justify-center">
                <JurisdictionSelector />
              </div>
            </div>

            {/* Quick Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  {t("legal.privacy.overview.title")}
                </CardTitle>
                <CardDescription>
                  {t("legal.privacy.overview.subtitle")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Lock className="h-5 w-5 text-green-600 mt-1" />
                    <div>
                      <h4 className="font-medium">{t("legal.privacy.overview.secure.title")}</h4>
                      <p className="text-sm text-muted-foreground">
                        {t("legal.privacy.overview.secure.body")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-blue-600 mt-1" />
                    <div>
                      <h4 className="font-medium">{t("legal.privacy.overview.control.title")}</h4>
                      <p className="text-sm text-muted-foreground">
                        {t("legal.privacy.overview.control.body")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Server className="h-5 w-5 text-purple-600 mt-1" />
                    <div>
                      <h4 className="font-medium">{t("legal.privacy.overview.minimal.title")}</h4>
                      <p className="text-sm text-muted-foreground">
                        {t("legal.privacy.overview.minimal.body")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-orange-600 mt-1" />
                    <div>
                      <h4 className="font-medium">{t("legal.privacy.overview.noSell.title")}</h4>
                      <p className="text-sm text-muted-foreground">
                        {t("legal.privacy.overview.noSell.body")}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  {t("legal.privacy.contact.title")}
                </CardTitle>
                <CardDescription>{t("legal.privacy.contact.subtitle")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">{t("legal.privacy.contact.intro")}</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">{t("legal.privacy.contact.company.title")}</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>
                        <strong>{t("legal.privacy.contact.company.tradeName")}</strong> hired.video
                      </li>
                      <li>
                        <strong>{t("legal.privacy.contact.company.controller")}</strong> Fix Faster LLC (c/o HireFractionalTalent.com)
                      </li>
                      <li>
                        <strong>{t("legal.privacy.contact.company.address")}</strong> Troy, MI
                      </li>
                      <li>
                        <strong>{t("legal.privacy.contact.company.phone")}</strong> 2488250176
                      </li>
                      <li>
                        <strong>{t("legal.privacy.contact.company.email")}</strong> info@hired.video
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">{t("legal.privacy.contact.dpo.title")}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t("legal.privacy.contact.dpo.body1")}{" "}
                      <a
                        href="mailto:privacy@hired.video"
                        className="underline hover:text-foreground"
                      >
                        privacy@hired.video
                      </a>
                      . {t("legal.privacy.contact.dpo.californiaPrefix")}{" "}
                      <a
                        href="/privacy/opt-out"
                        className="underline hover:text-foreground"
                      >
                        {t("legal.privacy.contact.dpo.doNotSellLabel")}
                      </a>
                      . {t("legal.privacy.contact.dpo.canadaBody")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Regulatory Compliance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t("legal.privacy.regulatory.title")}
                </CardTitle>
                <CardDescription>{t("legal.privacy.regulatory.subtitle")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">{t("legal.privacy.regulatory.intro")}</p>
                <div className="grid md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <ul className="space-y-1">
                    <li>• Regulation (EU) 2016/679 (GDPR)</li>
                    <li>• California Privacy Rights Act 2023 (CPRA)</li>
                    <li>• Virginia Consumer Data Protection Act (VCDPA)</li>
                    <li>• Colorado Privacy Act (CPA)</li>
                    <li>• Connecticut Data Privacy Act (CTDPA)</li>
                    <li>• Canada's Anti-Spam Legislation (CASL) & PIPEDA</li>
                    <li>• Mexican Federal Law on Protection of Personal Data (LFPDPPP)</li>
                    <li>• Utah Consumer Privacy Act (UCPA)</li>
                    <li>• Tennessee Information Privacy Protection Act (TIPA)</li>
                  </ul>
                  <ul className="space-y-1">
                    <li>• Texas Data Privacy and Security Act (TDPSA)</li>
                    <li>• Indiana Consumer Data Privacy Act (INCDPA)</li>
                    <li>• Iowa Consumer Data Privacy Act (ICDPA)</li>
                    <li>• Montana Consumer Data Privacy Act (MTCDPA)</li>
                    <li>• Delaware Personal Data Protection Act (DPDPA)</li>
                    <li>• Kentucky Consumer Data Privacy Act (KCDPA)</li>
                    <li>• New Jersey Data Protection Act (NJDPA)</li>
                    <li>• Oregon Consumer Privacy Act (OCPA)</li>
                    <li>• New Hampshire Privacy Act (NHPA)</li>
                    <li>• Nebraska Data Privacy Act (NDPA)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Region-specific rights — self-gating via useUserJurisdiction. */}
            <USCaliforniaRightsSection />
            <PIPEDARightsSection />
            <QuebecLaw25Section />
            <MexicoARCOSection />
            <GDPRRightsSection />

            {/* Detailed Sections */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s1.title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground mb-4">{t("legal.privacy.s1.intro")}</p>

                  <div>
                    <h4 className="font-medium mb-2">{t("legal.privacy.s1.collect.title")}</h4>
                    <p className="text-muted-foreground mb-2">{t("legal.privacy.s1.collect.lead")}</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>{t("legal.privacy.s1.collect.forms")}</li>
                      <li>{t("legal.privacy.s1.collect.newsletter")}</li>
                      <li>{t("legal.privacy.s1.collect.poll")}</li>
                      <li>{t("legal.privacy.s1.collect.printed")}</li>
                      <li>{t("legal.privacy.s1.collect.emailOrPhone")}</li>
                    </ul>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2">{t("legal.privacy.s1.personal.title")}</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>{t("legal.privacy.s1.personal.nameEmail")}</li>
                      <li>{t("legal.privacy.s1.personal.phoneAddress")}</li>
                      <li>{t("legal.privacy.s1.personal.geolocation")}</li>
                      <li>{t("legal.privacy.s1.personal.professional")}</li>
                      <li>{t("legal.privacy.s1.personal.photo")}</li>
                      <li>{t("legal.privacy.s1.personal.contact")}</li>
                    </ul>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2">{t("legal.privacy.s1.usage.title")}</h4>
                    <p className="text-muted-foreground mb-2">{t("legal.privacy.s1.usage.lead")}</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>{t("legal.privacy.s1.usage.howUsed")}</li>
                      <li>{t("legal.privacy.s1.usage.device")}</li>
                      <li>{t("legal.privacy.s1.usage.log")}</li>
                      <li>{t("legal.privacy.s1.usage.cookies")}</li>
                    </ul>
                  </div>

                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <p className="text-amber-700 dark:text-amber-300 text-sm">
                      <strong>{t("legal.privacy.s1.accuracy.label")}</strong>{" "}
                      {t("legal.privacy.s1.accuracy.body")}
                    </p>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2">{t("legal.privacy.s1.roles.title")}</h4>
                    <p className="text-muted-foreground mb-2">{t("legal.privacy.s1.roles.lead")}</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>{t("legal.privacy.s1.roles.jobSeekers")}</li>
                      <li>{t("legal.privacy.s1.roles.employers")}</li>
                      <li>{t("legal.privacy.s1.roles.recruiters")}</li>
                      <li>{t("legal.privacy.s1.roles.affiliates")}</li>
                    </ul>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                      {t("legal.privacy.s1.affiliate.title")}
                    </h4>
                    <ul className="list-disc list-inside text-blue-700 dark:text-blue-300 text-sm space-y-1 ml-4">
                      <li>{t("legal.privacy.s1.affiliate.attribution")}</li>
                      <li>{t("legal.privacy.s1.affiliate.payout")}</li>
                      <li>{t("legal.privacy.s1.affiliate.compliance")}</li>
                      <li>{t("legal.privacy.s1.affiliate.retention")}</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s2.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s2.provide.title")}</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s2.provide.account")}</li>
                        <li>{t("legal.privacy.s2.provide.resumes")}</li>
                        <li>{t("legal.privacy.s2.provide.match")}</li>
                        <li>{t("legal.privacy.s2.provide.communication")}</li>
                        <li>{t("legal.privacy.s2.provide.fulfill")}</li>
                        <li>{t("legal.privacy.s2.provide.support")}</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s2.auth.title")}</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s2.auth.verify")}</li>
                        <li>{t("legal.privacy.s2.auth.access")}</li>
                        <li>{t("legal.privacy.s2.auth.security")}</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s2.personalization.title")}</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s2.personalization.tailor")}</li>
                        <li>{t("legal.privacy.s2.personalization.location")}</li>
                        <li>{t("legal.privacy.s2.personalization.deliver")}</li>
                        <li>{t("legal.privacy.s2.personalization.identify")}</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s2.marketing.title")}</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s2.marketing.news")}</li>
                        <li>{t("legal.privacy.s2.marketing.features")}</li>
                        <li>{t("legal.privacy.s2.marketing.ads")}</li>
                        <li>{t("legal.privacy.s2.marketing.sell")}</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s2.research.title")}</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s2.research.surveys")}</li>
                        <li>{t("legal.privacy.s2.research.needs")}</li>
                        <li>{t("legal.privacy.s2.research.effectiveness")}</li>
                        <li>{t("legal.privacy.s2.research.usage")}</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s2.legal.title")}</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s2.legal.comply")}</li>
                        <li>{t("legal.privacy.s2.legal.defend")}</li>
                        <li>{t("legal.privacy.s2.legal.investigate")}</li>
                        <li>{t("legal.privacy.s2.legal.safety")}</li>
                        <li>{t("legal.privacy.s2.legal.enforce")}</li>
                      </ul>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        <strong>{t("legal.privacy.s2.retention.label")}</strong>{" "}
                        {t("legal.privacy.s2.retention.body")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s3.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                      <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">
                        {t("legal.privacy.s3.noSell.title")}
                      </h4>
                      <p className="text-green-700 dark:text-green-300 text-sm">
                        {t("legal.privacy.s3.noSell.body")}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s3.when.title")}</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s3.when.consent")}</li>
                        <li>{t("legal.privacy.s3.when.providers")}</li>
                        <li>{t("legal.privacy.s3.when.legal")}</li>
                        <li>{t("legal.privacy.s3.when.business")}</li>
                        <li>{t("legal.privacy.s3.when.parent")}</li>
                        <li>{t("legal.privacy.s3.when.internal")}</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s3.thirdParty.title")}</h4>
                      <div className="space-y-3">
                        <div className="border rounded-lg p-3">
                          <h5 className="font-medium text-sm">YouTube</h5>
                          <p className="text-xs text-muted-foreground">
                            {t("legal.privacy.s3.thirdParty.youtubeBody")}
                            <a
                              href="https://policies.google.com/privacy"
                              className="text-primary hover:underline ml-1"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {t("legal.privacy.s3.thirdParty.youtubeLink")}
                            </a>
                          </p>
                        </div>
                        <div className="border rounded-lg p-3">
                          <h5 className="font-medium text-sm">LinkedIn</h5>
                          <p className="text-xs text-muted-foreground">
                            {t("legal.privacy.s3.thirdParty.linkedinBody")}
                            <a
                              href="https://www.linkedin.com/legal/privacy-policy"
                              className="text-primary hover:underline ml-1"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {t("legal.privacy.s3.thirdParty.linkedinLink")}
                            </a>
                          </p>
                        </div>
                        <div className="border rounded-lg p-3">
                          <h5 className="font-medium text-sm">{t("legal.privacy.s3.thirdParty.googleAnalytics")}</h5>
                          <p className="text-xs text-muted-foreground">
                            {t("legal.privacy.s3.thirdParty.googleAnalyticsBody")}
                            <a
                              href="https://policies.google.com/privacy"
                              className="text-primary hover:underline ml-1"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {t("legal.privacy.s3.thirdParty.googleAnalyticsLink")}
                            </a>
                          </p>
                        </div>
                        <div className="border rounded-lg p-3">
                          <h5 className="font-medium text-sm">{t("legal.privacy.s3.thirdParty.social")}</h5>
                          <p className="text-xs text-muted-foreground">
                            {t("legal.privacy.s3.thirdParty.socialBody")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s3.additional.title")}</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s3.additional.transfer")}</li>
                        <li>{t("legal.privacy.s3.additional.compliance")}</li>
                        <li>{t("legal.privacy.s3.additional.protection")}</li>
                        <li>{t("legal.privacy.s3.additional.publicSafety")}</li>
                        <li>{t("legal.privacy.s3.additional.aggregate")}</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s4.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                        {t("legal.privacy.s4.consent.title")}
                      </h4>
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        {t("legal.privacy.s4.consent.body")}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s4.basis.title")}</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s4.basis.contract")}</li>
                        <li>{t("legal.privacy.s4.basis.consent")}</li>
                        <li>{t("legal.privacy.s4.basis.legitimate")}</li>
                        <li>{t("legal.privacy.s4.basis.legal")}</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s4.withdraw.title")}</h4>
                      <p className="text-muted-foreground mb-2">
                        {t("legal.privacy.s4.withdraw.lead")}
                      </p>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s4.withdraw.email")}</li>
                        <li>{t("legal.privacy.s4.withdraw.unsubscribe")}</li>
                        <li>{t("legal.privacy.s4.withdraw.contact")}</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s5.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">{t("legal.privacy.s5.intro")}</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                      <li>{t("legal.privacy.s5.measures.encryption")}</li>
                      <li>{t("legal.privacy.s5.measures.audits")}</li>
                      <li>{t("legal.privacy.s5.measures.access")}</li>
                      <li>{t("legal.privacy.s5.measures.hosting")}</li>
                      <li>{t("legal.privacy.s5.measures.training")}</li>
                      <li>{t("legal.privacy.s5.measures.dpa")}</li>
                    </ul>

                    <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                            {t("legal.privacy.s5.warning.title")}
                          </h4>
                          <div className="text-amber-700 dark:text-amber-300 text-sm space-y-2">
                            <p>{t("legal.privacy.s5.warning.body1")}</p>
                            <p>
                              <strong>{t("legal.privacy.s5.warning.precautionsLabel")}</strong>{" "}
                              {t("legal.privacy.s5.warning.precautionsBody")}
                            </p>
                            <p>
                              <strong>{t("legal.privacy.s5.warning.incidentLabel")}</strong>{" "}
                              {t("legal.privacy.s5.warning.incidentBody")}
                            </p>
                            <p>
                              <strong>{t("legal.privacy.s5.warning.limitsLabel")}</strong>{" "}
                              {t("legal.privacy.s5.warning.limitsBody")}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s6.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">{t("legal.privacy.s6.intro")}</p>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s6.periods.title")}</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s6.periods.active")}</li>
                        <li>{t("legal.privacy.s6.periods.inactive")}</li>
                        <li>{t("legal.privacy.s6.periods.legal")}</li>
                        <li>{t("legal.privacy.s6.periods.origin")}</li>
                      </ul>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        <strong>{t("legal.privacy.s6.noteLabel")}</strong>{" "}
                        {t("legal.privacy.s6.noteBody")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s7.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">{t("legal.privacy.s7.intro")}</p>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s7.howTo.title")}</h4>
                      <p className="text-muted-foreground text-sm mb-2">{t("legal.privacy.s7.howTo.body")}</p>
                    </div>

                    <div className="grid gap-4">
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">{t("legal.privacy.s7.access.title")}</h4>
                        <p className="text-muted-foreground text-sm">{t("legal.privacy.s7.access.body")}</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">{t("legal.privacy.s7.rectify.title")}</h4>
                        <p className="text-muted-foreground text-sm">{t("legal.privacy.s7.rectify.body")}</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">{t("legal.privacy.s7.delete.title")}</h4>
                        <p className="text-muted-foreground text-sm">{t("legal.privacy.s7.delete.body")}</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">{t("legal.privacy.s7.withdraw.title")}</h4>
                        <p className="text-muted-foreground text-sm">{t("legal.privacy.s7.withdraw.body")}</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">{t("legal.privacy.s7.object.title")}</h4>
                        <p className="text-muted-foreground text-sm">{t("legal.privacy.s7.object.body")}</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">{t("legal.privacy.s7.restrict.title")}</h4>
                        <p className="text-muted-foreground text-sm">{t("legal.privacy.s7.restrict.body")}</p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">{t("legal.privacy.s7.complaint.title")}</h4>
                        <p className="text-muted-foreground text-sm">{t("legal.privacy.s7.complaint.body")}</p>
                      </div>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        <strong>{t("legal.privacy.s7.eeaLabel")}</strong>{" "}
                        {t("legal.privacy.s7.eeaBody")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s8.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">{t("legal.privacy.s8.intro")}</p>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s8.marketing.title")}</h4>
                      <p className="text-muted-foreground text-sm mb-2">{t("legal.privacy.s8.marketing.body")}</p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s8.rights.title")}</h4>
                      <p className="text-muted-foreground text-sm mb-2">{t("legal.privacy.s8.rights.lead")}</p>
                      <ul className="list-disc list-inside text-muted-foreground text-sm space-y-1 ml-4">
                        <li>{t("legal.privacy.s8.rights.access")}</li>
                        <li>{t("legal.privacy.s8.rights.delete")}</li>
                        <li>{t("legal.privacy.s8.rights.correct")}</li>
                        <li>{t("legal.privacy.s8.rights.optOutSale")}</li>
                        <li>{t("legal.privacy.s8.rights.optOutTargeted")}</li>
                        <li>{t("legal.privacy.s8.rights.limit")}</li>
                        <li>{t("legal.privacy.s8.rights.nonDiscrim")}</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s8.verification.title")}</h4>
                      <p className="text-muted-foreground text-sm mb-2">{t("legal.privacy.s8.verification.body")}</p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s8.agents.title")}</h4>
                      <p className="text-muted-foreground text-sm mb-2">{t("legal.privacy.s8.agents.body")}</p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s8.appeals.title")}</h4>
                      <p className="text-muted-foreground text-sm mb-2">{t("legal.privacy.s8.appeals.body")}</p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s8.california.title")}</h4>
                      <p className="text-muted-foreground text-sm mb-2">{t("legal.privacy.s8.california.body")}</p>
                    </div>

                    <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                      <p className="text-green-700 dark:text-green-300 text-sm">
                        <strong>{t("legal.privacy.s8.incentivesLabel")}</strong>{" "}
                        {t("legal.privacy.s8.incentivesBody")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s9.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-orange-50 dark:bg-orange-950 p-4 rounded-lg">
                      <h4 className="font-medium text-orange-800 dark:text-orange-200 mb-2">
                        {t("legal.privacy.s9.minors.title")}
                      </h4>
                      <p className="text-orange-700 dark:text-orange-300 text-sm">
                        {t("legal.privacy.s9.minors.body")}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s9.under13.title")}</h4>
                      <p className="text-muted-foreground text-sm mb-2">{t("legal.privacy.s9.under13.body")}</p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s9.parental.title")}</h4>
                      <p className="text-muted-foreground text-sm">{t("legal.privacy.s9.parental.body")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s10.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">{t("legal.privacy.s10.intro")}</p>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s10.management.title")}</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s10.management.delete")}</li>
                        <li>{t("legal.privacy.s10.management.prevent")}</li>
                        <li>{t("legal.privacy.s10.management.choose")}</li>
                        <li>{t("legal.privacy.s10.management.refer")}</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s11.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">{t("legal.privacy.s11.intro")}</p>

                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        <strong>{t("legal.privacy.s11.ongoingLabel")}</strong>{" "}
                        {t("legal.privacy.s11.ongoingBody")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s12.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                            {t("legal.privacy.s12.disclaimer.title")}
                          </h4>
                          <p className="text-amber-700 dark:text-amber-300 text-sm">
                            {t("legal.privacy.s12.disclaimer.body")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s12.responsibilities.title")}</h4>
                      <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                        <li>{t("legal.privacy.s12.responsibilities.notLiable")}</li>
                        <li>{t("legal.privacy.s12.responsibilities.damages")}</li>
                        <li>{t("legal.privacy.s12.responsibilities.prevent")}</li>
                        <li>{t("legal.privacy.s12.responsibilities.feedback")}</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t("legal.privacy.s12.user.title")}</h4>
                      <p className="text-muted-foreground text-sm">{t("legal.privacy.s12.user.body")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s13.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">{t("legal.privacy.s13.intro")}</p>

                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <p className="text-blue-700 dark:text-blue-300 text-sm">
                        <strong>{t("legal.privacy.s13.stayLabel")}</strong>{" "}
                        {t("legal.privacy.s13.stayBody")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("legal.privacy.s14.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">{t("legal.privacy.s14.intro")}</p>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="font-medium">{t("legal.privacy.s14.primary.title")}</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <Mail className="h-5 w-5 text-muted-foreground" />
                          <span>info@hired.video</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <span>{t("legal.privacy.s14.primary.privacyTeam")}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium">{t("legal.privacy.s14.company.title")}</h4>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>
                          <strong>{t("legal.privacy.s14.company.tradeName")}</strong> hired.video
                        </p>
                        <p>
                          <strong>{t("legal.privacy.s14.company.controller")}</strong> Fix Faster LLC
                        </p>
                        <p>
                          <strong>{t("legal.privacy.s14.company.address")}</strong> Troy, MI
                        </p>
                        <p>
                          <strong>{t("legal.privacy.s14.company.phone")}</strong> 2488250176
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-muted/20 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>{t("legal.privacy.s14.responseLabel")}</strong>{" "}
                      {t("legal.privacy.s14.responseBody")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
        </div>
      </div>
    </AppShell>
  );
}

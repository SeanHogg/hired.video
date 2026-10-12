/**
 * Marketing landing for staffing-agency / recruiting-back-office buyers
 * (#1349 Bullhorn-lite).
 *
 * Follows the AffiliateProgram.tsx canonical pattern per the
 * `[[feedback_new_page_checklist]]` memory: AppShell wrapper, useSEO +
 * useBreadcrumbs, PAGE_SEO entry under `/for-agencies`, MarketingFAQ
 * at the bottom for AI Overview / FAQPage schema eligibility.
 */
import MarketingFAQ from "@/components/MarketingFAQ";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Briefcase,
  Clock,
  ClipboardCheck,
  DollarSign,
  FileText,
  Plug,
  Send,
  Shield,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";

export default function ForAgencies() {
  const { t } = useTranslation();
  useSEO("/for-agencies");
  useBreadcrumbs([{ name: t("labels.forAgencies.breadcrumb"), url: "/for-agencies" }]);

  const FEATURE_BLOCKS = [
    {
      id: "punch",
      icon: Clock,
      title: t("headings.forAgencies.featurePunchTitle"),
      body: t("messages.forAgencies.featurePunchBody"),
    },
    {
      id: "timesheet",
      icon: ClipboardCheck,
      title: t("headings.forAgencies.featureTimesheetTitle"),
      body: t("messages.forAgencies.featureTimesheetBody"),
    },
    {
      id: "invoice",
      icon: DollarSign,
      title: t("headings.forAgencies.featureInvoiceTitle"),
      body: t("messages.forAgencies.featureInvoiceBody"),
    },
    {
      id: "margin",
      icon: TrendingUp,
      title: t("headings.forAgencies.featureMarginTitle"),
      body: t("messages.forAgencies.featureMarginBody"),
    },
    {
      id: "compliance",
      icon: FileText,
      title: t("headings.forAgencies.featureComplianceTitle"),
      body: t("messages.forAgencies.featureComplianceBody"),
    },
    {
      id: "integrations",
      icon: Plug,
      title: t("headings.forAgencies.featureIntegrationsTitle"),
      body: t("messages.forAgencies.featureIntegrationsBody"),
    },
  ];

  const PRICING_LINE = t("messages.forAgencies.pricingLine");

  const WHAT_YOU_GET = [
    { id: "invite", text: t("labels.forAgencies.getInvite") },
    { id: "punch", text: t("labels.forAgencies.getPunch") },
    { id: "lifecycle", text: t("labels.forAgencies.getLifecycle") },
    { id: "derivation", text: t("labels.forAgencies.getDerivation") },
    { id: "margin", text: t("labels.forAgencies.getMargin") },
    { id: "detail", text: t("labels.forAgencies.getDetail") },
    { id: "vault", text: t("labels.forAgencies.getVault") },
    { id: "connectors", text: t("labels.forAgencies.getConnectors") },
    { id: "print", text: t("labels.forAgencies.getPrint") },
  ];

  const WEEK_STEPS = [
    {
      id: "monday-in",
      step: t("labels.forAgencies.weekMonday"),
      icon: Send,
      title: t("headings.forAgencies.weekPunchInTitle"),
      body: t("messages.forAgencies.weekPunchInBody"),
    },
    {
      id: "friday",
      step: t("labels.forAgencies.weekFriday"),
      icon: Clock,
      title: t("headings.forAgencies.weekSubmitTitle"),
      body: t("messages.forAgencies.weekSubmitBody"),
    },
    {
      id: "monday-approve",
      step: t("labels.forAgencies.weekMondayMorning"),
      icon: ClipboardCheck,
      title: t("headings.forAgencies.weekApproveTitle"),
      body: t("messages.forAgencies.weekApproveBody"),
    },
    {
      id: "anytime",
      step: t("labels.forAgencies.weekAnytime"),
      icon: TrendingUp,
      title: t("headings.forAgencies.weekMarginTitle"),
      body: t("messages.forAgencies.weekMarginBody"),
    },
  ];

  const FAQ_ITEMS = [
    {
      question: t("headings.forAgencies.faqDiffQuestion"),
      answer: t("messages.forAgencies.faqDiffAnswer"),
    },
    {
      question: t("headings.forAgencies.faqHelcimQuestion"),
      answer: t("messages.forAgencies.faqHelcimAnswer"),
    },
    {
      question: t("headings.forAgencies.faqSeatQuestion"),
      answer: t("messages.forAgencies.faqSeatAnswer"),
    },
    {
      question: t("headings.forAgencies.faqEmployeesQuestion"),
      answer: t("messages.forAgencies.faqEmployeesAnswer"),
    },
    {
      question: t("headings.forAgencies.faqTimesheetsQuestion"),
      answer: t("messages.forAgencies.faqTimesheetsAnswer"),
    },
    {
      question: t("headings.forAgencies.faqDocsQuestion"),
      answer: t("messages.forAgencies.faqDocsAnswer"),
    },
    {
      question: t("headings.forAgencies.faqPrintQuestion"),
      answer: t("messages.forAgencies.faqPrintAnswer"),
    },
    {
      question: t("headings.forAgencies.faqCommissionQuestion"),
      answer: t("messages.forAgencies.faqCommissionAnswer"),
    },
    {
      question: t("headings.forAgencies.faqSeparateAccountQuestion"),
      answer: t("messages.forAgencies.faqSeparateAccountAnswer"),
    },
    {
      question: t("headings.forAgencies.faqPerformanceQuestion"),
      answer: t("messages.forAgencies.faqPerformanceAnswer"),
    },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <main className="max-w-6xl mx-auto px-4 md:px-6">
        {/* Hero */}
        <section className="py-12 md:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                <Briefcase className="h-4 w-4" />
                {t("labels.forAgencies.heroBadge")}
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                {t("headings.forAgencies.heroTitle")}
              </h1>
              <p className="text-muted-foreground text-lg">
                {t("messages.forAgencies.heroSubtitle")}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button size="lg" asChild>
                  <Link to="/signup?role=employer">
                    {t("actions.forAgencies.startFree")} <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/guides/workforce">{t("actions.forAgencies.readGuide")}</Link>
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{PRICING_LINE}</p>
            </div>

            <Card className="border-primary/20 bg-accent/50">
              <CardHeader>
                <CardTitle className="text-lg">{t("headings.forAgencies.whatYouGet")}</CardTitle>
                <CardDescription>{t("messages.forAgencies.whatYouGetDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {WHAT_YOU_GET.map((line) => (
                  <div key={line.id} className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                    <span>{line.text}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Features grid */}
        <section className="py-10 border-t">
          <h2 className="text-3xl font-bold tracking-tight mb-8">{t("headings.forAgencies.featuresTitle")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURE_BLOCKS.map((f) => {
              const Icon = f.icon;
              return (
                <Card key={f.id}>
                  <CardHeader>
                    <Icon className="h-6 w-6 text-primary mb-2" />
                    <CardTitle className="text-lg">{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{f.body}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Workflow story */}
        <section className="py-10 border-t">
          <h2 className="text-3xl font-bold tracking-tight mb-8">{t("headings.forAgencies.weekTitle")}</h2>
          <ol className="space-y-6">
            {WEEK_STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                      {i + 1}
                    </div>
                    {i < 3 && <div className="w-px flex-1 bg-border mt-2" />}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.step}</span>
                    </div>
                    <h3 className="font-semibold text-lg">{s.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{s.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Trust / safety */}
        <section className="py-10 border-t">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <Shield className="h-8 w-8 text-primary mb-3" />
              <h2 className="text-2xl font-bold mb-2">{t("headings.forAgencies.moneyRailsTitle")}</h2>
              <p className="text-muted-foreground">
                {t("messages.forAgencies.moneyRailsBody")}
              </p>
            </div>
            <div>
              <FileText className="h-8 w-8 text-primary mb-3" />
              <h2 className="text-2xl font-bold mb-2">{t("headings.forAgencies.complianceTitle")}</h2>
              <p className="text-muted-foreground">
                {t("messages.forAgencies.complianceBody")}
              </p>
            </div>
          </div>
        </section>

        {/* FAQ — schema.org FAQPage for AI Overview eligibility */}
        <MarketingFAQ
          heading={t("headings.faq")}
          subheading={t("messages.forAgencies.faqSubheading")}
          items={FAQ_ITEMS}
          schemaId="for-agencies-faq"
          className="py-10 border-t"
        />

        {/* Final CTA */}
        <section className="py-12 border-t text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-3">{t("headings.forAgencies.finalCtaTitle")}</h2>
          <p className="text-muted-foreground mb-6">
            {t("messages.forAgencies.finalCtaBody")}
          </p>
          <div className="flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/signup?role=employer">
                {t("actions.forAgencies.startFree")} <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/pricing">{t("actions.seePricing")}</Link>
            </Button>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

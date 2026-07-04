import MarketingFAQ from "@/components/MarketingFAQ";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { useNavigate } from "react-router-dom";
import { Upload, Download, ShieldCheck, Globe, Check, X, ArrowRightLeft, Boxes } from "lucide-react";

/**
 * /learning-platform — marketing surface for the SCORM + xAPI hosting platform
 * (the SCORM-Cloud alternative). Follows the new-page chrome checklist:
 * AppShell + useSEO + useBreadcrumbs + MarketingFAQ, fully localized
 * (headings/messages/actions/labels/faq .lms.* keys in en/es/fr-CA), theme-token
 * colors only, responsive (the comparison scrolls on narrow viewports).
 */
export default function LearningPlatform() {
  useSEO("/learning-platform");
  const { t } = useTranslation();
  useBreadcrumbs([{ name: t("headings.lms.breadcrumb"), url: "/learning-platform" }]);
  const navigate = useNavigate();

  const pillars = [
    { icon: Upload, color: "text-green-600", title: t("headings.lms.importTitle"), body: t("messages.lms.importBody") },
    { icon: Download, color: "text-blue-600", title: t("headings.lms.exportTitle"), body: t("messages.lms.exportBody") },
    { icon: ShieldCheck, color: "text-purple-600", title: t("headings.lms.standardsTitle"), body: t("messages.lms.standardsBody") },
    { icon: Globe, color: "text-amber-600", title: t("headings.lms.thirdPartyTitle"), body: t("messages.lms.thirdPartyBody") },
  ];

  // Comparison rows: [feature label, we-include, they-include]. `true` renders a
  // check, `false` an x, a string renders as-is.
  const compareRows: Array<[string, boolean | string, boolean | string]> = [
    [t("messages.lms.cmpImport"), true, true],
    [t("messages.lms.cmpExport"), true, t("labels.lms.addon")],
    [t("messages.lms.cmpLrs"), true, true],
    [t("messages.lms.cmpForwarding"), true, true],
    [t("messages.lms.cmpThirdParty"), true, false],
    [t("messages.lms.cmpNoLockin"), true, false],
  ];

  const renderCell = (v: boolean | string) => {
    if (v === true) return <Check className="h-5 w-5 text-green-600 inline" aria-label={t("labels.lms.yes")} />;
    if (v === false) return <X className="h-5 w-5 text-muted-foreground inline" aria-label={t("labels.lms.no")} />;
    return <span className="text-sm text-muted-foreground">{v}</span>;
  };

  return (
    <AppShell bgClassName="bg-background">
      <main>
        {/* Hero */}
        <section className="px-6 py-10">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowRightLeft className="h-4 w-4" />
              {t("labels.lms.badge")}
            </div>
            <h1 className="text-4xl font-bold tracking-tight">{t("headings.lms.heroTitle")}</h1>
            <p className="text-muted-foreground text-lg">{t("messages.lms.heroSubtitle")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => navigate("/pricing")}>{t("actions.lms.getStarted")}</Button>
              <Button size="lg" variant="outline" asChild>
                <a href="mailto:seanhogg@gmail.com?subject=Learning%20platform%20migration">{t("actions.lms.talkToUs")}</a>
              </Button>
            </div>
          </div>
        </section>

        {/* Value pillars */}
        <section className="px-6 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {pillars.map((p) => (
              <Card key={p.title}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <p.icon className={`h-5 w-5 ${p.color}`} /> {p.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{p.body}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Standards strip */}
        <section className="px-6 py-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5" /> {t("headings.lms.formatsTitle")}</CardTitle>
              <CardDescription>{t("messages.lms.formatsBody")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {["SCORM 1.2", "SCORM 2004", "xAPI (Tin Can) 1.0.3", "AICC", "cmi5"].map((f) => (
                <span key={f} className="rounded-full border border-border bg-muted px-3 py-1 text-sm text-muted-foreground">{f}</span>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* Comparison vs SCORM Cloud */}
        <section className="px-6 py-6">
          <div className="space-y-2 mb-4">
            <h2 className="text-2xl font-semibold">{t("headings.lms.compareTitle")}</h2>
            <p className="text-muted-foreground">{t("messages.lms.compareSubtitle")}</p>
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[480px] text-left">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-sm font-medium">{t("labels.lms.feature")}</th>
                  <th className="px-4 py-3 text-sm font-medium text-center">{t("labels.lms.us")}</th>
                  <th className="px-4 py-3 text-sm font-medium text-center">{t("labels.lms.them")}</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map(([label, us, them]) => (
                  <tr key={label} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm">{label}</td>
                    <td className="px-4 py-3 text-center">{renderCell(us)}</td>
                    <td className="px-4 py-3 text-center">{renderCell(them)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <MarketingFAQ
          schemaId="learning-platform"
          subheading={t("faq.lms.subheading")}
          items={[
            { question: t("faq.lms.q1.q"), answer: t("faq.lms.q1.a") },
            { question: t("faq.lms.q2.q"), answer: t("faq.lms.q2.a") },
            { question: t("faq.lms.q3.q"), answer: t("faq.lms.q3.a") },
            { question: t("faq.lms.q4.q"), answer: t("faq.lms.q4.a") },
            { question: t("faq.lms.q5.q"), answer: t("faq.lms.q5.a") },
            { question: t("faq.lms.q6.q"), answer: t("faq.lms.q6.a") },
          ]}
        />

        {/* Final CTA */}
        <section className="px-6 py-10">
          <div className="flex flex-col items-center text-center space-y-4">
            <h2 className="text-2xl font-semibold">{t("headings.lms.ctaTitle")}</h2>
            <p className="text-muted-foreground max-w-xl">{t("messages.lms.ctaBody")}</p>
            <Button size="lg" onClick={() => navigate("/pricing")}>{t("actions.lms.getStarted")}</Button>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

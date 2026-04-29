import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Briefcase, Sparkles, CheckCircle2, ArrowRight, Zap,
  Users, BarChart3, Brain, Building2, Loader2,
} from "lucide-react";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { gtmEvent } from "@/lib/gtm";
import { useAuth } from "@/lib/auth";

const PERK_KEYS = [
  { icon: Sparkles, key: "messages.postJobPerk.aiWrites" },
  { icon: Users, key: "messages.postJobPerk.reachSeekers" },
  { icon: Brain, key: "messages.postJobPerk.aiChroScreens" },
  { icon: BarChart3, key: "messages.postJobPerk.analytics" },
  { icon: Zap, key: "messages.postJobPerk.goLiveFast" },
  { icon: CheckCircle2, key: "messages.postJobPerk.firstFree" },
] as const;

export default function PostAJob() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  useSEO(location.pathname);
  useBreadcrumbs([{ name: "Post a Job", url: "/post-a-job" }]);

  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle.trim() || !company.trim() || !email.trim()) return;
    setLoading(true);
    setError("");

    try {
      // Capture lead + intent
      await apiClient.post("/api/marketing/leads", {
        email: email.trim(),
        source: "post_a_job_landing",
        notes: `Job title: ${jobTitle.trim()}, Company: ${company.trim()}`,
      }, null as any);

      gtmEvent("post_job_intent", { job_title: jobTitle.trim(), company: company.trim() });

      if (isAuthenticated) {
        // Send them straight to job creation pre-filled
        navigate(`/jobs/create?title=${encodeURIComponent(jobTitle.trim())}&company=${encodeURIComponent(company.trim())}`);
      } else {
        // Collect intent, send to signup pre-filled as employer
        navigate(`/signup?role=employer&email=${encodeURIComponent(email.trim())}&jobTitle=${encodeURIComponent(jobTitle.trim())}&company=${encodeURIComponent(company.trim())}`);
      }
    } catch {
      // Even if lead capture fails, still route them forward
      if (isAuthenticated) {
        navigate(`/jobs/create?title=${encodeURIComponent(jobTitle.trim())}`);
      } else {
        navigate(`/signup?role=employer&email=${encodeURIComponent(email.trim())}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation onMenuClick={() => {}} onSidebarToggle={() => {}} sidebarCollapsed={true} />

      <div className="pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 py-16 px-4 sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[400px] w-[700px] rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="relative max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
            {/* Left — copy */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-6">
                <Briefcase className="w-3.5 h-3.5" />
                {t("labels.freeJobPostingNoCard")}
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-5">
                {t("headings.postAJobLine1")}<br />
                <span className="text-primary">{t("headings.postAJobLine2")}</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8">
                {t("messages.postAJobIntro")}
              </p>

              <ul className="space-y-3">
                {PERK_KEYS.map(({ icon: Icon, key }) => (
                  <li key={key} className="flex items-center gap-3 text-sm text-foreground">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    {t(key)}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — form */}
            <Card className="shadow-xl border-border/60">
              <CardContent className="pt-6 pb-6">
                <h2 className="text-xl font-semibold mb-1">{t("headings.postFirstJobFree")}</h2>
                <p className="text-sm text-muted-foreground mb-6">{t("messages.postFirstJobFreeSubtitle")}</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="jobTitle">{t("fields.jobTitle.label")}</Label>
                    <Input
                      id="jobTitle"
                      placeholder={t("fields.jobTitle.placeholder")}
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="company">{t("fields.companyName.label")}</Label>
                    <Input
                      id="company"
                      placeholder={t("fields.companyName.placeholder")}
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      required
                    />
                  </div>

                  {!isAuthenticated && (
                    <div className="space-y-1.5">
                      <Label htmlFor="email">{t("fields.workEmail.label")}</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder={t("fields.workEmail.placeholder")}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required={!isAuthenticated}
                      />
                    </div>
                  )}

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full gap-2"
                    disabled={loading || !jobTitle.trim() || !company.trim() || (!isAuthenticated && !email.trim())}
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {t("status.settingUp")}</>
                    ) : (
                      <>{t("actions.postJobFree")} <ArrowRight className="w-4 h-4" /></>
                    )}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    {t("messages.freeForeverHint")}
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Social proof strip */}
        <section className="border-y border-border bg-muted/30 py-6 px-4">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> {t("messages.socialProof.companies")}</span>
            <span className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> {t("messages.socialProof.activeJobSeekers")}</span>
            <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> {t("messages.socialProof.timeToApplicant")}</span>
            <span className="flex items-center gap-2"><Brain className="w-4 h-4 text-primary" /> {t("messages.socialProof.aiScreens")}</span>
          </div>
        </section>

        {/* How it works */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-10">{t("headings.howItWorksShort")}</h2>
            <div className="grid sm:grid-cols-3 gap-8">
              {[
                { step: "1", title: t("headings.postJobStep1Title"), body: t("messages.postJobStep1Body") },
                { step: "2", title: t("headings.postJobStep2Title"), body: t("messages.postJobStep2Body") },
                { step: "3", title: t("headings.postJobStep3Title"), body: t("messages.postJobStep3Body") },
              ].map(({ step, title, body }) => (
                <div key={step} className="text-center">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center mx-auto mb-4">
                    {step}
                  </div>
                  <h3 className="font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>

            <div className="text-center mt-10">
              <Button size="lg" className="gap-2" onClick={() => document.getElementById("jobTitle")?.focus()}>
                {t("actions.postYourJobFree")} <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}

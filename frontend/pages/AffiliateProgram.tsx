import MarketingFAQ from "@/components/MarketingFAQ";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/AppShell";
import { AuthCaptchaSlot } from "@/components/auth/AuthCaptchaSlot";
import { EmailField } from "@/components/auth/EmailField";
import { useAuth } from "@/lib/auth";
import { useTurnstile } from "@/lib/hooks/use-turnstile";
import { mapAuthError } from "@/lib/services/auth-errors";
import { USER_ROLES } from "@shared/user-roles";
import { CheckCircle2, DollarSign, Link as LinkIcon, Shield, Users, Zap, Video, BarChart3 } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";

export default function AffiliateProgram() {
  useSEO("/affiliate-program");
  const { t } = useTranslation();
  useBreadcrumbs([{ name: t("labels.affiliateProgram"), url: "/affiliate-program" }]);
  const navigate = useNavigate();
  const { signup, isLoading, isAuthenticated } = useAuth();
  const captcha = useTurnstile();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password || !firstName || !lastName) {
      setError(t("errors.affiliate.fillAllFields"));
      return;
    }

    if (!captcha.ready) {
      setError(t("errors.captchaRequired"));
      return;
    }

    // Register with the default role (job seeker); affiliate is a service layered on top of any role.
    // Inbound `?ref=` attribution is picked up by `signup()` from the
    // shared first-touch store (cookie populated by useAttributionCapture
    // on every route) — no need to re-parse the querystring here.
    try {
      await signup(email, password, firstName, lastName, USER_ROLES.JOB_SEEKER, undefined, true, captcha.token);
      setSuccess(t("messages.affiliate.registrationSuccess"));
      setTimeout(() => navigate(`/signup-success?email=${encodeURIComponent(email)}&firstName=${encodeURIComponent(firstName)}`), 1000);
    } catch (err) {
      setError(t(mapAuthError(err).messageKey));
      // Token is one-shot — reset so the user can retry without a soft-lock.
      captcha.reset();
    }
  };

  return (
    <AppShell bgClassName="bg-background">
<main>
          {/* Hero */}
          <section className="px-6 py-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              <div className="space-y-6">
                <h1 className="text-4xl font-bold tracking-tight">{t("headings.affiliate.heroTitle")}</h1>
                <p className="text-muted-foreground text-lg">
                  {t("messages.affiliate.heroSubtitle")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start space-x-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium">{t("headings.affiliate.featureResumeBuilder")}</p>
                      <p className="text-sm text-muted-foreground">{t("messages.affiliate.featureResumeBuilder")}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Video className="h-6 w-6 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium">{t("headings.affiliate.featureVideoResumes")}</p>
                      <p className="text-sm text-muted-foreground">{t("messages.affiliate.featureVideoResumes")}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Users className="h-6 w-6 text-purple-600 mt-0.5" />
                    <div>
                      <p className="font-medium">{t("headings.affiliate.featureCollaboration")}</p>
                      <p className="text-sm text-muted-foreground">{t("messages.affiliate.featureCollaboration")}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <BarChart3 className="h-6 w-6 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium">{t("headings.affiliate.featureAnalytics")}</p>
                      <p className="text-sm text-muted-foreground">{t("messages.affiliate.featureAnalytics")}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    onClick={() => {
                      if (isAuthenticated) {
                        navigate("/services?tab=dashboard");
                      } else {
                        document.getElementById("affiliate-signup")?.scrollIntoView({ behavior: "smooth" });
                      }
                    }}
                  >
                    {isAuthenticated ? t("actions.affiliate.goToDashboard") : t("actions.affiliate.joinProgram")}
                  </Button>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Shield className="h-4 w-4 mr-2" />
                    {t("labels.affiliate.fairPayouts")}
                  </div>
                </div>
              </div>

              {isAuthenticated ? (
                <Card id="affiliate-signup" className="shadow-lg">
                  <CardHeader>
                    <CardTitle>{t("headings.affiliate.alreadyAffiliate")}</CardTitle>
                    <CardDescription>{t("messages.affiliate.alreadyEnrolled")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5" />
                      <p className="text-sm text-muted-foreground">
                        {t("messages.affiliate.dashboardLocation")}
                      </p>
                    </div>
                    <Button className="w-full" onClick={() => navigate("/services?tab=dashboard")}>
                      {t("actions.affiliate.goToAffiliateDashboard")}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card id="affiliate-signup" className="shadow-lg">
                  <CardHeader>
                    <CardTitle>{t("headings.affiliate.becomeAffiliate")}</CardTitle>
                    <CardDescription>{t("messages.affiliate.registerCta")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form className="space-y-4" onSubmit={handleRegister}>
                      <div>
                        <label className="text-sm font-medium">{t("fields.firstName.label")}</label>
                        <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t("fields.firstName.placeholder")} required />
                      </div>
                      <div>
                        <label className="text-sm font-medium">{t("fields.lastName.label")}</label>
                        <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t("fields.lastName.placeholder")} required />
                      </div>
                      <EmailField
                        id="affiliate-email"
                        value={email}
                        onChange={setEmail}
                        label={t("fields.emailAddress.label")}
                        placeholder={t("fields.email.placeholder")}
                      />
                      <div>
                        <label className="text-sm font-medium">{t("fields.password.label")}</label>
                        <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                        <p className="text-xs text-muted-foreground mt-1">{t("messages.affiliate.passwordMinLength")}</p>
                      </div>
                      <AuthCaptchaSlot captcha={captcha} />
                      {error && <p className="text-sm text-red-600">{error}</p>}
                      {success && <p className="text-sm text-green-600">{success}</p>}
                      <Button type="submit" className="w-full" disabled={isLoading || !captcha.ready}>
                        {isLoading ? t("messages.affiliate.creatingAccount") : t("actions.affiliate.createAccount")}
                      </Button>
                      <div className="text-xs text-center text-muted-foreground">
                        {t("messages.affiliate.agreePrefix")}{" "}
                        <Link to="/terms" className="text-primary hover:underline">
                          {t("labels.tos")}
                        </Link>{" "}
                        {t("messages.affiliate.agreeAnd")}{" "}
                        <Link to="/privacy" className="text-primary hover:underline">
                          {t("labels.privacyPolicy")}
                        </Link>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}
            </div>
          </section>

          {/* Earnings & Payouts */}
          <section className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><DollarSign className="h-5 w-5 mr-2" /> {t("labels.commission")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p><strong>{t("messages.affiliate.commissionRate")}</strong> {t("messages.affiliate.commissionBody")}</p>
                  <p>{t("messages.affiliate.commissionExample")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><Zap className="h-5 w-5 mr-2" /> {t("headings.affiliate.payoutThreshold")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p><strong>{t("messages.affiliate.payoutMinimum")}</strong> {t("messages.affiliate.payoutMinimumBody")}</p>
                  <p>{t("messages.affiliate.payoutProcessing")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><LinkIcon className="h-5 w-5 mr-2" /> {t("headings.affiliate.payments")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p><strong>{t("labels.affiliate.timeline")}</strong> {t("messages.affiliate.timelineBody")}</p>
                  <p><strong>{t("labels.affiliate.methods")}</strong> {t("messages.affiliate.methodsBody")}</p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Value propositions */}
          <section className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t("headings.affiliate.greatForCreators")}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {t("messages.affiliate.greatForCreators")}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t("headings.affiliate.builtForRecruiters")}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {t("messages.affiliate.builtForRecruiters")}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t("headings.affiliate.transparentTracking")}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {t("messages.affiliate.transparentTracking")}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Social proof */}
          <section className="px-6 py-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("headings.affiliate.testimonials")}</CardTitle>
                <CardDescription>{t("messages.affiliate.testimonialsSubtitle")}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-muted-foreground">
                <blockquote className="p-4 bg-muted rounded-md">{t("messages.affiliate.testimonial1")}</blockquote>
                <blockquote className="p-4 bg-muted rounded-md">{t("messages.affiliate.testimonial2")}</blockquote>
                <blockquote className="p-4 bg-muted rounded-md">{t("messages.affiliate.testimonial3")}</blockquote>
              </CardContent>
            </Card>
          </section>

          {/* FAQ */}
          <MarketingFAQ
            schemaId="affiliate-program"
            subheading={t("faq.affiliate.subheading")}
            items={[
              { question: t("faq.affiliate.q1.q"), answer: t("faq.affiliate.q1.a") },
              { question: t("faq.affiliate.q2.q"), answer: t("faq.affiliate.q2.a") },
              { question: t("faq.affiliate.q3.q"), answer: t("faq.affiliate.q3.a") },
              { question: t("faq.affiliate.q4.q"), answer: t("faq.affiliate.q4.a") },
              { question: t("faq.affiliate.q5.q"), answer: t("faq.affiliate.q5.a") },
              { question: t("faq.affiliate.q6.q"), answer: t("faq.affiliate.q6.a") },
              { question: t("faq.affiliate.q7.q"), answer: t("faq.affiliate.q7.a") },
              { question: t("faq.affiliate.q8.q"), answer: t("faq.affiliate.q8.a") },
            ]}
          />

          {/* Final CTA */}
          <section className="px-6 py-10">
            <div className="flex flex-col items-center text-center space-y-4">
              <h2 className="text-2xl font-semibold">
                {isAuthenticated ? t("headings.affiliate.ctaShareTitle") : t("headings.affiliate.ctaEarnTitle")}
              </h2>
              <p className="text-muted-foreground">
                {isAuthenticated
                  ? t("messages.affiliate.ctaShareBody")
                  : t("messages.affiliate.ctaEarnBody")}
              </p>
              <Button
                size="lg"
                onClick={() => {
                  if (isAuthenticated) {
                    navigate("/services?tab=dashboard");
                  } else {
                    document.getElementById("affiliate-signup")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                {isAuthenticated ? t("actions.affiliate.goToDashboard") : t("actions.affiliate.joinNow")}
              </Button>
            </div>
          </section>
        </main>
</AppShell>
  );
}


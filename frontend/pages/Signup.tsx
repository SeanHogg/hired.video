import { Check } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
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
import { RegisterGate } from "@/components/security/RegisterGate";
import SignupForm from "@/components/auth/SignupForm";
import { type UserRole, USER_ROLES } from "@/lib/auth";
import { readRedirectParam } from "@/lib/auth-redirect";

export default function Signup() {
  const location = useLocation();
  const { t } = useTranslation();
  // Role is owned by the page (not the form) only so the desktop marketing
  // panel can react to the visitor's persona pick — SignupForm reports changes
  // via onRoleChange. The form remains the source of truth for submit.
  const [role, setRole] = useState<UserRole>(USER_ROLES.JOB_SEEKER);

  const initialRole = useMemo<UserRole>(() => {
    const roleParam = new URLSearchParams(location.search).get("role");
    if (roleParam === "recruiter") return USER_ROLES.RECRUITER;
    if (roleParam === "employer") return USER_ROLES.EMPLOYER;
    return USER_ROLES.JOB_SEEKER;
  }, [location.search]);

  const redirectTo = readRedirectParam(new URLSearchParams(location.search), "");

  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("actions.signUp"), url: "/signup" }]);

  // Locale-aware FAQ JSON-LD — search engines see Spanish copy when crawled in es.
  const signupFaq = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: t("faq.signUp.freeQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signUp.freeA") } },
      { "@type": "Question", name: t("faq.signUp.setupQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signUp.setupA") } },
      { "@type": "Question", name: t("faq.signUp.methodsQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signUp.methodsA") } },
      { "@type": "Question", name: t("faq.signUp.planQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signUp.planA") } },
    ],
  }), [t]);

  useEffect(() => {
    const id = "signup-faq-jsonld";
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) { s = document.createElement("script"); s.type = "application/ld+json"; s.id = id; document.head.appendChild(s); }
    s.textContent = JSON.stringify(signupFaq);
    return () => { document.getElementById(id)?.remove(); };
  }, [signupFaq]);

  const marketingKey = role === USER_ROLES.RECRUITER ? "recruiter" : role === USER_ROLES.EMPLOYER ? "employer" : "jobSeeker";

  const statTiles: { stat: string; desc: string }[] = useMemo(() => {
    if (role === USER_ROLES.RECRUITER) {
      return [
        { stat: t("marketing.signUp.stat.freeStat"), desc: t("marketing.noCreditCard") },
        { stat: t("marketing.signUp.stat.matching"), desc: t("marketing.signUp.stat.matchingDesc") },
        { stat: t("labels.videoResumes"), desc: t("marketing.signUp.stat.videoResDesc") },
        { stat: t("marketing.signUp.stat.users"), desc: t("marketing.signUp.stat.usersDescTalent") },
      ];
    }
    if (role === USER_ROLES.EMPLOYER) {
      return [
        { stat: t("marketing.signUp.stat.freeStat"), desc: t("marketing.noCreditCard") },
        { stat: t("marketing.signUp.stat.companyPage"), desc: t("marketing.signUp.stat.companyPageDesc") },
        { stat: t("marketing.signUp.stat.aiJobPosts"), desc: t("marketing.signUp.stat.aiJobPostsDesc") },
        { stat: t("marketing.signUp.stat.users"), desc: t("marketing.signUp.stat.usersDescPros") },
      ];
    }
    return [
      { stat: t("marketing.signUp.stat.freeStat"), desc: t("marketing.noCreditCard") },
      { stat: t("marketing.signUp.stat.videoTime"), desc: t("marketing.signUp.stat.videoTimeDesc") },
      { stat: t("marketing.signUp.stat.tools"), desc: t("marketing.signUp.stat.toolsDesc") },
      { stat: t("marketing.signUp.stat.users"), desc: t("marketing.signUp.stat.usersDescPros") },
    ];
  }, [role, t]);

  const features = (t(`marketing.signUp.features.${marketingKey}`, { returnObjects: true }) as string[]) ?? [];

  return (
    <AppShell>
      <div className="flex items-center justify-center p-4">
          <div className="w-full md:grid md:grid-cols-2 md:gap-8 md:items-center">
            <div>
            <RegisterGate>
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">{t("headings.createFreeAccount")}</CardTitle>
                <CardDescription>{t("headings.signupSubtitle")}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Form body is shared with the Studio conversion gate — see
                    [components/auth/SignupForm.tsx]. */}
                <SignupForm
                  initialRole={initialRole}
                  redirectTo={redirectTo}
                  onRoleChange={setRole}
                />
              </CardContent>
            </Card>
            </RegisterGate>
            </div>

            {/* Marketing panel — hidden on mobile, updates with selected role */}
            <div className="hidden md:flex flex-col justify-center bg-primary/5 rounded-2xl p-8 space-y-8">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {t(`marketing.signUp.title.${marketingKey}`)}
                </h2>
                <p className="mt-3 text-muted-foreground">
                  {t(`marketing.signUp.body.${marketingKey}`)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {statTiles.map((item) => (
                  <div key={item.stat} className="bg-background rounded-xl p-4 shadow-sm">
                    <p className="text-lg font-semibold">{item.stat}</p>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
      </div>
    </AppShell>
  );
}

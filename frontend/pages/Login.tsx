import { useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { LoginGate } from "@/components/security/RegisterGate";
import LoginForm from "@/components/auth/LoginForm";
import { AuthMarketingPanel } from "@/components/auth/AuthMarketingPanel";
import { readRedirectParam } from "@/lib/auth-redirect";

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  // Honors both `?redirectTo=` (gap #762 convention) and the legacy `?redirect=`
  // that OAuth/magic-link/verify-email already write. Both pass through the
  // open-redirect sanitizer; `redirectTo` wins when both are set.
  const redirectParam = readRedirectParam(searchParams, "/dashboard");
  const oauthError = searchParams.get("error");
  const { t } = useTranslation();

  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("actions.signIn"), url: "/login" }]);

  // FAQ JSON-LD is fed from translated copy so search engines see Spanish
  // questions/answers when crawled in es. Keys are stable; values localise.
  const loginFaq = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: t("faq.signIn.methodsQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signIn.methodsA") } },
      { "@type": "Question", name: t("faq.signIn.freeQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signIn.freeA") } },
      { "@type": "Question", name: t("faq.signIn.resetQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signIn.resetA") } },
    ],
  }), [t]);

  useEffect(() => {
    const id = "login-faq-jsonld";
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) { s = document.createElement("script"); s.type = "application/ld+json"; s.id = id; document.head.appendChild(s); }
    s.textContent = JSON.stringify(loginFaq);
    return () => { document.getElementById(id)?.remove(); };
  }, [loginFaq]);

  return (
    <AppShell>
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
          <div className="w-full md:grid md:grid-cols-2 md:gap-8 md:items-center">
            <div>
            {/* #320 — geo gate: sanctioned regions get a hard-block notice
                (no email capture); waitlist regions still render the form
                so existing customers can sign in to a not-yet-launched
                region. */}
            <LoginGate>
            <Card>
              <CardHeader className="text-center">
                <h1 className="text-2xl font-semibold leading-none tracking-tight">{t("headings.welcomeBack")}</h1>
                <CardDescription>{t("headings.signInSubtitle")}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Form body is shared with the Studio conversion gate — see
                    [components/auth/LoginForm.tsx]. The page navigates on
                    success; the gate resumes a pending action in place. */}
                <LoginForm
                  redirectParam={redirectParam}
                  oauthError={oauthError}
                  onAuthenticated={() => navigate(redirectParam)}
                />
              </CardContent>
            </Card>
            </LoginGate>
            </div>

            {/* Marketing panel — desktop only, shared with Signup */}
            <AuthMarketingPanel variant="signIn" />
          </div>
      </div>
    </AppShell>
  );
}

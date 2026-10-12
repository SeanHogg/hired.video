import { useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useProMonthlyPriceLabel } from "@/hooks/use-pro-price-label";
import { LoginGate } from "@/components/security/RegisterGate";
import LoginForm from "@/components/auth/LoginForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
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
  const proPrice = useProMonthlyPriceLabel();

  // FAQ JSON-LD is fed from translated copy so search engines see Spanish
  // questions/answers when crawled in es. Keys are stable; values localise.
  const loginFaq = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: t("faq.signIn.methodsQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signIn.methodsA") } },
      { "@type": "Question", name: t("faq.signIn.freeQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signIn.freeA", { price: proPrice }) } },
      { "@type": "Question", name: t("faq.signIn.resetQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signIn.resetA") } },
    ],
  }), [t, proPrice]);

  useEffect(() => {
    const id = "login-faq-jsonld";
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) { s = document.createElement("script"); s.type = "application/ld+json"; s.id = id; document.head.appendChild(s); }
    s.textContent = JSON.stringify(loginFaq);
    return () => { document.getElementById(id)?.remove(); };
  }, [loginFaq]);

  return (
    <AuthLayout
      seoPath={location.pathname}
      breadcrumbs={[{ name: t("actions.signIn"), url: "/login" }]}
      panel="signIn"
    >
      {/* #320 — geo gate: sanctioned regions get a hard-block notice
          (no email capture); waitlist regions still render the form
          so existing customers can sign in to a not-yet-launched
          region. */}
      <LoginGate>
        <AuthCard title={t("headings.welcomeBack")} subtitle={t("headings.signInSubtitle")}>
          {/* Form body is shared with the Studio conversion gate — see
              [components/auth/LoginForm.tsx]. The page navigates on
              success; the gate resumes a pending action in place. */}
          <LoginForm
            redirectParam={redirectParam}
            oauthError={oauthError}
            onAuthenticated={() => navigate(redirectParam)}
          />
        </AuthCard>
      </LoginGate>
    </AuthLayout>
  );
}

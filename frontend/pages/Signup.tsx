import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useProMonthlyPriceLabel } from "@/hooks/use-pro-price-label";
import { RegisterGate } from "@/components/security/RegisterGate";
import SignupForm from "@/components/auth/SignupForm";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { type UserRole, USER_ROLES } from "@/lib/auth";
import { readRedirectParam } from "@/lib/auth-redirect";
import { resolveSignupPickerRole } from "@shared/user-roles";

export default function Signup() {
  const location = useLocation();
  const { t } = useTranslation();
  const proPrice = useProMonthlyPriceLabel();
  // Role is owned by the page (not the form) only so the desktop marketing
  // panel can react to the visitor's persona pick — SignupForm reports changes
  // via onRoleChange. The form remains the source of truth for submit.
  const [role, setRole] = useState<UserRole>(USER_ROLES.JOB_SEEKER);

  // `?role=` only pre-selects personas the picker currently offers; hiring
  // roles fall back to job_seeker while HIRING_PERSONAS_ENABLED is off (and so
  // does the marketing panel variant, which follows the selection).
  const initialRole = useMemo<UserRole>(
    () => resolveSignupPickerRole(new URLSearchParams(location.search).get("role")),
    [location.search],
  );

  const redirectTo = readRedirectParam(new URLSearchParams(location.search), "");

  // Locale-aware FAQ JSON-LD — search engines see Spanish copy when crawled in es.
  const signupFaq = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: t("faq.signUp.freeQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signUp.freeA") } },
      { "@type": "Question", name: t("faq.signUp.setupQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signUp.setupA") } },
      { "@type": "Question", name: t("faq.signUp.methodsQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signUp.methodsA") } },
      { "@type": "Question", name: t("faq.signUp.planQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signUp.planA", { price: proPrice }) } },
    ],
  }), [t, proPrice]);

  useEffect(() => {
    const id = "signup-faq-jsonld";
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) { s = document.createElement("script"); s.type = "application/ld+json"; s.id = id; document.head.appendChild(s); }
    s.textContent = JSON.stringify(signupFaq);
    return () => { document.getElementById(id)?.remove(); };
  }, [signupFaq]);

  return (
    <AuthLayout
      seoPath={location.pathname}
      breadcrumbs={[{ name: t("actions.signUp"), url: "/signup" }]}
      panel={role}
    >
      <RegisterGate>
        <AuthCard
          eyebrow={t("auth.signup.eyebrow")}
          title={t("headings.createFreeAccount")}
          subtitle={t("auth.signup.subtitle")}
        >
          {/* Form body is shared with the Studio conversion gate — see
              [components/auth/SignupForm.tsx]. */}
          <SignupForm
            initialRole={initialRole}
            redirectTo={redirectTo}
            onRoleChange={setRole}
          />
        </AuthCard>
      </RegisterGate>
    </AuthLayout>
  );
}

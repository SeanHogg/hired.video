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
import { AuthMarketingPanel } from "@/components/auth/AuthMarketingPanel";
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
            <AuthMarketingPanel variant={role} />

          </div>
      </div>
    </AppShell>
  );
}

import { useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthBackLink, AuthCard, AuthStatusIcon } from "@/components/auth/AuthCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

/**
 * Legacy /confirm-email route — kept to gracefully handle old-format links.
 * New verification emails go to /verify-email?token=... instead.
 * If somehow a ?token= arrives here, redirect to the real handler.
 */
export default function ConfirmEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const token = searchParams.get("token");

  useEffect(() => {
    if (token) {
      navigate(`/verify-email?token=${encodeURIComponent(token)}`, { replace: true });
    }
  }, [token, navigate]);

  if (token) return null; // redirecting

  return (
    <AuthLayout
      seoPath="/confirm-email"
      breadcrumbs={[{ name: t("headings.linkExpired"), url: "/confirm-email" }]}
      panel="signIn"
    >
      <AuthCard
        media={<AuthStatusIcon icon={Mail} tone="warning" />}
        title={t("headings.linkExpired")}
        subtitle={t("messages.linkExpiredSubtitle")}
      >
        <div className="space-y-5">
          <Alert>
            <AlertDescription>{t("messages.linkExpiredAlert")}</AlertDescription>
          </Alert>
          <div className="flex flex-col gap-3">
            <Button asChild size="lg" className="w-full">
              <Link to="/login">{t("actions.signIn")}</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link to="/forgot-password">{t("actions.resetPassword")}</Link>
            </Button>
          </div>
          <AuthBackLink to="/">{t("actions.backToHome")}</AuthBackLink>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}

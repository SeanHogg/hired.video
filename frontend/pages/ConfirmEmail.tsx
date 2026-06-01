// eslint-page-chrome: skip - auth / verification flow - ships its own minimal chrome (pre-existing; #1869).
import { useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, ArrowLeft } from "lucide-react";

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
    <AppShell bgClassName="bg-background">
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4">
        <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                  <Mail className="h-6 w-6 text-yellow-600" />
                </div>
                <CardTitle className="text-2xl">{t("headings.linkExpired")}</CardTitle>
                <CardDescription>{t("messages.linkExpiredSubtitle")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertDescription>
                    {t("messages.linkExpiredAlert")}
                  </AlertDescription>
                </Alert>
                <div className="space-y-3">
                  <Button asChild className="w-full min-h-[44px]">
                    <Link to="/login">{t("actions.signIn")}</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full min-h-[44px]">
                    <Link to="/forgot-password">{t("actions.resetPassword")}</Link>
                  </Button>
                  <div className="text-center">
                    <Link to="/" className="text-sm text-blue-600 hover:text-blue-500 inline-flex items-center">
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      {t("actions.backToHome")}
                    </Link>
                  </div>
                </div>
              </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

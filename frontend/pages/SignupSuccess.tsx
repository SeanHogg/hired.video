import { Mail, CheckCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { useSearchParams, Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSidebar } from "@/hooks/use-sidebar";
import { authService } from "@/lib/services/auth-service";
import { useState } from "react";

export default function SignupSuccess() {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const email = searchParams.get("email") || t("auth.signupSuccess.fallbackEmail");
  const firstName = searchParams.get("firstName") || "";
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16">
          <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4">
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle className="text-2xl">
                  {t("auth.signupSuccess.title", { suffix: firstName ? ` ${firstName}` : "" })}
                </CardTitle>
                <CardDescription>
                  {t("auth.signupSuccess.subtitle")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Mail className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{t("auth.signupSuccess.emailAlertTitle")}</strong>
                    <br />
                    <Trans
                      i18nKey="auth.signupSuccess.emailAlertBody"
                      values={{ email }}
                      components={{ strong: <strong /> }}
                    />
                  </AlertDescription>
                </Alert>

                <div className="rounded-lg bg-blue-50 p-4">
                  <div className="flex items-start">
                    <Mail className="h-5 w-5 text-blue-600 mt-0.5 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">
                        {t("auth.signupSuccess.nextSteps")}
                      </p>
                      <ol className="text-sm text-blue-700 mt-1 space-y-1 list-decimal list-inside">
                        <li>{t("auth.signupSuccess.stepInbox")}</li>
                        <li>{t("auth.signupSuccess.stepClick")}</li>
                        <li>{t("auth.signupSuccess.stepSignIn")}</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-3">
                      {t("auth.signupSuccess.noEmail")}
                    </p>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={resending}
                        onClick={async () => {
                          setResendMsg(null);
                          setResending(true);
                          try {
                            const ok = await authService.resendEmailVerification();
                            setResendMsg(ok ? t("auth.signupSuccess.resendSent") : t("auth.signupSuccess.resendNeedsLogin"));
                          } catch (e) {
                            setResendMsg(t("auth.signupSuccess.resendError"));
                          } finally {
                            setResending(false);
                          }
                        }}
                        className="flex-1"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {resending ? t("common.sending") : t("auth.signupSuccess.resend")}
                      </Button>

                      {resendMsg && (
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          {resendMsg}
                        </p>
                      )}


                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="flex-1"
                      >
                        <Link to="/signup">{t("common.actions.tryDifferentEmail")}</Link>
                      </Button>
                    </div>
                  </div>

                  <div className="text-center pt-4 border-t">
                    <p className="text-sm text-gray-600 mb-2">
                      {t("auth.signupSuccess.alreadyConfirmed")}
                    </p>
                    <Button asChild className="w-full">
                      <Link to="/login">{t("auth.signupSuccess.signInCta")}</Link>
                    </Button>
                  </div>

                  <div className="text-center">
                    <Link
                      to="/"
                      className="text-sm text-gray-600 hover:text-gray-500 inline-flex items-center"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      {t("common.actions.backToHome")}
                    </Link>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 text-center">
                    <strong>{t("auth.signupSuccess.troubleTitle")}</strong> {t("auth.signupSuccess.troubleBody")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

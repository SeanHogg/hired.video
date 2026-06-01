// eslint-page-chrome: skip - auth / verification flow - ships its own minimal chrome (pre-existing; #1869).
import { Mail, CheckCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { useSearchParams, Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authService } from "@/lib/services/auth-service";
import { useState } from "react";
import { readRedirectParam, withRedirectTo } from "@/lib/auth-redirect";

export default function SignupSuccess() {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const email = searchParams.get("email") || t("messages.fallbackEmail");
  const firstName = searchParams.get("firstName") || "";
  // Forward `?redirectTo=` (or legacy `?redirect=`) through to /login so the
  // deep-linked tool round-trip completes once the user verifies + signs in.
  const redirectTo = readRedirectParam(searchParams, "");

  return (
    <AppShell bgClassName="bg-background">
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4">
        <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle className="text-2xl">
                  {t("headings.welcomeUser", { suffix: firstName ? ` ${firstName}` : "" })}
                </CardTitle>
                <CardDescription>
                  {t("status.accountCreated")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Mail className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{t("messages.checkEmailToStart")}</strong>
                    <br />
                    <Trans
                      i18nKey="messages.confirmationEmailSent"
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
                        {t("messages.signupNextSteps")}
                      </p>
                      <ol className="text-sm text-blue-700 mt-1 space-y-1 list-decimal list-inside">
                        <li>{t("messages.signupStepInbox")}</li>
                        <li>{t("messages.signupStepClick")}</li>
                        <li>{t("messages.signupStepSignIn")}</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 mb-3">
                      {t("prompts.didNotReceiveEmail")}
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
                            setResendMsg(ok ? t("messages.verificationEmailSentShort") : t("messages.resendNeedsLogin"));
                          } catch (e) {
                            setResendMsg(t("messages.resendError"));
                          } finally {
                            setResending(false);
                          }
                        }}
                        className="flex-1"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {resending ? t("status.sending") : t("actions.resendEmail")}
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
                        <Link to="/signup">{t("actions.tryDifferentEmail")}</Link>
                      </Button>
                    </div>
                  </div>

                  <div className="text-center pt-4 border-t">
                    <p className="text-sm text-gray-600 mb-2">
                      {t("prompts.alreadyConfirmedEmail")}
                    </p>
                    <Button asChild className="w-full">
                      <Link to={withRedirectTo("/login", redirectTo)}>{t("actions.signIn")}</Link>
                    </Button>
                  </div>

                  <div className="text-center">
                    <Link
                      to="/"
                      className="text-sm text-gray-600 hover:text-gray-500 inline-flex items-center"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      {t("actions.backToHome")}
                    </Link>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 text-center">
                    <strong>{t("prompts.troubleHelp")}</strong> {t("messages.troubleBody")}
                  </p>
                </div>
              </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

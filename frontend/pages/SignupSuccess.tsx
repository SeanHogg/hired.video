import { Mail, CheckCircle2, RefreshCw } from "lucide-react";
import { useSearchParams, Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthBackLink, AuthCard, AuthStatusIcon } from "@/components/auth/AuthCard";
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
    <AuthLayout
      seoPath="/signup-success"
      breadcrumbs={[{ name: t("actions.signUp"), url: "/signup" }, { name: t("status.accountCreated"), url: "/signup-success" }]}
      panel="signIn"
    >
      <AuthCard
        media={<AuthStatusIcon icon={CheckCircle2} tone="success" />}
        title={t("headings.welcomeUser", { suffix: firstName ? ` ${firstName}` : "" })}
        subtitle={t("status.accountCreated")}
      >
        <div className="space-y-6">
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

          <div className="rounded-2xl bg-accent p-5">
            <p className="text-sm font-semibold text-accent-foreground">{t("messages.signupNextSteps")}</p>
            <ol className="mt-3 space-y-2">
              {(["messages.signupStepInbox", "messages.signupStepClick", "messages.signupStepSignIn"] as const).map((key, i) => (
                <li key={key} className="flex items-start gap-3 text-sm text-accent-foreground">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{t(key)}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("prompts.alreadyConfirmedEmail")}</p>
            <Button asChild size="lg" className="w-full">
              <Link to={withRedirectTo("/login", redirectTo)}>{t("actions.signIn")}</Link>
            </Button>
          </div>

          <div className="space-y-3 border-t border-border pt-5">
            <p className="text-sm text-muted-foreground">{t("prompts.didNotReceiveEmail")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
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
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {resending ? t("status.sending") : t("actions.resendEmail")}
              </Button>
              <Button variant="outline" asChild className="flex-1">
                <Link to="/signup">{t("actions.tryDifferentEmail")}</Link>
              </Button>
            </div>
            {resendMsg && (
              <p role="status" className="text-sm text-muted-foreground">
                {resendMsg}
              </p>
            )}
          </div>

          <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">{t("prompts.troubleHelp")}</strong> {t("messages.troubleBody")}
          </p>

          <AuthBackLink to="/">{t("actions.backToHome")}</AuthBackLink>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}

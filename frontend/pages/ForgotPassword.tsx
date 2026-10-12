import { Mail, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuthCaptchaSlot } from "@/components/auth/AuthCaptchaSlot";
import { EmailField } from "@/components/auth/EmailField";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthBackLink, AuthCard, AuthStatusIcon } from "@/components/auth/AuthCard";
import { useTurnstile } from "@/lib/hooks/use-turnstile";
import { apiClient } from "@/lib/api-client";

export default function ForgotPassword() {
  const location = useLocation();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const captcha = useTurnstile();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError(t("errors.emailRequired"));
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t("errors.emailInvalid"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Use the API endpoint for password reset
      await apiClient.requestRaw<{ message: string }>(
        "/api/auth/forgot-password",
        {
          method: "POST",
          body: { email, cfTurnstileToken: captcha.token },
        },
      );

      setSuccess(true);
    } catch (err) {
      setError(t("errors.sendResetEmailFailed"));
    } finally {
      // Token is one-shot — reset so the user can retry without a soft-lock.
      captcha.reset();
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      seoPath={location.pathname}
      breadcrumbs={[{ name: t("actions.signIn"), url: "/login" }, { name: t("headings.resetYourPassword"), url: "/forgot-password" }]}
      panel="signIn"
    >
      {success ? (
        <AuthCard
          media={<AuthStatusIcon icon={CheckCircle2} tone="success" />}
          title={t("headings.checkYourEmail")}
          subtitle={t("messages.resetInstructionsSent")}
        >
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-2xl bg-accent p-4">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-accent-foreground">
                  {t("messages.emailSentTo", { email })}
                </p>
                <p className="mt-1 text-sm text-accent-foreground/80">{t("messages.resetLinkBody")}</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">{t("messages.didNotReceiveHint")}</p>

            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => {
                setSuccess(false);
                setEmail("");
              }}
            >
              {t("actions.tryDifferentEmail")}
            </Button>

            <AuthBackLink to="/login">{t("actions.backToSignIn")}</AuthBackLink>
          </div>
        </AuthCard>
      ) : (
        <AuthCard title={t("headings.resetYourPassword")} subtitle={t("headings.resetYourPasswordSubtitle")}>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <EmailField
              id="email"
              value={email}
              onChange={setEmail}
              label={t("fields.email.label")}
              placeholder={t("fields.email.placeholder")}
              disabled={loading}
            />

            <AuthCaptchaSlot captcha={captcha} />

            <Button type="submit" size="lg" className="w-full" disabled={loading || !captcha.ready}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("status.sendingResetLink")}
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {t("actions.sendResetLink")}
                </>
              )}
            </Button>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                {t("prompts.rememberPassword")}{" "}
                <Link to="/login" className="font-semibold text-primary hover:underline">
                  {t("actions.signIn")}
                </Link>
              </p>
              <p>
                {t("prompts.noAccount")}{" "}
                <Link to="/signup" className="font-semibold text-primary hover:underline">
                  {t("actions.createAccount")}
                </Link>
              </p>
            </div>
          </form>
        </AuthCard>
      )}
    </AuthLayout>
  );
}

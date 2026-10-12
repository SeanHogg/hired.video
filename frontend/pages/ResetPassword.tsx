import { useState, useEffect } from "react";
import { useSearchParams, Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthBackLink, AuthCard, AuthStatusIcon } from "@/components/auth/AuthCard";
import { PasswordField } from "@/components/auth/PasswordField";
import { apiClient } from "@/lib/api-client";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setError(t("errors.invalidResetLink"));
    }
  }, [token, t]);

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push(t("errors.passwordMinLength"));
    }
    // One template + named tokens — adding a new requirement is a JSON
    // line, not a new full sentence per language.
    const requirements: Array<{ test: RegExp; key: string }> = [
      { test: /[A-Z]/, key: "uppercase" },
      { test: /[a-z]/, key: "lowercase" },
      { test: /\d/, key: "number" },
      { test: /[!@#$%^&*(),.?":{}|<>]/, key: "specialChar" },
    ];
    for (const r of requirements) {
      if (!r.test.test(password)) {
        errors.push(t("errors.passwordMissing", { requirement: t(`passwordRequirement.${r.key}`) }));
      }
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setError(t("errors.invalidResetLink"));
      return;
    }

    if (!password.trim()) {
      setError(t("errors.passwordRequired"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("prompts.passwordsMismatch"));
      return;
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      setValidationErrors(passwordErrors);
      setError(t("errors.fixPasswordRequirements"));
      return;
    }

    setLoading(true);
    setError("");
    setValidationErrors([]);

    try {
      await apiClient.requestRaw<{ message?: string }>(
        "/api/auth/reset-password",
        {
          method: "POST",
          body: {
            token,
            password,
          },
        },
      );

      const ok = true;

      if (ok) {
        setSuccess(true);
        setTimeout(() => {
          navigate("/login");
        }, 3000);
      } else {
        try {
          setError(t("errors.resetFailed"));
        } catch {
          setError(t("errors.resetFailed"));
        }
      }
    } catch (err) {
      setError(t("errors.network"));
    } finally {
      setLoading(false);
    }
  };

  const content = !token ? (
    <AuthCard
      media={<AuthStatusIcon icon={AlertCircle} tone="destructive" />}
      title={t("headings.invalidResetLink")}
      subtitle={t("messages.invalidResetLinkSubtitle")}
    >
      <div className="space-y-5">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("messages.invalidLinkAlert")}</AlertDescription>
        </Alert>
        <Button asChild size="lg" className="w-full">
          <Link to="/forgot-password">{t("actions.requestNewLink")}</Link>
        </Button>
        <AuthBackLink to="/login">{t("actions.backToSignIn")}</AuthBackLink>
      </div>
    </AuthCard>
  ) : success ? (
    <AuthCard
      media={<AuthStatusIcon icon={CheckCircle2} tone="success" />}
      title={t("headings.passwordResetSuccessful")}
      subtitle={t("messages.passwordResetSuccessSubtitle")}
    >
      <div className="space-y-5">
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{t("messages.passwordResetSuccessAlert")}</AlertDescription>
        </Alert>
        <Button asChild size="lg" className="w-full">
          <Link to="/login">{t("actions.signIn")}</Link>
        </Button>
      </div>
    </AuthCard>
  ) : (
    <AuthCard title={t("headings.resetYourPassword")} subtitle={t("headings.enterNewPasswordSubtitle")}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <PasswordField
          id="password"
          value={password}
          onChange={setPassword}
          label={t("fields.password.newLabel")}
          placeholder={t("fields.password.newPlaceholder")}
          autoComplete="new-password"
          disabled={loading}
        />

        <PasswordField
          id="confirmPassword"
          value={confirmPassword}
          onChange={setConfirmPassword}
          label={t("fields.confirmPassword.newLabel")}
          placeholder={t("fields.confirmPassword.newPlaceholder")}
          autoComplete="new-password"
          disabled={loading}
        />

        {validationErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {validationErrors.map((err, index) => (
                  <li key={index} className="break-words">{err}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t("status.resettingPassword")}
            </>
          ) : (
            t("actions.resetPassword")
          )}
        </Button>

        <AuthBackLink to="/login">{t("actions.backToSignIn")}</AuthBackLink>
      </form>
    </AuthCard>
  );

  return (
    <AuthLayout
      seoPath={location.pathname}
      breadcrumbs={[{ name: t("actions.signIn"), url: "/login" }, { name: t("actions.resetPassword"), url: "/reset-password" }]}
      panel="signIn"
    >
      {content}
    </AuthLayout>
  );
}

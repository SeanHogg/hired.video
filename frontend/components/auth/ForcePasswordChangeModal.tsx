import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PasswordField } from "@/components/auth/PasswordField";

/** Strength band → i18n key + token colour (one table, not a nested ternary). */
function strengthBand(score: number): { key: string; className: string } {
  if (score >= 85) return { key: "forcePassword.strength.strong", className: "text-brand-green-text" };
  if (score >= 60) return { key: "forcePassword.strength.good", className: "text-primary" };
  if (score >= 40) return { key: "forcePassword.strength.fair", className: "text-amber-700 dark:text-amber-400" };
  return { key: "forcePassword.strength.weak", className: "text-destructive" };
}

interface PasswordRequirements {
  requiresPasswordChange: boolean;
  isTemporaryPassword: boolean;
  passwordSetDate?: string;
  passwordExpiryDate?: string;
  daysUntilExpiry: number;
  reason?: string;
  canSkip: boolean;
}

interface PasswordStrength {
  isValid: boolean;
  score: number;
  requirements: string[];
  suggestions: string[];
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumbers: boolean;
  hasSpecialChars: boolean;
  isNotCommon: boolean;
}

interface ForcePasswordChangeModalProps {
  isOpen: boolean;
  requirements: PasswordRequirements;
  onPasswordChanged: () => void;
  onClose?: () => void;
}

export const ForcePasswordChangeModal: React.FC<
  ForcePasswordChangeModalProps
> = ({ isOpen, requirements, onPasswordChanged, onClose }) => {
  const { apiCall } = useAuth();
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordStrength, setPasswordStrength] =
    useState<PasswordStrength | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check password strength as user types
  useEffect(() => {
    if (formData.newPassword.length > 0) {
      checkPasswordStrength(formData.newPassword);
    } else {
      setPasswordStrength(null);
    }
  }, [formData.newPassword]);

  const checkPasswordStrength = async (password: string) => {
    try {
      const response = await apiCall(
        "/api/passwordmanagement/validate-strength",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(password),
        },
      );

      if (response.success) {
        setPasswordStrength(response.data);
      }
    } catch (error) {
      console.error("Error checking password strength:", error);
    }
  };

  const setField = (name: "newPassword" | "confirmPassword") => (value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.newPassword !== formData.confirmPassword) {
      setError(t("prompts.passwordsMismatch"));
      return;
    }

    if (!passwordStrength?.isValid) {
      setError(t("forcePassword.notStrongEnough"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiCall("/api/passwordmanagement/force-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: formData.newPassword,
          confirmPassword: formData.confirmPassword,
        }),
      });

      if (response.success) {
        setSuccess(true);
        setTimeout(() => {
          onPasswordChanged();
        }, 2000);
      } else {
        setError(response.error?.message || t("forcePassword.failed"));
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t("forcePassword.failed");
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-brand-green-text" aria-hidden="true" />
              {t("forcePassword.successTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">{t("forcePassword.successBody")}</p>
        </DialogContent>
      </Dialog>
    );
  }

  const band = passwordStrength ? strengthBand(passwordStrength.score) : null;
  const mismatch = !!formData.confirmPassword && formData.newPassword !== formData.confirmPassword;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={requirements.canSkip ? onClose : undefined}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            {t("forcePassword.title")}
          </DialogTitle>
          <DialogDescription>{requirements.reason || t("forcePassword.defaultReason")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <PasswordField
            id="newPassword"
            value={formData.newPassword}
            onChange={setField("newPassword")}
            label={t("fields.password.newLabel")}
            placeholder={t("fields.password.newPlaceholder")}
            autoComplete="new-password"
            disabled={isLoading}
          />

          {passwordStrength && band && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{t("forcePassword.strengthLabel")}</span>
                <span className={`font-semibold ${band.className}`}>{t(band.key)}</span>
              </div>
              <Progress value={passwordStrength.score} className="h-2" />

              {passwordStrength.requirements.length > 0 && (
                <ul className="space-y-1 text-xs text-destructive">
                  {passwordStrength.requirements.map((req, index) => (
                    <li key={index} className="flex items-center gap-1">
                      <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {req}
                    </li>
                  ))}
                </ul>
              )}

              {passwordStrength.suggestions.length > 0 && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-semibold">{t("forcePassword.suggestions")}</p>
                  <ul className="list-inside list-disc space-y-1">
                    {passwordStrength.suggestions.map((suggestion, index) => (
                      <li key={index}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <PasswordField
            id="confirmPassword"
            value={formData.confirmPassword}
            onChange={setField("confirmPassword")}
            label={t("fields.confirmPassword.newLabel")}
            placeholder={t("fields.confirmPassword.newPlaceholder")}
            autoComplete="new-password"
            disabled={isLoading}
          />

          {mismatch && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <XCircle className="h-3 w-3" aria-hidden="true" />
              {t("prompts.passwordsMismatch")}
            </p>
          )}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <Button
              type="submit"
              size="lg"
              className="sm:flex-1"
              disabled={
                isLoading ||
                !passwordStrength?.isValid ||
                formData.newPassword !== formData.confirmPassword ||
                !formData.newPassword ||
                !formData.confirmPassword
              }
            >
              {isLoading ? t("forcePassword.submitting") : t("forcePassword.submit")}
            </Button>

            {requirements.canSkip && onClose && (
              <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={isLoading}>
                {t("forcePassword.skip")}
              </Button>
            )}
          </div>
        </form>

        {requirements.isTemporaryPassword && (
          <p className="mt-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            <strong>{t("forcePassword.temporaryTitle")}</strong> {t("forcePassword.temporaryBody")}
          </p>
        )}

        {requirements.daysUntilExpiry > 0 && requirements.daysUntilExpiry <= 7 && (
          <p className="mt-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            <strong>{t("forcePassword.expiringTitle")}</strong>{" "}
            {t("forcePassword.expiringBody", { count: requirements.daysUntilExpiry })}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AuthCaptchaSlot } from "@/components/auth/AuthCaptchaSlot";
import { EmailField } from "@/components/auth/EmailField";
import { useTurnstile } from "@/lib/hooks/use-turnstile";
import { mapAuthError } from "@/lib/services/auth-errors";

export interface ProgramSignupFields {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

interface Props {
  /** DOM id for the card, so a hero CTA can scroll to it. */
  id?: string;
  /** Program-specific card title (already localized by the caller). */
  title: string;
  /** Program-specific card description (already localized). */
  description: string;
  /** Submit-button label when idle (already localized). */
  submitLabel: string;
  /** Success banner shown after the register call resolves (already localized). */
  successMessage: string;
  /** Performs the actual signup. Throws on failure (mapAuthError handles the message). */
  register: (fields: ProgramSignupFields, captchaToken: string) => Promise<void>;
  /** Fired after a successful register — e.g. to navigate to /signup-success. */
  onSuccess?: (fields: ProgramSignupFields) => void;
  /** Disable the form while the parent's auth call is in flight. */
  isLoading?: boolean;
}

/**
 * Shared create-account form for the public program landing pages
 * (affiliate-program, the Become-a-Creator /services page, …). Owns the
 * name/email/password fields, the Turnstile slot, and the ToS agreement
 * block; the caller supplies only the program-specific copy + the `register`
 * callback that picks the role / opt-in flags. Extracted from
 * AffiliateProgram so the two landing pages never drift (DRY).
 */
export default function ProgramSignupForm({
  id,
  title,
  description,
  submitLabel,
  successMessage,
  register,
  onSuccess,
  isLoading = false,
}: Props) {
  const { t } = useTranslation();
  const captcha = useTurnstile();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password || !firstName || !lastName) {
      setError(t("programSignup.fillAllFields"));
      return;
    }
    if (!captcha.ready) {
      setError(t("errors.captchaRequired"));
      return;
    }

    const fields: ProgramSignupFields = { firstName, lastName, email, password };
    try {
      await register(fields, captcha.token);
      setSuccess(successMessage);
      onSuccess?.(fields);
    } catch (err) {
      setError(t(mapAuthError(err).messageKey));
      // Turnstile tokens are one-shot — reset so a retry isn't soft-locked.
      captcha.reset();
    }
  };

  return (
    <Card id={id} className="shadow-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-medium">{t("fields.firstName.label")}</label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder={t("fields.firstName.placeholder")} required />
          </div>
          <div>
            <label className="text-sm font-medium">{t("fields.lastName.label")}</label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder={t("fields.lastName.placeholder")} required />
          </div>
          <EmailField
            id={`${id ?? "program"}-email`}
            value={email}
            onChange={setEmail}
            label={t("fields.emailAddress.label")}
            placeholder={t("fields.email.placeholder")}
          />
          <div>
            <label className="text-sm font-medium">{t("fields.password.label")}</label>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            <p className="text-xs text-muted-foreground mt-1">{t("programSignup.passwordMinLength")}</p>
          </div>
          <AuthCaptchaSlot captcha={captcha} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
          <Button type="submit" className="w-full" disabled={isLoading || !captcha.ready}>
            {isLoading ? t("programSignup.creatingAccount") : submitLabel}
          </Button>
          <div className="text-xs text-center text-muted-foreground">
            {t("programSignup.agreePrefix")}{" "}
            <Link to="/terms" className="text-primary hover:underline">
              {t("labels.tos")}
            </Link>{" "}
            {t("programSignup.agreeAnd")}{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              {t("labels.privacyPolicy")}
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * LoginForm — the inner sign-in form, extracted from [pages/Login.tsx] so the
 * same implementation backs BOTH the full-page `/login` route and the in-place
 * auth panel the Studio conversion gate opens ([AuthGatePanel]). Renders only
 * the form body (OAuth + password/magic-link tabs + 2FA step + footer links);
 * the page wraps it in <Card>/<AppShell>/<LoginGate>, the gate wraps it in a
 * <Sheet>.
 *
 * The one behavioural difference between hosts is what "success" does: the page
 * navigates to the redirect target, while the gate stays put and finishes the
 * pending action (Save / Publish) in place. That branch is hoisted to the
 * `onAuthenticated` callback so the form itself is host-agnostic.
 */
import { Eye, EyeOff, Mail } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Trans, useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import OAuthProviders from "@/components/OAuthProviders";
import { AuthCaptchaSlot } from "@/components/auth/AuthCaptchaSlot";
import { EmailField } from "@/components/auth/EmailField";
import { useAuth } from "@/lib/auth";
import { useTurnstile } from "@/lib/hooks/use-turnstile";
import { mapAuthError } from "@/lib/services/auth-errors";
import { apiClient } from "@/lib/api-client";
import { safeRedirectTo } from "@/lib/auth-redirect";

export interface LoginFormProps {
  /** Where OAuth / magic-link should return the user, and the target the
   *  "Sign up" link carries forward. Defaults to /dashboard. */
  redirectParam?: string;
  /** Fired after a fully-authenticated result (password or 2FA). The host
   *  decides what happens next — navigate (page) or resume a pending action
   *  in place (gate). */
  onAuthenticated: () => void;
  /** OAuth error code surfaced from the callback (?error=). Page-only. */
  oauthError?: string | null;
  /** When provided, the "Sign up" footer renders as a button that switches
   *  the host's panel tab instead of a <Link> to /signup. */
  onSwitchToSignup?: () => void;
}

export default function LoginForm({
  redirectParam = "/dashboard",
  onAuthenticated,
  oauthError,
  onSwitchToSignup,
}: LoginFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, verifyTwoFactor, resendTwoFactorCode } = useAuth();
  const captcha = useTurnstile();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [magicLinkMode, setMagicLinkMode] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);

  const [twoFactor, setTwoFactor] = useState<{ requiresTwoFactor: true; email: string; expiresAt: string } | null>(null);
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    if (!captcha.ready) {
      setError(t("errors.captchaRequired"));
      setIsLoading(false);
      return;
    }
    try {
      const result = await login(email, password, false, captcha.token);
      if (result === true) { onAuthenticated(); return; }
      if (typeof result === "object" && result && (result as any).requiresEmailVerification) {
        navigate(`/verify-email?${new URLSearchParams({ email, redirect: redirectParam }).toString()}`);
        return;
      }
      if (typeof result === "object" && result && (result as any).requiresTwoFactor) {
        setTwoFactor(result as any);
      }
    } catch (err) {
      setError(t(mapAuthError(err).messageKey));
      captcha.reset();
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactor) return;
    setIsVerifying(true);
    setError("");
    try {
      const ok = await verifyTwoFactor(code.trim(), trustDevice);
      if (ok) { onAuthenticated(); } else { setError(t("errors.invalidCode")); }
    } catch { setError(t("errors.verificationFailed")); }
    finally { setIsVerifying(false); }
  };

  const handleResend = async () => {
    setError("");
    const sent = await resendTwoFactorCode();
    if (sent) { toast.success(t("messages.codeSentTitle"), { description: t("messages.codeSentBody") }); }
    else { setError(t("errors.resendFailed")); }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setMagicLinkLoading(true);
    setError("");
    try {
      await apiClient.request("/api/auth/magic-link", {
        method: "POST",
        body: { email, redirect: redirectParam, cfTurnstileToken: captcha.token },
        suppressErrorEvent: true,
      });
      setMagicLinkSent(true);
    } catch { setError(t("errors.magicLinkFailed")); }
    finally {
      captcha.reset();
      setMagicLinkLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {(error || oauthError) && (
        <Alert variant="destructive">
          <AlertDescription>
            {error || (oauthError === "auth_failed" ? t("errors.authFailed") : oauthError)}
          </AlertDescription>
        </Alert>
      )}

      {!twoFactor ? (
        <>
          <OAuthProviders mode="login" redirect={redirectParam} />

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><Separator className="w-full" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">{t("labels.continueWithEmail")}</span>
            </div>
          </div>

          <div className="flex gap-1 p-1 bg-muted rounded-md">
            <button type="button" onClick={() => { setMagicLinkMode(false); setMagicLinkSent(false); setError(""); }}
              className={`flex-1 py-1.5 text-sm rounded transition-colors ${!magicLinkMode ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
              {t("fields.password.label")}
            </button>
            <button type="button" onClick={() => { setMagicLinkMode(true); setMagicLinkSent(false); setError(""); }}
              className={`flex-1 py-1.5 text-sm rounded transition-colors ${magicLinkMode ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
              {t("labels.magicLink")}
            </button>
          </div>

          {magicLinkMode ? (
            magicLinkSent ? (
              <div className="text-center space-y-3 py-4">
                <Mail className="h-10 w-10 text-primary mx-auto" />
                <p className="font-medium">{t("headings.checkYourEmail")}</p>
                <p className="text-sm text-muted-foreground">
                  <Trans i18nKey="messages.magicLinkSent" values={{ email }} components={{ strong: <strong /> }} />
                </p>
                <Button variant="link" onClick={() => { setMagicLinkSent(false); setMagicLinkMode(false); }}>{t("actions.backToSignIn")}</Button>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <EmailField id="magic-email" value={email} onChange={setEmail} label={t("fields.email.label")} placeholder={t("fields.email.placeholder")} />
                <AuthCaptchaSlot captcha={captcha} />
                <Button type="submit" className="w-full min-h-[44px]" disabled={magicLinkLoading || !captcha.ready}>
                  {magicLinkLoading ? t("status.sending") : t("actions.sendSignInLink")}
                </Button>
              </form>
            )
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <EmailField id="email" value={email} onChange={setEmail} label={t("fields.email.label")} placeholder={t("fields.email.placeholder")} />
              <div className="space-y-2">
                <Label htmlFor="password">{t("fields.password.label")}</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} placeholder={t("fields.password.placeholder")} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
              </div>
              <AuthCaptchaSlot captcha={captcha} />
              <Button type="submit" className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 min-h-[44px]" disabled={isLoading || !captcha.ready}>
                {isLoading ? t("status.signingIn") : t("actions.signIn")}
              </Button>
            </form>
          )}
        </>
      ) : (
        <form onSubmit={handleVerifySubmit} className="space-y-4">
          <div className="text-sm text-muted-foreground">{t("messages.code2faIntro", { email: twoFactor.email })}</div>
          <div className="space-y-2">
            <Label htmlFor="code">{t("fields.verificationCode.label")}</Label>
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" placeholder={t("fields.verificationCode.placeholder")} value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="trustDevice" checked={trustDevice} onCheckedChange={(v) => setTrustDevice(v === true)} />
            <Label htmlFor="trustDevice" className="text-sm font-normal cursor-pointer">{t("labels.trustThisDevice")}</Label>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <Button type="submit" disabled={isVerifying} className="w-full sm:flex-1 min-h-[44px]">{isVerifying ? t("status.verifying") : t("actions.verify")}</Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={handleResend} className="flex-1 sm:flex-none min-h-[44px]">{t("actions.resend")}</Button>
              <Button type="button" variant="ghost" onClick={() => setTwoFactor(null)} className="flex-1 sm:flex-none min-h-[44px]">{t("actions.back")}</Button>
            </div>
          </div>
        </form>
      )}

      <div className="text-center space-y-2">
        {!twoFactor && !magicLinkMode && (
          <p className="text-sm text-muted-foreground">
            <Link to="/forgot-password" className="text-primary hover:underline font-medium">{t("prompts.forgotPassword")}</Link>
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {t("prompts.noAccount")}{" "}
          {onSwitchToSignup ? (
            <button type="button" onClick={onSwitchToSignup} className="text-primary hover:underline font-medium">
              {t("actions.signUp")}
            </button>
          ) : (
            <Link
              to={redirectParam && redirectParam !== "/dashboard" ? `/signup?redirectTo=${encodeURIComponent(safeRedirectTo(redirectParam, ""))}` : "/signup"}
              className="text-primary hover:underline font-medium"
            >
              {t("actions.signUp")}
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}

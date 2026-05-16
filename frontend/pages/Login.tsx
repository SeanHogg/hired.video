import { Eye, EyeOff, Mail, Check } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Trans, useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import OAuthProviders from "@/components/OAuthProviders";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { useAuth } from "@/lib/auth";
import { useTurnstile } from "@/lib/hooks/use-turnstile";
import { mapAuthError } from "@/lib/services/auth-errors";
import { apiClient } from "@/lib/api-client";

export default function Login() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get("redirect") || "/dashboard";
  const oauthError = searchParams.get("error");
  const { t } = useTranslation();

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

  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("actions.signIn"), url: "/login" }]);

  // FAQ JSON-LD is fed from translated copy so search engines see Spanish
  // questions/answers when crawled in es. Keys are stable; values localise.
  const loginFaq = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: t("faq.signIn.methodsQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signIn.methodsA") } },
      { "@type": "Question", name: t("faq.signIn.freeQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signIn.freeA") } },
      { "@type": "Question", name: t("faq.signIn.resetQ"), acceptedAnswer: { "@type": "Answer", text: t("faq.signIn.resetA") } },
    ],
  }), [t]);

  useEffect(() => {
    const id = "login-faq-jsonld";
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) { s = document.createElement("script"); s.type = "application/ld+json"; s.id = id; document.head.appendChild(s); }
    s.textContent = JSON.stringify(loginFaq);
    return () => { document.getElementById(id)?.remove(); };
  }, [loginFaq]);
  const { login, verifyTwoFactor, resendTwoFactorCode } = useAuth();
  const navigate = useNavigate();
  const captcha = useTurnstile();

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
      if (result === true) { navigate(redirectParam); return; }
      if (typeof result === "object" && result && (result as any).requiresEmailVerification) {
        navigate(`/verify-email?${new URLSearchParams({ email, redirect: redirectParam }).toString()}`);
        return;
      }
      if (typeof result === "object" && result && (result as any).requiresTwoFactor) {
        setTwoFactor(result as any);
        return;
      }
    } catch (err) {
      const mapped = mapAuthError(err);
      // TURNSTILE_FAIL recovery. If the captcha gate rejects (token
      // missing, timed out, or VITE_TURNSTILE_SITE_KEY isn't even set in
      // this build) we don't want to leave the user staring at a "solve
      // it again" error with no out. /api/auth/magic-link has no captcha
      // enforcement, so fire one to the email they already typed and
      // switch the form into the existing "we sent you a link" state.
      // Same surface the explicit magic-link tab uses — no second UI.
      if (mapped.code === "TURNSTILE_FAIL" && email) {
        try {
          // suppressErrorEvent so a backend hiccup on the rescue path doesn't
          // pile a second red toast on top of the (now suppressed) login error.
          await apiClient.request("/api/auth/magic-link", {
            method: "POST",
            body: { email, redirect: redirectParam },
            suppressErrorEvent: true,
          });
          setMagicLinkMode(true);
          setMagicLinkSent(true);
          setError("");
        } catch {
          setError(t(mapped.messageKey));
        }
      } else {
        setError(t(mapped.messageKey));
      }
      // Token is one-shot — reset so the user can retry without a soft-lock.
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
      if (ok) { navigate(redirectParam); } else { setError(t("errors.invalidCode")); }
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
        body: { email, redirect: redirectParam },
        suppressErrorEvent: true,
      });
      setMagicLinkSent(true);
    } catch { setError(t("errors.magicLinkFailed")); }
    finally { setMagicLinkLoading(false); }
  };

  return (
    <AppShell>
      <div className="flex items-center justify-center p-4">
          <div className="w-full max-w-5xl md:grid md:grid-cols-2 md:gap-8 md:items-center">
            <div>
            <Card>
              <CardHeader className="text-center">
                <h1 className="text-2xl font-semibold leading-none tracking-tight">{t("headings.welcomeBack")}</h1>
                <CardDescription>{t("headings.signInSubtitle")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
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
                            <Trans
                              i18nKey="messages.magicLinkSent"
                              values={{ email }}
                              components={{ strong: <strong /> }}
                            />
                          </p>
                          <Button variant="link" onClick={() => { setMagicLinkSent(false); setMagicLinkMode(false); }}>{t("actions.backToSignIn")}</Button>
                        </div>
                      ) : (
                        <form onSubmit={handleMagicLink} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="magic-email">{t("fields.email.label")}</Label>
                            <Input id="magic-email" type="email" placeholder={t("fields.email.placeholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
                          </div>
                          <Button type="submit" className="w-full min-h-[44px]" disabled={magicLinkLoading}>
                            {magicLinkLoading ? t("status.sending") : t("actions.sendSignInLink")}
                          </Button>
                        </form>
                      )
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="email">{t("fields.email.label")}</Label>
                          <Input id="email" type="email" placeholder={t("fields.email.placeholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="password">{t("fields.password.label")}</Label>
                          <div className="relative">
                            <Input id="password" type={showPassword ? "text" : "password"} placeholder={t("fields.password.placeholder")} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                              {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                            </Button>
                          </div>
                        </div>
                        {captcha.configured && (
                          <div className="flex justify-center pt-2">
                            <TurnstileWidget ref={captcha.ref} onToken={captcha.onToken} />
                          </div>
                        )}
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
                      <Label htmlFor="trustDevice" className="text-sm font-normal cursor-pointer">
                        {t("labels.trustThisDevice")}
                      </Label>
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
                    <Link to="/signup" className="text-primary hover:underline font-medium">{t("actions.signUp")}</Link>
                  </p>
                </div>
              </CardContent>
            </Card>
            </div>

            {/* Marketing panel — desktop only */}
            <div className="hidden md:flex flex-col justify-center bg-primary/5 rounded-2xl p-8 space-y-6">
              <h2 className="text-2xl font-bold tracking-tight">{t("marketing.signIn.title")}</h2>
              <p className="text-muted-foreground">{t("marketing.signIn.body")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">{t("marketing.signIn.stat.free")}</div>
                  <div className="text-xs text-muted-foreground">{t("marketing.noCreditCard")}</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">{t("marketing.signIn.stat.videoTime")}</div>
                  <div className="text-xs text-muted-foreground">{t("marketing.signIn.stat.videoTimeDesc")}</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">{t("marketing.signIn.stat.tools")}</div>
                  <div className="text-xs text-muted-foreground">{t("marketing.signIn.stat.toolsDesc")}</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">{t("marketing.signIn.stat.users")}</div>
                  <div className="text-xs text-muted-foreground">{t("marketing.signIn.stat.usersDesc")}</div>
                </div>
              </div>
              <ul className="space-y-2">
                {(["signInOptions", "magicLink", "dashboard", "scoringHistory"] as const).map((key) => (
                  <li key={key} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    <span>{t(`marketing.signIn.feature.${key}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
      </div>
    </AppShell>
  );
}

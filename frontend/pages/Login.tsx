import { Eye, EyeOff, Mail, Check } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Trans, useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
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
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import OAuthProviders from "@/components/OAuthProviders";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
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

  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("common.actions.signIn"), url: "/login" }]);
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  // FAQ JSON-LD is fed from translated copy so search engines see Spanish
  // questions/answers when crawled in es. Keys are stable; values localise.
  const loginFaq = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: t("auth.login.faq.methodsQ"), acceptedAnswer: { "@type": "Answer", text: t("auth.login.faq.methodsA") } },
      { "@type": "Question", name: t("auth.login.faq.freeQ"), acceptedAnswer: { "@type": "Answer", text: t("auth.login.faq.freeA") } },
      { "@type": "Question", name: t("auth.login.faq.resetQ"), acceptedAnswer: { "@type": "Answer", text: t("auth.login.faq.resetA") } },
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const result = await login(email, password);
      if (result === true) { navigate(redirectParam); return; }
      if (typeof result === "object" && result && (result as any).requiresEmailVerification) {
        navigate(`/verify-email?${new URLSearchParams({ email, redirect: redirectParam }).toString()}`);
        return;
      }
      if (typeof result === "object" && result && (result as any).requiresTwoFactor) {
        setTwoFactor(result as any);
        return;
      }
      setError(t("auth.login.errors.invalidCredentials"));
    } catch {
      setError(t("common.errors.generic"));
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
      const ok = await verifyTwoFactor(code.trim());
      if (ok) { navigate(redirectParam); } else { setError(t("auth.login.errors.invalidCode")); }
    } catch { setError(t("auth.login.errors.verificationFailed")); }
    finally { setIsVerifying(false); }
  };

  const handleResend = async () => {
    setError("");
    const sent = await resendTwoFactorCode();
    if (sent) { toast.success(t("auth.login.twofa.codeSentToastTitle"), { description: t("auth.login.twofa.codeSentToastBody") }); }
    else { setError(t("auth.login.errors.resendFailed")); }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setMagicLinkLoading(true);
    setError("");
    try {
      await apiClient.post("/api/auth/magic-link", { email, redirect: redirectParam });
      setMagicLinkSent(true);
    } catch { setError(t("auth.login.errors.magicLinkFailed")); }
    finally { setMagicLinkLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
        <div className="pt-16 min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-5xl md:grid md:grid-cols-2 md:gap-8 md:items-center">
            <div>
            <Card>
              <CardHeader className="text-center">
                <h1 className="text-2xl font-semibold leading-none tracking-tight">{t("auth.login.title")}</h1>
                <CardDescription>{t("auth.login.subtitle")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {(error || oauthError) && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {error || (oauthError === "auth_failed" ? t("common.errors.authFailed") : oauthError)}
                    </AlertDescription>
                  </Alert>
                )}

                {!twoFactor ? (
                  <>
                    <OAuthProviders mode="login" redirect={redirectParam} />

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><Separator className="w-full" /></div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">{t("auth.login.divider")}</span>
                      </div>
                    </div>

                    <div className="flex gap-1 p-1 bg-muted rounded-md">
                      <button type="button" onClick={() => { setMagicLinkMode(false); setMagicLinkSent(false); setError(""); }}
                        className={`flex-1 py-1.5 text-sm rounded transition-colors ${!magicLinkMode ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                        {t("common.fields.password")}
                      </button>
                      <button type="button" onClick={() => { setMagicLinkMode(true); setMagicLinkSent(false); setError(""); }}
                        className={`flex-1 py-1.5 text-sm rounded transition-colors ${magicLinkMode ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                        {t("auth.login.tabs.magicLink")}
                      </button>
                    </div>

                    {magicLinkMode ? (
                      magicLinkSent ? (
                        <div className="text-center space-y-3 py-4">
                          <Mail className="h-10 w-10 text-primary mx-auto" />
                          <p className="font-medium">{t("auth.login.magicLink.checkInbox")}</p>
                          <p className="text-sm text-muted-foreground">
                            <Trans
                              i18nKey="auth.login.magicLink.linkSent"
                              values={{ email }}
                              components={{ strong: <strong /> }}
                            />
                          </p>
                          <Button variant="link" onClick={() => { setMagicLinkSent(false); setMagicLinkMode(false); }}>{t("common.actions.backToSignIn")}</Button>
                        </div>
                      ) : (
                        <form onSubmit={handleMagicLink} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="magic-email">{t("common.fields.email")}</Label>
                            <Input id="magic-email" type="email" placeholder={t("common.fields.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
                          </div>
                          <Button type="submit" className="w-full min-h-[44px]" disabled={magicLinkLoading}>
                            {magicLinkLoading ? t("common.sending") : t("auth.login.magicLink.send")}
                          </Button>
                        </form>
                      )
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="email">{t("common.fields.email")}</Label>
                          <Input id="email" type="email" placeholder={t("common.fields.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="password">{t("common.fields.password")}</Label>
                          <div className="relative">
                            <Input id="password" type={showPassword ? "text" : "password"} placeholder={t("common.fields.passwordPlaceholder")} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                              {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                            </Button>
                          </div>
                        </div>
                        <Button type="submit" className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 min-h-[44px]" disabled={isLoading}>
                          {isLoading ? t("auth.login.submitting") : t("common.actions.signIn")}
                        </Button>
                      </form>
                    )}
                  </>
                ) : (
                  <form onSubmit={handleVerifySubmit} className="space-y-4">
                    <div className="text-sm text-muted-foreground">{t("auth.login.twofa.intro", { email: twoFactor.email })}</div>
                    <div className="space-y-2">
                      <Label htmlFor="code">{t("auth.login.twofa.codeLabel")}</Label>
                      <Input id="code" inputMode="numeric" autoComplete="one-time-code" placeholder={t("auth.login.twofa.codePlaceholder")} value={code} onChange={(e) => setCode(e.target.value)} required />
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <Button type="submit" disabled={isVerifying} className="w-full sm:flex-1 min-h-[44px]">{isVerifying ? t("auth.login.twofa.verifying") : t("auth.login.twofa.verify")}</Button>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <Button type="button" variant="outline" onClick={handleResend} className="flex-1 sm:flex-none min-h-[44px]">{t("auth.login.twofa.resend")}</Button>
                        <Button type="button" variant="ghost" onClick={() => setTwoFactor(null)} className="flex-1 sm:flex-none min-h-[44px]">{t("auth.login.twofa.back")}</Button>
                      </div>
                    </div>
                  </form>
                )}

                <div className="text-center space-y-2">
                  {!twoFactor && !magicLinkMode && (
                    <p className="text-sm text-muted-foreground">
                      <Link to="/forgot-password" className="text-primary hover:underline font-medium">{t("auth.login.forgotPassword")}</Link>
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {t("common.prompts.noAccount")}{" "}
                    <Link to="/signup" className="text-primary hover:underline font-medium">{t("common.actions.signUp")}</Link>
                  </p>
                </div>
              </CardContent>
            </Card>
            </div>

            {/* Marketing panel — desktop only */}
            <div className="hidden md:flex flex-col justify-center bg-primary/5 rounded-2xl p-8 space-y-6">
              <h2 className="text-2xl font-bold tracking-tight">{t("auth.login.marketing.title")}</h2>
              <p className="text-muted-foreground">{t("auth.login.marketing.body")}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">{t("auth.login.marketing.stats.free")}</div>
                  <div className="text-xs text-muted-foreground">{t("auth.login.marketing.stats.freeDesc")}</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">{t("auth.login.marketing.stats.videoTime")}</div>
                  <div className="text-xs text-muted-foreground">{t("auth.login.marketing.stats.videoTimeDesc")}</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">{t("auth.login.marketing.stats.tools")}</div>
                  <div className="text-xs text-muted-foreground">{t("auth.login.marketing.stats.toolsDesc")}</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">{t("auth.login.marketing.stats.users")}</div>
                  <div className="text-xs text-muted-foreground">{t("auth.login.marketing.stats.usersDesc")}</div>
                </div>
              </div>
              <ul className="space-y-2">
                {(["signinOptions", "magicLink", "dashboard", "scoringHistory"] as const).map((key) => (
                  <li key={key} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    <span>{t(`login.marketing.features.${key}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}

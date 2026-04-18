import { Eye, EyeOff, Mail, Check } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
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
  CardTitle,
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
  useBreadcrumbs([{ name: "Login", url: "/login" }]);
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  // FAQPage JSON-LD for login page
  const loginFaq = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: "What sign-in methods does hired.video support?", acceptedAnswer: { "@type": "Answer", text: "hired.video supports sign-in via Google, LinkedIn, GitHub, Microsoft, email/password, and passwordless magic links. All methods are free." } },
      { "@type": "Question", name: "Is hired.video free to use?", acceptedAnswer: { "@type": "Answer", text: "Yes. hired.video is free to start with AI resume scoring, one published video resume, job matching, and 50K AI tokens per month. The Pro plan ($9.95/mo) unlocks unlimited features." } },
      { "@type": "Question", name: "How do I reset my password?", acceptedAnswer: { "@type": "Answer", text: "Click 'Forgot your password?' on the login page, enter your email, and you'll receive a reset link. You can also use passwordless magic link sign-in as an alternative." } },
    ],
  }), []);

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
      setError("Invalid email or password. Please try again.");
    } catch {
      setError("An error occurred. Please try again.");
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
      if (ok) { navigate(redirectParam); } else { setError("Invalid or expired code. Please try again."); }
    } catch { setError("Verification failed. Please try again."); }
    finally { setIsVerifying(false); }
  };

  const handleResend = async () => {
    setError("");
    const sent = await resendTwoFactorCode();
    if (sent) { toast.success("Code sent", { description: "A new code was sent to your email." }); }
    else { setError("Failed to resend. Please wait and try again."); }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setMagicLinkLoading(true);
    setError("");
    try {
      await apiClient.post("/api/auth/magic-link", { email, redirect: redirectParam });
      setMagicLinkSent(true);
    } catch { setError("Failed to send sign-in link. Please try again."); }
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
                <h1 className="text-2xl font-semibold leading-none tracking-tight">Welcome back</h1>
                <CardDescription>Sign in to your hired.video account</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {(error || oauthError) && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {error || (oauthError === "auth_failed" ? "Authentication failed. Please try again." : oauthError)}
                    </AlertDescription>
                  </Alert>
                )}

                {!twoFactor ? (
                  <>
                    <OAuthProviders mode="login" redirect={redirectParam} />

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><Separator className="w-full" /></div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">Or continue with email</span>
                      </div>
                    </div>

                    <div className="flex gap-1 p-1 bg-muted rounded-md">
                      <button type="button" onClick={() => { setMagicLinkMode(false); setMagicLinkSent(false); setError(""); }}
                        className={`flex-1 py-1.5 text-sm rounded transition-colors ${!magicLinkMode ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                        Password
                      </button>
                      <button type="button" onClick={() => { setMagicLinkMode(true); setMagicLinkSent(false); setError(""); }}
                        className={`flex-1 py-1.5 text-sm rounded transition-colors ${magicLinkMode ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                        Magic Link
                      </button>
                    </div>

                    {magicLinkMode ? (
                      magicLinkSent ? (
                        <div className="text-center space-y-3 py-4">
                          <Mail className="h-10 w-10 text-primary mx-auto" />
                          <p className="font-medium">Check your inbox</p>
                          <p className="text-sm text-muted-foreground">We sent a sign-in link to <strong>{email}</strong>. It expires in 15 minutes.</p>
                          <Button variant="link" onClick={() => { setMagicLinkSent(false); setMagicLinkMode(false); }}>Back to sign in</Button>
                        </div>
                      ) : (
                        <form onSubmit={handleMagicLink} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="magic-email">Email</Label>
                            <Input id="magic-email" type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                          </div>
                          <Button type="submit" className="w-full min-h-[44px]" disabled={magicLinkLoading}>
                            {magicLinkLoading ? "Sending..." : "Send sign-in link"}
                          </Button>
                        </form>
                      )
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="email">Email</Label>
                          <Input id="email" type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="password">Password</Label>
                          <div className="relative">
                            <Input id="password" type={showPassword ? "text" : "password"} placeholder="Enter your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
                              {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                            </Button>
                          </div>
                        </div>
                        <Button type="submit" className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 min-h-[44px]" disabled={isLoading}>
                          {isLoading ? "Signing in..." : "Sign in"}
                        </Button>
                      </form>
                    )}
                  </>
                ) : (
                  <form onSubmit={handleVerifySubmit} className="space-y-4">
                    <div className="text-sm text-muted-foreground">We sent a code to {twoFactor.email}. Enter it to finish signing in.</div>
                    <div className="space-y-2">
                      <Label htmlFor="code">Verification Code</Label>
                      <Input id="code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} required />
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <Button type="submit" disabled={isVerifying} className="w-full sm:flex-1 min-h-[44px]">{isVerifying ? "Verifying..." : "Verify"}</Button>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <Button type="button" variant="outline" onClick={handleResend} className="flex-1 sm:flex-none min-h-[44px]">Resend</Button>
                        <Button type="button" variant="ghost" onClick={() => setTwoFactor(null)} className="flex-1 sm:flex-none min-h-[44px]">Back</Button>
                      </div>
                    </div>
                  </form>
                )}

                <div className="text-center space-y-2">
                  {!twoFactor && !magicLinkMode && (
                    <p className="text-sm text-muted-foreground">
                      <Link to="/forgot-password" className="text-primary hover:underline font-medium">Forgot your password?</Link>
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <Link to="/signup" className="text-primary hover:underline font-medium">Sign up</Link>
                  </p>
                </div>
              </CardContent>
            </Card>
            </div>

            {/* Marketing panel — desktop only */}
            <div className="hidden md:flex flex-col justify-center bg-primary/5 rounded-2xl p-8 space-y-6">
              <h2 className="text-2xl font-bold tracking-tight">Your career tools are waiting</h2>
              <p className="text-muted-foreground">
                Sign in to access your AI video resumes, resume scoring history, job matches, and career dashboard — all in one place.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">Free</div>
                  <div className="text-xs text-muted-foreground">No credit card needed</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">60s</div>
                  <div className="text-xs text-muted-foreground">AI video resume</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">10+</div>
                  <div className="text-xs text-muted-foreground">AI career tools</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-primary">50K+</div>
                  <div className="text-xs text-muted-foreground">Professionals</div>
                </div>
              </div>
              <ul className="space-y-2">
                {["4 sign-in options (Google, LinkedIn, GitHub, Microsoft)", "Passwordless magic link", "AI-powered career dashboard", "Resume scoring & optimization history"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    <span>{f}</span>
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

import { Eye, EyeOff, Mail } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useSEO } from "@/lib/seo";
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
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "/api";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const LinkedInIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#0077B5" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const GitHubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
  </svg>
);

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M11.4 11.4H0V0h11.4v11.4z" fill="#F25022" />
    <path d="M24 11.4H12.6V0H24v11.4z" fill="#7FBA00" />
    <path d="M11.4 24H0V12.6h11.4V24z" fill="#00A4EF" />
    <path d="M24 24H12.6V12.6H24V24z" fill="#FFB900" />
  </svg>
);

function OAuthButton({ provider, label, icon, redirect }: { provider: string; label: string; icon: React.ReactNode; redirect: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full flex items-center gap-2 min-h-[44px]"
      onClick={() => { window.location.href = `${API_BASE}/api/auth/oauth/${provider}?redirect=${encodeURIComponent(redirect)}`; }}
    >
      {icon}
      {label}
    </Button>
  );
}

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
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
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
          <div className="w-full max-w-md">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Welcome back</CardTitle>
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
                    <div className="space-y-2">
                      <OAuthButton provider="google" label="Continue with Google" icon={<GoogleIcon />} redirect={redirectParam} />
                      <OAuthButton provider="linkedin" label="Continue with LinkedIn" icon={<LinkedInIcon />} redirect={redirectParam} />
                      <OAuthButton provider="github" label="Continue with GitHub" icon={<GitHubIcon />} redirect={redirectParam} />
                      <OAuthButton provider="microsoft" label="Continue with Microsoft" icon={<MicrosoftIcon />} redirect={redirectParam} />
                    </div>

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
                            <Input id="password" type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
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
        </div>
        <Footer />
      </div>
    </div>
  );
}

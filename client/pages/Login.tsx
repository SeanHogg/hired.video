import { Video, Sparkles, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
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
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

export default function Login() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirectParam = searchParams.get("redirect") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [twoFactor, setTwoFactor] = useState<
    | { requiresTwoFactor: true; email: string; expiresAt: string }
    | null
  >(null);
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  // SEO for login page
  useSEO(location.pathname);
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  const { login, verifyTwoFactor, resendTwoFactorCode } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Login.handleSubmit: Form submitted");
    setIsLoading(true);
    setError("");

    try {
      console.log("Login.handleSubmit: Calling login with", { email });
      const result = await login(email, password);
      console.log("Login.handleSubmit: Login result:", result);

      if (result === true) {
        console.log(
          "Login.handleSubmit: Login successful, navigating to dashboard",
        );
        navigate(redirectParam);
        return;
      }

      if (typeof result === "object" && result && (result as any).requiresEmailVerification) {
        console.log("Login.handleSubmit: Email verification required, redirecting to verify page", result);
        const params = new URLSearchParams({ email, redirect: redirectParam });
        navigate(`/verify-email?${params.toString()}`);
        return;
      }

      if (typeof result === "object" && result && (result as any).requiresTwoFactor) {
        console.log("Login.handleSubmit: Two-factor required", result);
        setTwoFactor(result as { requiresTwoFactor: true; email: string; expiresAt: string });
        setError("");
        return;
      }

      console.log("Login.handleSubmit: Login failed, setting error");
      setError("Invalid email or password. Please try again.");
    } catch (err) {
      console.error("Login.handleSubmit: Exception caught:", err);
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
      if (ok) {
        navigate(redirectParam);
      } else {
        setError("Invalid or expired verification code. Please try again.");
      }
    } catch (err) {
      setError("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setError("");
    const sent = await resendTwoFactorCode();
    if (!sent) {
      setError("Failed to resend code. Please wait a moment and try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16 min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Welcome back</CardTitle>
                <CardDescription>
                  Sign in to your MyVideoResume account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {!twoFactor ? (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 min-h-[44px]"
                      disabled={isLoading}
                    >
                      {isLoading ? "Signing in..." : "Sign in"}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifySubmit} className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      We've sent a verification code to {twoFactor.email}. Enter it below to finish signing in.
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="code">Verification Code</Label>
                      <Input
                        id="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="Enter the 6-digit code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <Button type="submit" disabled={isVerifying} className="w-full sm:flex-1 min-h-[44px]">
                        {isVerifying ? "Verifying..." : "Verify"}
                      </Button>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <Button type="button" variant="outline" onClick={handleResend} className="flex-1 sm:flex-none min-h-[44px]">
                          Resend code
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setTwoFactor(null)} className="flex-1 sm:flex-none min-h-[44px]">
                          Back
                        </Button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Demo accounts removed */}

                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    <Link
                      to="/forgot-password"
                      className="text-primary hover:underline font-medium"
                    >
                      Forgot your password?
                    </Link>
                  </p>

                  <p className="text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <Link
                      to="/signup"
                      className="text-primary hover:underline font-medium"
                    >
                      Sign up
                    </Link>
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

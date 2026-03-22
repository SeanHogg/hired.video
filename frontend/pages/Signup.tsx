import {
  Eye,
  EyeOff,
  User,
  Mail,
  Lock,
  Users,
  Briefcase,
  Building2,
} from "lucide-react";
import { useState, useEffect } from "react";
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
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth, type UserRole, USER_ROLES } from "@/lib/auth";

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
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M11.4 11.4H0V0h11.4v11.4z" fill="#F25022"/>
    <path d="M24 11.4H12.6V0H24v11.4z" fill="#7FBA00"/>
    <path d="M11.4 24H0V12.6h11.4V24z" fill="#00A4EF"/>
    <path d="M24 24H12.6V12.6H24V24z" fill="#FFB900"/>
  </svg>
);

function OAuthSignupButton({ provider, label, icon }: { provider: string; label: string; icon: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full flex items-center gap-2 min-h-[44px]"
      onClick={() => { window.location.href = `${API_BASE}/api/auth/oauth/${provider}?redirect=/dashboard`; }}
    >
      {icon}
      {label}
    </Button>
  );
}

export default function Signup() {
  const location = useLocation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>(USER_ROLES.JOB_SEEKER);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [referralCode, setReferralCode] = useState("");

  // Handle URL parameters for role pre-selection
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const roleParam = searchParams.get("role");
    if (roleParam === "recruiter") {
      setRole(USER_ROLES.RECRUITER);
    } else if (roleParam === "employer") {
      setRole(USER_ROLES.EMPLOYER);
    }
  }, [location.search]);

  // Capture referral code from URL (?ref=CODE) and persist; fallback to stored value
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const code = searchParams.get("ref");
    if (code) {
      setReferralCode(code);
      try {
        sessionStorage.setItem("ref", code);
      } catch {
        // no-op
      }
    } else {
      try {
        const stored = sessionStorage.getItem("ref");
        if (stored) {
          setReferralCode(stored);
        }
      } catch {
        // no-op
      }
    }
  }, [location.search]);

  // SEO for signup page
  useSEO(location.pathname);
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Validation
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      setIsLoading(false);
      return;
    }

    try {
      const success = await signup(email, password, firstName, lastName, role, referralCode || undefined);
      if (success) {
        // Redirect to success page with email confirmation instructions
        navigate(
          `/signup-success?email=${encodeURIComponent(email)}&firstName=${encodeURIComponent(firstName)}`,
        );
      } else {
        setError(
          "Account with this email already exists. Please sign in instead.",
        );
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
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
                <CardTitle className="text-2xl">Create your account</CardTitle>
                <CardDescription>
                  Join hired.video and start building your career
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* OAuth sign-up */}
                <div className="space-y-2">
                  <OAuthSignupButton provider="google" label="Sign up with Google" icon={<GoogleIcon />} />
                  <OAuthSignupButton provider="linkedin" label="Sign up with LinkedIn" icon={<LinkedInIcon />} />
                  <OAuthSignupButton provider="github" label="Sign up with GitHub" icon={<GitHubIcon />} />
                  <OAuthSignupButton provider="microsoft" label="Sign up with Microsoft" icon={<MicrosoftIcon />} />
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or sign up with email</span>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="firstName"
                          type="text"
                          placeholder="Enter your first name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="lastName"
                          type="text"
                          placeholder="Enter your last name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  {/* Persona selection */}
                  <div className="space-y-2">
                    <Label>Registering as</Label>
                    <div className="p-[2px] rounded-lg sm:rounded-full bg-gradient-to-r from-brand-purple to-brand-blue w-full">
                      <div className="bg-background rounded-lg sm:rounded-full p-1">
                        <ToggleGroup
                          type="single"
                          value={role}
                          onValueChange={(v) => v && setRole(v as UserRole)}
                          className="grid grid-cols-1 sm:grid-cols-3 gap-1 w-full"
                        >
                          <ToggleGroupItem
                            value={USER_ROLES.JOB_SEEKER}
                            className="rounded-lg sm:rounded-full px-3 py-2 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white min-h-[44px] flex-1"
                          >
                            <Users className="h-4 w-4 mr-2" /> Job Seeker
                          </ToggleGroupItem>
                          <ToggleGroupItem
                            value={USER_ROLES.RECRUITER}
                            className="rounded-lg sm:rounded-full px-3 py-2 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white min-h-[44px] flex-1"
                          >
                            <Briefcase className="h-4 w-4 mr-2" /> Recruiter
                          </ToggleGroupItem>
                          <ToggleGroupItem
                            value={USER_ROLES.EMPLOYER}
                            className="rounded-lg sm:rounded-full px-3 py-2 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white min-h-[44px] flex-1"
                          >
                            <Building2 className="h-4 w-4 mr-2" /> Employer
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                    </div>
                  </div>

	                  <div className="text-sm text-muted-foreground">
	                    Interested in becoming an affiliate?{" "}
	                    <Link to="/affiliate-program" className="text-primary hover:underline">
	                      Sign up on the affiliate page
	                    </Link>.
	                  </div>


                  {/* Referral code */}
                  <div className="space-y-2">
                    <Label htmlFor="referralCode">Referral Code (optional)</Label>
                    <Input
                      id="referralCode"
                      type="text"


                      placeholder="Have a referral code? Enter it here"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                    />
                  </div>


                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"


                        type={showPassword ? "text" : "password"}
                        placeholder="Create a password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
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

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10 pr-10"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                      >
                        {showConfirmPassword ? (
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
                    {isLoading ? "Creating account..." : "Create Account"}
                  </Button>
                </form>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link
                      to="/login"
                      className="text-primary hover:underline font-medium"
                    >
                      Sign in
                    </Link>
                  </p>
                </div>

                <div className="text-xs text-center text-muted-foreground">
                  By creating an account, you agree to our{" "}
                  <Link to="/terms" className="text-primary hover:underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link to="/privacy" className="text-primary hover:underline">
                    Privacy Policy
                  </Link>
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

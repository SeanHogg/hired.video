import {
  Eye,
  EyeOff,
  User,
  Mail,
  Lock,
  Users,
  Briefcase,
  Building2,
  Check,
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { TurnstileWidget } from "@/components/TurnstileWidget";
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
import OAuthProviders from "@/components/OAuthProviders";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth, type UserRole, USER_ROLES } from "@/lib/auth";
import { trackSignUp } from "@/lib/gtm";

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
  // Cloudflare Turnstile token. Empty string is the sentinel for "no
  // captcha configured" — TurnstileWidget emits "" immediately when
  // VITE_TURNSTILE_SITE_KEY is unset, so dev/local signups still work.
  const [cfTurnstileToken, setCfTurnstileToken] = useState<string | null>(null);
  const handleTurnstileToken = useCallback((token: string) => {
    setCfTurnstileToken(token);
  }, []);
  const turnstileConfigured = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);
  const captchaReady = !turnstileConfigured || (cfTurnstileToken !== null && cfTurnstileToken !== "");

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
  useBreadcrumbs([{ name: "Sign Up", url: "/signup" }]);

  // FAQPage JSON-LD for signup page
  const signupFaq = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: "Is hired.video free to sign up?", acceptedAnswer: { "@type": "Answer", text: "Yes. hired.video is completely free to start. You get AI resume scoring, one published video resume, job matching (5/month), 50K AI tokens/month, and access to all 10+ career tools. No credit card required." } },
      { "@type": "Question", name: "How long does it take to set up?", acceptedAnswer: { "@type": "Answer", text: "Under 2 minutes. Sign up with Google, LinkedIn, GitHub, or email, choose your role (Job Seeker, Recruiter, or Employer), and you're in. You can create your first AI video resume in 60 seconds." } },
      { "@type": "Question", name: "What sign-up methods are available?", acceptedAnswer: { "@type": "Answer", text: "hired.video supports sign-up via Google, LinkedIn, GitHub, Microsoft, or email/password. All methods are free and give you immediate access to the platform." } },
      { "@type": "Question", name: "What's included in the free plan?", acceptedAnswer: { "@type": "Answer", text: "The free plan includes: 1 published AI video resume, ATS-friendly resume builder, Chrome extension for job tracking, AI tools (resume scorer, optimizer, salary calculator, and more), career dashboard, job matching, and unlimited networking. Pro ($9.95/mo) adds unlimited videos, voice cloning, 1080p export, and 1M AI tokens/month." } },
    ],
  }), []);

  useEffect(() => {
    const id = "signup-faq-jsonld";
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) { s = document.createElement("script"); s.type = "application/ld+json"; s.id = id; document.head.appendChild(s); }
    s.textContent = JSON.stringify(signupFaq);
    return () => { document.getElementById(id)?.remove(); };
  }, [signupFaq]);

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

    if (turnstileConfigured && !cfTurnstileToken) {
      setError("Please complete the captcha challenge before submitting.");
      setIsLoading(false);
      return;
    }

    try {
      const success = await signup(
        email,
        password,
        firstName,
        lastName,
        role,
        referralCode || undefined,
        undefined,
        cfTurnstileToken ?? undefined,
      );
      if (success) {
        trackSignUp("email");
        // Carry any ?redirect=<tool-path> forward so the user returns to the
        // tool they were using when prompted to sign up.
        const search = new URLSearchParams(location.search);
        const redirect = search.get("redirect");
        const successParams = new URLSearchParams({
          email,
          firstName,
          ...(redirect ? { redirect } : {}),
        });
        navigate(`/signup-success?${successParams.toString()}`);
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
          <div className="w-full max-w-5xl md:grid md:grid-cols-2 md:gap-8 md:items-center">
            <div>
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Create your free account</CardTitle>
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
                <OAuthProviders mode="signup" />

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
                        autoComplete="new-password"
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
                        autoComplete="new-password"
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

                  {turnstileConfigured && (
                    <div className="flex justify-center pt-2">
                      <TurnstileWidget onToken={handleTurnstileToken} />
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 min-h-[44px]"
                    disabled={isLoading || !captchaReady}
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

            {/* Marketing panel — hidden on mobile, updates with selected role */}
            <div className="hidden md:flex flex-col justify-center bg-primary/5 rounded-2xl p-8 space-y-8">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {role === USER_ROLES.RECRUITER
                    ? "Find top talent faster with AI"
                    : role === USER_ROLES.EMPLOYER
                      ? "Build your employer brand with AI"
                      : "Start building your career with AI"}
                </h2>
                <p className="mt-3 text-muted-foreground">
                  {role === USER_ROLES.RECRUITER
                    ? "Join thousands of recruiters using hired.video to discover candidates through AI video resumes, score applicants instantly, and fill roles faster."
                    : role === USER_ROLES.EMPLOYER
                      ? "Showcase your company culture, post jobs, and attract top candidates with AI-powered employer branding and video job descriptions."
                      : "Join 50,000+ professionals using hired.video to create video resumes, score and optimize their resumes with AI, and connect with recruiters who are actively hiring."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {(role === USER_ROLES.RECRUITER
                  ? [
                      { stat: "Free to start", desc: "No credit card required" },
                      { stat: "AI matching", desc: "Candidate-job fit scoring" },
                      { stat: "Video resumes", desc: "See candidates in action" },
                      { stat: "50K+ users", desc: "Growing talent pool" },
                    ]
                  : role === USER_ROLES.EMPLOYER
                    ? [
                        { stat: "Free to start", desc: "No credit card required" },
                        { stat: "Company page", desc: "Branded employer profile" },
                        { stat: "AI job posts", desc: "Generate listings in seconds" },
                        { stat: "50K+ users", desc: "Professionals and recruiters" },
                      ]
                    : [
                        { stat: "Free to start", desc: "No credit card required" },
                        { stat: "60 seconds", desc: "To create a video resume" },
                        { stat: "10+ AI tools", desc: "Resume scorer, optimizer, tailor & more" },
                        { stat: "50K+ users", desc: "Professionals and recruiters" },
                      ]
                ).map((item) => (
                  <div key={item.stat} className="bg-background rounded-xl p-4 shadow-sm">
                    <p className="text-lg font-semibold">{item.stat}</p>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {(role === USER_ROLES.RECRUITER
                  ? [
                      "AI candidate scoring and ranking",
                      "Video resume screening",
                      "Applicant tracking integration",
                      "Chrome extension for LinkedIn sourcing",
                    ]
                  : role === USER_ROLES.EMPLOYER
                    ? [
                        "Branded company profile page",
                        "AI-generated job descriptions",
                        "Video job postings",
                        "Candidate pipeline dashboard",
                      ]
                    : [
                        "AI video resume in 60 seconds",
                        "Free ATS resume scoring",
                        "AI job-resume matching",
                        "Chrome extension for job boards",
                      ]
                ).map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}

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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
  useBreadcrumbs([{ name: t("common.actions.signUp"), url: "/signup" }]);

  // Locale-aware FAQ JSON-LD — search engines see Spanish copy when crawled in es.
  const signupFaq = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: t("auth.signup.faq.freeQ"), acceptedAnswer: { "@type": "Answer", text: t("auth.signup.faq.freeA") } },
      { "@type": "Question", name: t("auth.signup.faq.setupQ"), acceptedAnswer: { "@type": "Answer", text: t("auth.signup.faq.setupA") } },
      { "@type": "Question", name: t("auth.signup.faq.methodsQ"), acceptedAnswer: { "@type": "Answer", text: t("auth.signup.faq.methodsA") } },
      { "@type": "Question", name: t("auth.signup.faq.planQ"), acceptedAnswer: { "@type": "Answer", text: t("auth.signup.faq.planA") } },
    ],
  }), [t]);

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

  // Map persona role → marketing copy variant key in catalogue
  const marketingKey = role === USER_ROLES.RECRUITER
    ? "recruiter"
    : role === USER_ROLES.EMPLOYER
      ? "employer"
      : "jobSeeker";

  // Stat tiles per persona — keys live under signup.marketing.stats; we
  // pick the right combination per role so translators only manage strings.
  const statTiles: { stat: string; desc: string }[] = useMemo(() => {
    if (role === USER_ROLES.RECRUITER) {
      return [
        { stat: t("auth.signup.marketing.stats.freeStat"), desc: t("auth.signup.marketing.stats.freeDesc") },
        { stat: t("auth.signup.marketing.stats.matching"), desc: t("auth.signup.marketing.stats.matchingDesc") },
        { stat: t("chrome.labels.resumes"), desc: t("auth.signup.marketing.stats.videoResDesc") },
        { stat: t("auth.signup.marketing.stats.users"), desc: t("auth.signup.marketing.stats.usersDescTalent") },
      ];
    }
    if (role === USER_ROLES.EMPLOYER) {
      return [
        { stat: t("auth.signup.marketing.stats.freeStat"), desc: t("auth.signup.marketing.stats.freeDesc") },
        { stat: t("auth.signup.marketing.stats.companyPage"), desc: t("auth.signup.marketing.stats.companyPageDesc") },
        { stat: t("auth.signup.marketing.stats.aiJobPosts"), desc: t("auth.signup.marketing.stats.aiJobPostsDesc") },
        { stat: t("auth.signup.marketing.stats.users"), desc: t("auth.signup.marketing.stats.usersDescPros") },
      ];
    }
    return [
      { stat: t("auth.signup.marketing.stats.freeStat"), desc: t("auth.signup.marketing.stats.freeDesc") },
      { stat: t("auth.signup.marketing.stats.videoTime"), desc: t("auth.signup.marketing.stats.videoTimeDesc") },
      { stat: t("auth.signup.marketing.stats.tools"), desc: t("auth.signup.marketing.stats.toolsDesc") },
      { stat: t("auth.signup.marketing.stats.users"), desc: t("auth.signup.marketing.stats.usersDescPros") },
    ];
  }, [role, t]);

  // Feature lists are arrays in the catalogue — i18next returns them via
  // returnObjects:true so we can map over them like normal data.
  const features = (t(`auth.signup.marketing.features.${marketingKey}`, { returnObjects: true }) as string[]) ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    // Validation
    if (password !== confirmPassword) {
      setError(t("common.prompts.passwordsMismatch"));
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError(t("auth.signup.errors.passwordTooShort"));
      setIsLoading(false);
      return;
    }

    if (turnstileConfigured && !cfTurnstileToken) {
      setError(t("auth.signup.errors.captchaRequired"));
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
        setError(t("auth.signup.errors.emailExists"));
      }
    } catch (err) {
      setError(t("common.errors.generic"));
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
                <CardTitle className="text-2xl">{t("auth.signup.title")}</CardTitle>
                <CardDescription>{t("auth.signup.subtitle")}</CardDescription>
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
                    <span className="bg-card px-2 text-muted-foreground">{t("auth.signup.divider")}</span>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">{t("auth.signup.fields.firstNameLabel")}</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="firstName"
                          type="text"
                          placeholder={t("auth.signup.fields.firstNamePlaceholder")}
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">{t("auth.signup.fields.lastNameLabel")}</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="lastName"
                          type="text"
                          placeholder={t("auth.signup.fields.lastNamePlaceholder")}
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">{t("common.fields.email")}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder={t("common.fields.emailPlaceholder")}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  {/* Persona selection */}
                  <div className="space-y-2">
                    <Label>{t("auth.signup.personaLabel")}</Label>
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
                            <Users className="h-4 w-4 mr-2" /> {t("auth.signup.personas.jobSeeker")}
                          </ToggleGroupItem>
                          <ToggleGroupItem
                            value={USER_ROLES.RECRUITER}
                            className="rounded-lg sm:rounded-full px-3 py-2 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white min-h-[44px] flex-1"
                          >
                            <Briefcase className="h-4 w-4 mr-2" /> {t("auth.signup.personas.recruiter")}
                          </ToggleGroupItem>
                          <ToggleGroupItem
                            value={USER_ROLES.EMPLOYER}
                            className="rounded-lg sm:rounded-full px-3 py-2 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white min-h-[44px] flex-1"
                          >
                            <Building2 className="h-4 w-4 mr-2" /> {t("auth.signup.personas.employer")}
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                    </div>
                  </div>

	                  <div className="text-sm text-muted-foreground">
	                    {t("auth.signup.affiliate")}{" "}
	                    <Link to="/affiliate-program" className="text-primary hover:underline">
	                      {t("auth.signup.affiliateLink")}
	                    </Link>.
	                  </div>


                  {/* Referral code */}
                  <div className="space-y-2">
                    <Label htmlFor="referralCode">{t("auth.signup.fields.referralLabel")}</Label>
                    <Input
                      id="referralCode"
                      type="text"


                      placeholder={t("auth.signup.fields.referralPlaceholder")}
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                    />
                  </div>


                  <div className="space-y-2">
                    <Label htmlFor="password">{t("common.fields.password")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"


                        type={showPassword ? "text" : "password"}
                        placeholder={t("auth.signup.fields.passwordPlaceholder")}
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
                    <Label htmlFor="confirmPassword">{t("auth.signup.fields.confirmPasswordLabel")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder={t("auth.signup.fields.confirmPasswordPlaceholder")}
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
                    {isLoading ? t("auth.signup.submitting") : t("common.actions.createAccount")}
                  </Button>
                </form>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("auth.signup.haveAccount")}{" "}
                    <Link
                      to="/login"
                      className="text-primary hover:underline font-medium"
                    >
                      {t("common.actions.signIn")}
                    </Link>
                  </p>
                </div>

                <div className="text-xs text-center text-muted-foreground">
                  {t("auth.signup.legal.agree")}{" "}
                  <Link to="/terms" className="text-primary hover:underline">
                    {t("auth.signup.legal.tos")}
                  </Link>{" "}
                  {t("auth.signup.legal.and")}{" "}
                  <Link to="/privacy" className="text-primary hover:underline">
                    {t("auth.signup.legal.privacy")}
                  </Link>
                </div>
              </CardContent>
            </Card>
            </div>

            {/* Marketing panel — hidden on mobile, updates with selected role */}
            <div className="hidden md:flex flex-col justify-center bg-primary/5 rounded-2xl p-8 space-y-8">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  {t(`auth.signup.marketing.titles.${marketingKey}`)}
                </h2>
                <p className="mt-3 text-muted-foreground">
                  {t(`auth.signup.marketing.bodies.${marketingKey}`)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {statTiles.map((item) => (
                  <div key={item.stat} className="bg-background rounded-xl p-4 shadow-sm">
                    <p className="text-lg font-semibold">{item.stat}</p>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {features.map((feature) => (
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

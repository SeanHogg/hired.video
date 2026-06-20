/**
 * SignupForm — the inner create-account form, extracted from [pages/Signup.tsx]
 * so one implementation backs BOTH the `/signup` route and the in-place auth
 * panel the Studio conversion gate opens ([AuthGatePanel]). Renders only the
 * form body; the page wraps it in <Card>/<AppShell>/<RegisterGate>, the gate
 * wraps it in a <Sheet>.
 *
 * Registration intentionally does NOT establish a session (the backend requires
 * email verification first). So in the gate flow we can't claim the visitor's
 * draft inline the way Sign-in can — instead `onBeforeRedirect` stamps a pending
 * claim and `redirectTo` sends them back to `…?claim=1`, where the editor
 * finishes the claim after they verify + land authenticated.
 */
import { Eye, EyeOff, User, Lock, Users, Briefcase, Building2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthCaptchaSlot } from "@/components/auth/AuthCaptchaSlot";
import { EmailField } from "@/components/auth/EmailField";
import { useTurnstile } from "@/lib/hooks/use-turnstile";
import { mapAuthError } from "@/lib/services/auth-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import OAuthProviders from "@/components/OAuthProviders";
import { useAuth, type UserRole, USER_ROLES } from "@/lib/auth";
import { trackSignUp } from "@/lib/gtm";
import { withRedirectTo } from "@/lib/auth-redirect";
import { readAttribution } from "@/lib/attribution";

export interface SignupFormProps {
  /** Initial persona selection (page reads ?role=). Defaults to job seeker. */
  initialRole?: UserRole;
  /** Where to send the user after they verify their email. Carried into the
   *  /signup-success redirect. Empty → land on the default post-verify page. */
  redirectTo?: string;
  /** Fired right before the success navigate — the gate uses this to stamp a
   *  pending studio claim so the visitor's draft is reclaimed on return. */
  onBeforeRedirect?: () => void;
  /** When provided the "Sign in" footer switches the host panel tab instead of
   *  linking to /login. */
  onSwitchToLogin?: () => void;
  /** Notifies the host of the live persona selection so a surrounding
   *  marketing panel can react to it (the /signup page does this). */
  onRoleChange?: (role: UserRole) => void;
  /** Compact mode (auth panel) hides the referral field + creator/affiliate
   *  cross-links to keep the drawer tight. Attribution-sourced referral codes
   *  are still submitted silently. */
  compact?: boolean;
}

export default function SignupForm({
  initialRole = USER_ROLES.JOB_SEEKER,
  redirectTo = "",
  onBeforeRedirect,
  onSwitchToLogin,
  onRoleChange,
  compact = false,
}: SignupFormProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { signup } = useAuth();
  const captcha = useTurnstile();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>(initialRole);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [referralCode, setReferralCode] = useState("");

  useEffect(() => setRole(initialRole), [initialRole]);
  useEffect(() => onRoleChange?.(role), [role, onRoleChange]);

  // First-touch attribution (cookie, written by useAttributionCapture in
  // App.tsx) hydrates the referral code even when the field is hidden.
  useEffect(() => {
    const stored = readAttribution().ref;
    if (stored) setReferralCode(stored);
  }, []);

  const marketingKey = role === USER_ROLES.RECRUITER ? "recruiter" : role === USER_ROLES.EMPLOYER ? "employer" : "jobSeeker";
  // Surface the persona feature list (page renders the marketing panel; the
  // gate can show a compact version) — kept here so both hosts agree.
  const features = useMemo(
    () => (t(`marketing.signUp.features.${marketingKey}`, { returnObjects: true }) as string[]) ?? [],
    [t, marketingKey],
  );
  void features;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    if (password !== confirmPassword) {
      setError(t("prompts.passwordsMismatch"));
      setIsLoading(false);
      return;
    }
    if (password.length < 6) {
      setError(t("errors.passwordTooShort"));
      setIsLoading(false);
      return;
    }
    if (!captcha.ready) {
      setError(t("errors.captchaRequired"));
      setIsLoading(false);
      return;
    }
    try {
      await signup(email, password, firstName, lastName, role, referralCode || undefined, undefined, captcha.token, i18n.language);
      trackSignUp("email");
      onBeforeRedirect?.();
      const successParams = new URLSearchParams({
        email,
        firstName,
        ...(redirectTo ? { redirectTo } : {}),
      });
      navigate(`/signup-success?${successParams.toString()}`);
    } catch (err) {
      setError(t(mapAuthError(err).messageKey));
      captcha.reset();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <OAuthProviders mode="signup" role={role} redirect={redirectTo || undefined} />

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><Separator className="w-full" /></div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">{t("labels.signupWithEmail")}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">{t("fields.firstName.label")}</Label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="firstName" type="text" placeholder={t("fields.firstName.placeholder")} value={firstName} onChange={(e) => setFirstName(e.target.value)} className="pl-10" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">{t("fields.lastName.label")}</Label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="lastName" type="text" placeholder={t("fields.lastName.placeholder")} value={lastName} onChange={(e) => setLastName(e.target.value)} className="pl-10" required />
            </div>
          </div>
        </div>

        <EmailField id="email" value={email} onChange={setEmail} label={t("fields.email.label")} placeholder={t("fields.email.placeholder")} withIcon />

        <div className="space-y-2">
          <Label>{t("prompts.registerAs")}</Label>
          <div className="p-[2px] rounded-lg sm:rounded-full bg-gradient-to-r from-brand-purple to-brand-blue w-full">
            <div className="bg-background rounded-lg sm:rounded-full p-1">
              <ToggleGroup type="single" value={role} onValueChange={(v) => v && setRole(v as UserRole)} className="grid grid-cols-1 sm:grid-cols-3 gap-1 w-full">
                <ToggleGroupItem value={USER_ROLES.JOB_SEEKER} className="rounded-lg sm:rounded-full px-3 py-2 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white min-h-[44px] flex-1">
                  <Users className="h-4 w-4 mr-2" /> {t("labels.jobSeeker")}
                </ToggleGroupItem>
                <ToggleGroupItem value={USER_ROLES.RECRUITER} className="rounded-lg sm:rounded-full px-3 py-2 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white min-h-[44px] flex-1">
                  <Briefcase className="h-4 w-4 mr-2" /> {t("labels.recruiter")}
                </ToggleGroupItem>
                <ToggleGroupItem value={USER_ROLES.EMPLOYER} className="rounded-lg sm:rounded-full px-3 py-2 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white min-h-[44px] flex-1">
                  <Building2 className="h-4 w-4 mr-2" /> {t("labels.employer")}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </div>

        {!compact && (
          <>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div>
                {t("prompts.creator")}{" "}
                <Link to="/services" className="text-primary hover:underline">{t("actions.signUpCreator")}</Link>.
              </div>
              <div>
                {t("prompts.affiliate")}{" "}
                <Link to="/affiliate-program" className="text-primary hover:underline">{t("actions.signUpAffiliate")}</Link>.
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="referralCode">{t("fields.referralCode.label")}</Label>
              <Input id="referralCode" type="text" placeholder={t("fields.referralCode.placeholder")} value={referralCode} onChange={(e) => setReferralCode(e.target.value)} />
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="password">{t("fields.password.label")}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input id="password" type={showPassword ? "text" : "password"} placeholder={t("fields.password.createPlaceholder")} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-10" required />
            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t("fields.confirmPassword.label")}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder={t("fields.confirmPassword.placeholder")} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10 pr-10" required />
            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
              {showConfirmPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            </Button>
          </div>
        </div>

        <AuthCaptchaSlot captcha={captcha} />

        <Button type="submit" className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 min-h-[44px]" disabled={isLoading || !captcha.ready}>
          {isLoading ? t("status.creatingAccount") : t("actions.createAccount")}
        </Button>
      </form>

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          {t("prompts.haveAccount")}{" "}
          {onSwitchToLogin ? (
            <button type="button" onClick={onSwitchToLogin} className="text-primary hover:underline font-medium">{t("actions.signIn")}</button>
          ) : (
            <Link to={withRedirectTo("/login", redirectTo)} className="text-primary hover:underline font-medium">{t("actions.signIn")}</Link>
          )}
        </p>
      </div>

      <div className="text-xs text-center text-muted-foreground">
        {t("labels.acceptTosPrefix")}{" "}
        <Link to="/terms" className="text-primary hover:underline">{t("labels.tos")}</Link>{" "}
        {t("labels.and")}{" "}
        <Link to="/privacy" className="text-primary hover:underline">{t("labels.privacyPolicy")}</Link>
      </div>
    </div>
  );
}

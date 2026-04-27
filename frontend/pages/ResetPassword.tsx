import { useState, useEffect } from "react";
import { useSearchParams, Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import { useSidebar } from "@/hooks/use-sidebar";
import { useSEO } from "@/lib/seo";
import Sidebar from "@/components/Sidebar";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { apiClient } from "@/lib/api-client";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const token = searchParams.get("token");

  // SEO for reset password page
  useSEO(location.pathname);

  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  useEffect(() => {
    if (!token) {
      setError(t("errors.invalidResetLink"));
    }
  }, [token, t]);

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push(t("errors.passwordMinLength"));
    }
    // One template + named tokens — adding a new requirement is a JSON
    // line, not a new full sentence per language.
    const requirements: Array<{ test: RegExp; key: string }> = [
      { test: /[A-Z]/, key: "uppercase" },
      { test: /[a-z]/, key: "lowercase" },
      { test: /\d/, key: "number" },
      { test: /[!@#$%^&*(),.?":{}|<>]/, key: "specialChar" },
    ];
    for (const r of requirements) {
      if (!r.test.test(password)) {
        errors.push(t("errors.passwordMissing", { requirement: t(`passwordRequirement.${r.key}`) }));
      }
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setError(t("errors.invalidResetLink"));
      return;
    }

    if (!password.trim()) {
      setError(t("errors.passwordRequired"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("prompts.passwordsMismatch"));
      return;
    }

    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      setValidationErrors(passwordErrors);
      setError(t("errors.fixPasswordRequirements"));
      return;
    }

    setLoading(true);
    setError("");
    setValidationErrors([]);

    try {
      await apiClient.requestRaw<{ message?: string }>(
        "/api/auth/reset-password",
        {
          method: "POST",
          body: {
            token,
            password,
          },
        },
      );

      const ok = true;

      if (ok) {
        setSuccess(true);
        setTimeout(() => {
          navigate("/login");
        }, 3000);
      } else {
        try {
          setError(t("errors.resetFailed"));
        } catch {
          setError(t("errors.resetFailed"));
        }
      }
    } catch (err) {
      setError(t("errors.network"));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
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
                  <CardTitle className="text-2xl font-bold text-red-600">
                    {t("headings.invalidResetLink")}
                  </CardTitle>
                  <CardDescription>
                    {t("messages.invalidResetLinkSubtitle")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t("messages.invalidLinkAlert")}
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-3">
                    <Button asChild className="w-full min-h-[44px]">
                      <Link to="/forgot-password">{t("actions.requestNewLink")}</Link>
                    </Button>

                    <div className="text-center">
                      <Link
                        to="/login"
                        className="text-sm text-blue-600 hover:text-blue-500 inline-flex items-center"
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        {t("actions.backToSignIn")}
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
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
                  <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <CardTitle className="text-2xl font-bold text-green-600">
                    {t("headings.passwordResetSuccessful")}
                  </CardTitle>
                  <CardDescription>
                    {t("messages.passwordResetSuccessSubtitle")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t("messages.passwordResetSuccessAlert")}
                    </AlertDescription>
                  </Alert>

                  <Button asChild className="w-full min-h-[44px]">
                    <Link to="/login">{t("actions.signIn")}</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
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
                <CardTitle className="text-2xl font-bold">
                  {t("headings.resetYourPassword")}
                </CardTitle>
                <CardDescription>{t("headings.enterNewPasswordSubtitle")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="password">{t("fields.password.newLabel")}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={t("fields.password.newPlaceholder")}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={loading}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">
                      {t("fields.confirmPassword.newLabel")}
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder={t("fields.confirmPassword.newPlaceholder")}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={loading}
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
                        disabled={loading}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {validationErrors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                          {validationErrors.map((err, index) => (
                            <li key={index} className="break-words">{err}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full min-h-[44px]" disabled={loading}>
                    {loading ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        {t("status.resettingPassword")}
                      </div>
                    ) : (
                      t("actions.resetPassword")
                    )}
                  </Button>

                  <div className="text-center">
                    <Link
                      to="/login"
                      className="text-sm text-blue-600 hover:text-blue-500 inline-flex items-center"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      {t("actions.backToSignIn")}
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

import { ArrowLeft, Mail, CheckCircle, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { useSEO } from "@/lib/seo";
import { apiClient } from "@/lib/api-client";

export default function ForgotPassword() {
  const location = useLocation();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // SEO for forgot password page
  useSEO(location.pathname);

  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError(t("auth.forgot.errors.emailRequired"));
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t("auth.forgot.errors.emailInvalid"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Use the API endpoint for password reset
      await apiClient.requestRaw<{ message: string }>(
        "/api/auth/forgot-password",
        {
          method: "POST",
          body: { email },
        },
      );

      setSuccess(true);
    } catch (err) {
      setError(t("auth.forgot.errors.sendFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background">
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

          <div className="pt-16">
            <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4">
              <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <CardTitle className="text-2xl">{t("auth.forgot.successTitle")}</CardTitle>
                  <CardDescription>
                    {t("auth.forgot.successSubtitle")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg bg-green-50 p-4">
                    <div className="flex items-start">
                      <Mail className="h-5 w-5 text-green-600 mt-0.5 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-green-800">
                          {t("auth.forgot.successEmailSent", { email })}
                        </p>
                        <p className="text-sm text-green-700 mt-1">
                          {t("auth.forgot.successEmailBody")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm text-gray-600 text-center">
                      {t("auth.forgot.noEmailHint")}
                    </p>

                    <Button
                      variant="outline"
                      className="w-full min-h-[44px]"
                      onClick={() => {
                        setSuccess(false);
                        setEmail("");
                      }}
                    >
                      {t("common.actions.tryDifferentEmail")}
                    </Button>

                    <div className="text-center">
                      <Link
                        to="/login"
                        className="text-sm text-blue-600 hover:text-blue-500 inline-flex items-center"
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        {t("common.actions.backToSignIn")}
                      </Link>
                    </div>
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

  return (
    <div className="min-h-screen bg-background">
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

        <div className="pt-16">
          <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4">
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">{t("common.headings.resetYourPassword")}</CardTitle>
                <CardDescription>
                  {t("auth.forgot.subtitle")}
                </CardDescription>
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
                    <Label htmlFor="email">{t("common.fields.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t("common.fields.emailPlaceholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full min-h-[44px]" disabled={loading}>
                    {loading ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        {t("auth.forgot.submitting")}
                      </div>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        {t("auth.forgot.submit")}
                      </>
                    )}
                  </Button>

                  <div className="text-center space-y-2">
                    <p className="text-sm text-gray-600">
                      {t("auth.forgot.rememberPassword")}{" "}
                      <Link
                        to="/login"
                        className="text-blue-600 hover:text-blue-500 font-medium"
                      >
                        {t("common.actions.signIn")}
                      </Link>
                    </p>

                    <p className="text-sm text-gray-600">
                      {t("common.prompts.noAccount")}{" "}
                      <Link
                        to="/signup"
                        className="text-blue-600 hover:text-blue-500 font-medium"
                      >
                        {t("common.actions.createAccount")}
                      </Link>
                    </p>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

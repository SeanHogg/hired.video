import { CheckCircle, XCircle, Mail, ArrowLeft, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
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
import { useSidebar } from "@/hooks/use-sidebar";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export default function ConfirmEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<
    "loading" | "success" | "error" | "invalid"
  >("loading");
  const [message, setMessage] = useState("");
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  const userId = searchParams.get("userId");
  const code = searchParams.get("code");

  useEffect(() => {
    const confirmEmail = async () => {
      if (!userId || !code) {
        setStatus("invalid");
        setMessage(
          "Invalid confirmation link. Please check your email for the correct link.",
        );
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/Account/ConfirmEmail?userId=${encodeURIComponent(userId)}&code=${encodeURIComponent(code)}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (response.ok) {
          const responseText = await response.text();
          if (
            response.url.includes(
              "info=Your registration has been confirmed",
            ) ||
            responseText.includes("confirmed")
          ) {
            setStatus("success");
            setMessage(
              "Your email has been successfully confirmed! You can now sign in to your account.",
            );
          } else {
            setStatus("error");
            setMessage(
              "Email confirmation failed. The link may have expired or been used already.",
            );
          }
        } else {
          setStatus("error");
          setMessage(
            "Email confirmation failed. The link may have expired or been used already.",
          );
        }
      } catch (err) {
        setStatus("error");
        setMessage(
          "Network error. Please check your connection and try again.",
        );
      }
    };

    confirmEmail();
  }, [userId, code]);

  const handleResendConfirmation = async () => {
    window.location.href =
      "/signup?message=Please sign up again to receive a new confirmation email";
  };

  const renderContent = () => {
    switch (status) {
      case "loading":
        return (
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <RefreshCw className="h-6 w-6 text-blue-600 animate-spin" />
              </div>
              <CardTitle className="text-2xl">Confirming Your Email</CardTitle>
              <CardDescription>
                Please wait while we confirm your email address...
              </CardDescription>
            </CardHeader>
          </Card>
        );

      case "success":
        return (
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle className="text-2xl">Email Confirmed!</CardTitle>
              <CardDescription>
                Your email address has been successfully verified
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>{message}</AlertDescription>
              </Alert>

              <div className="space-y-3">
                <Button asChild className="w-full">
                  <Link to="/login">Sign In to Your Account</Link>
                </Button>

                <div className="text-center">
                  <Link
                    to="/"
                    className="text-sm text-gray-600 hover:text-gray-500"
                  >
                    Return to Home
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "error":
        return (
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle className="text-2xl">Confirmation Failed</CardTitle>
              <CardDescription>
                We couldn't confirm your email address
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{message}</AlertDescription>
              </Alert>

              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleResendConfirmation}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Get New Confirmation Email
                </Button>

                <div className="text-center space-y-2">
                  <Link
                    to="/login"
                    className="text-sm text-blue-600 hover:text-blue-500 inline-flex items-center"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back to Sign In
                  </Link>

                  <p className="text-xs text-gray-500">
                    Need help? Contact our support team
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case "invalid":
        return (
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                <Mail className="h-6 w-6 text-yellow-600" />
              </div>
              <CardTitle className="text-2xl">Invalid Link</CardTitle>
              <CardDescription>
                This confirmation link is not valid
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Mail className="h-4 w-4" />
                <AlertDescription>{message}</AlertDescription>
              </Alert>

              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleResendConfirmation}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Get New Confirmation Email
                </Button>

                <div className="text-center">
                  <Link
                    to="/signup"
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    Create New Account
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

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
            {renderContent()}
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

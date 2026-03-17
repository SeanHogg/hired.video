import { useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSidebar } from "@/hooks/use-sidebar";
import { Mail, ArrowLeft } from "lucide-react";

/**
 * Legacy /confirm-email route — kept to gracefully handle old-format links.
 * New verification emails go to /verify-email?token=... instead.
 * If somehow a ?token= arrives here, redirect to the real handler.
 */
export default function ConfirmEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  const token = searchParams.get("token");

  // If the link somehow contains a new-format token, forward it
  useEffect(() => {
    if (token) {
      navigate(`/verify-email?token=${encodeURIComponent(token)}`, { replace: true });
    }
  }, [token, navigate]);

  if (token) return null; // redirecting

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
        <div className="pt-16">
          <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4">
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                  <Mail className="h-6 w-6 text-yellow-600" />
                </div>
                <CardTitle className="text-2xl">Link Expired</CardTitle>
                <CardDescription>This verification link is from an older version of the site and is no longer valid.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertDescription>
                    Please sign in and request a new verification email, or use the forgot password flow to regain access.
                  </AlertDescription>
                </Alert>
                <div className="space-y-3">
                  <Button asChild className="w-full min-h-[44px]">
                    <Link to="/login">Sign In</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full min-h-[44px]">
                    <Link to="/forgot-password">Reset Password</Link>
                  </Button>
                  <div className="text-center">
                    <Link to="/" className="text-sm text-blue-600 hover:text-blue-500 inline-flex items-center">
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back to Home
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

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // SEO for login page
  useSEO(location.pathname);
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Login.handleSubmit: Form submitted");
    setIsLoading(true);
    setError("");

    try {
      console.log("Login.handleSubmit: Calling login with", { email });
      const success = await login(email, password);
      console.log("Login.handleSubmit: Login result:", success);

      if (success) {
        console.log("Login.handleSubmit: Login successful, navigating to dashboard");
        navigate("/dashboard");
      } else {
        console.log("Login.handleSubmit: Login failed, setting error");
        setError("Invalid email or password. Please try again.");
      }
    } catch (err) {
      console.error("Login.handleSubmit: Exception caught:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setIsLoading(true);
    setError("");

    try {
      const success = await login(demoEmail, demoPassword);
      if (success) {
        navigate("/dashboard");
      }
    } catch (err) {
      setError("Demo login failed. Please try again.");
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
                    className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                    disabled={isLoading}
                  >
                    {isLoading ? "Signing in..." : "Sign in"}
                  </Button>
                </form>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or try demo accounts
                    </span>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      handleDemoLogin("john.seeker@example.com", "Password123!")
                    }
                    disabled={isLoading}
                    className="text-left justify-start"
                  >
                    Demo Job Seeker (john.seeker@example.com)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      handleDemoLogin(
                        "sarah.recruiter@example.com",
                        "Password123!",
                      )
                    }
                    disabled={isLoading}
                    className="text-left justify-start"
                  >
                    Demo Recruiter (sarah.recruiter@example.com)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      handleDemoLogin(
                        "michael.business@example.com",
                        "Password123!",
                      )
                    }
                    disabled={isLoading}
                    className="text-left justify-start"
                  >
                    Demo Employer (michael.business@example.com)
                  </Button>
                </div>

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

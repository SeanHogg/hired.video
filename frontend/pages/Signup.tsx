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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth, type UserRole, USER_ROLES } from "@/lib/auth";

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

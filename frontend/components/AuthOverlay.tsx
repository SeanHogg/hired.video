import {
  Lock,
  Building2,
  Briefcase,
  FileText,
  User,
  LogIn,
  UserPlus,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface AuthOverlayProps {
  contentType?: "company" | "job" | "resume" | "person" | "ai-coach" | "tool";
  title?: string;
  message?: string;
  /**
   * Path to return to after login. Defaults to the current pathname so tool
   * pages resume in place. The Login screen reads ?redirect= and navigates
   * there on success; pair this with usePendingToolInput to rehydrate form
   * state and avoid making users re-enter their data.
   */
  returnTo?: string;
}

export default function AuthOverlay({
  contentType = "company",
  title,
  message,
  returnTo,
}: AuthOverlayProps) {
  const location = useLocation();
  const redirectTarget = returnTo ?? `${location.pathname}${location.search}`;
  const redirectQuery = `?redirect=${encodeURIComponent(redirectTarget)}`;
  const getContentIcon = () => {
    switch (contentType) {
      case "company":
        return <Building2 className="h-5 w-5" />;
      case "job":
        return <Briefcase className="h-5 w-5" />;
      case "resume":
        return <FileText className="h-5 w-5" />;
      case "person":
        return <User className="h-5 w-5" />;
      case "ai-coach":
        return <Lock className="h-5 w-5" />;
      case "tool":
        return <Lock className="h-5 w-5" />;
      default:
        return <Lock className="h-5 w-5" />;
    }
  };

  const getDefaultMessage = () => {
    switch (contentType) {
      case "company":
        return "Sign in to view complete company details, benefits, and connect with hiring managers.";
      case "job":
        return "Sign in to view full job descriptions, salary information, and apply directly.";
      case "resume":
        return "Sign in to view complete professional profiles and detailed work experience.";
      case "person":
        return "Sign in to view full professional profiles and connect with industry professionals.";
      case "ai-coach":
        return "Sign in to access AI-powered career coaching and personalized guidance.";
      case "tool":
        return "Sign in to run this tool — we'll keep the inputs you've already entered and pick up right where you left off.";
      default:
        return "Sign in to access complete details and unlock all features.";
    }
  };

  return (
    <>
      {/* Blur overlay */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-40" />

      {/* Auth prompt at top */}
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-2xl px-6 pointer-events-none">
        <Card className="bg-background/95 backdrop-blur-md border border-primary/20 shadow-lg pointer-events-auto">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              {/* Icon */}
              <div className="flex justify-center">
                <div className="p-3 bg-primary/10 rounded-full">
                  {getContentIcon()}
                </div>
              </div>

              {/* Title */}
              <div>
                <h3 className="text-lg font-semibold mb-2">
                  {title ||
                    `Access Full ${contentType === "person" ? "Profile" : contentType.charAt(0).toUpperCase() + contentType.slice(1)} Details`}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {message || getDefaultMessage()}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button asChild className="flex-1" size="sm">
                  <Link to={`/login${redirectQuery}`}>
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In
                  </Link>
                </Button>
                <Button asChild variant="outline" className="flex-1" size="sm">
                  <Link to={`/signup${redirectQuery}`}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create Account
                  </Link>
                </Button>
              </div>

              {/* Additional CTA */}
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  Join thousands of professionals already using our platform
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

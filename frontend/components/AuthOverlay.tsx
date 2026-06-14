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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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

  // Per-contentType title + message live in the i18n catalogue
  // (`auth.overlay.title.<type>` / `auth.overlay.message.<type>`) so every
  // gated surface localizes; fall back to the `.default` key for any type
  // without a dedicated string. An explicit prop still wins over both.
  const resolvedTitle =
    title ?? t(`auth.overlay.title.${contentType}`, t("auth.overlay.title.default"));
  const resolvedMessage =
    message ?? t(`auth.overlay.message.${contentType}`, t("auth.overlay.message.default"));

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
                  {resolvedTitle}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {resolvedMessage}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button asChild className="flex-1" size="sm">
                  <Link to={`/login${redirectQuery}`}>
                    <LogIn className="h-4 w-4 mr-2" />
                    {t("actions.signIn")}
                  </Link>
                </Button>
                <Button asChild variant="outline" className="flex-1" size="sm">
                  <Link to={`/signup${redirectQuery}`}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {t("actions.createAccount")}
                  </Link>
                </Button>
              </div>

              {/* Additional CTA */}
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">
                  {t("auth.overlay.footer")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

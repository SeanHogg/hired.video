import { Link } from "react-router-dom";
import { Video, Sparkles, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { useAuth } from "@/lib/auth";

/**
 * BrandLogo — the canonical hired.video word + glyph. Pure presentational,
 * no hooks beyond `Link`. Reused by `<Navigation>` (full chrome) and by
 * `<BrandHeader>` (the minimal branded strip rendered while auth is still
 * resolving or the user is in verification limbo).
 */
export function BrandLogo({ className }: { className?: string }): JSX.Element {
  return (
    <Link to="/" className={`flex items-center space-x-2 ${className ?? ""}`}>
      <div className="relative">
        <Video className="h-8 w-8 text-primary" />
        <Sparkles className="h-4 w-4 text-brand-blue absolute -top-1 -right-1" />
      </div>
      <span className="hidden sm:inline text-xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
        hired.video
      </span>
    </Link>
  );
}

/**
 * BrandHeader — branded top strip with no data dependencies. Logo on the
 * left, optional Sign Out on the right when the visitor is authenticated
 * (so a verification-blocked user always has a clean exit). Used by
 * `<AppShell>` in its non-chrome branches: the bootstrap-loading state and
 * the verification-limbo state. Replaces the previous "blank background"
 * fallback so the customer always knows they're on hired.video.
 */
export function BrandHeader(): JSX.Element {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSignOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-md border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <LocaleSwitcher variant="compact" />
            {isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">{t("actions.signOut")}</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

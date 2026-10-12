import { Link } from "react-router-dom";
import { Video, Sparkles } from "lucide-react";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { useAuth } from "@/lib/auth";

/**
 * BrandLogo — the canonical hired.video word + glyph (Video + Sparkles badge +
 * gradient wordmark). Pure presentational, no hooks beyond `Link`. This is the
 * SINGLE source of the brand mark — `<Navigation>` (full chrome), the
 * `<Sidebar>` mobile drawer header, and `<BrandHeader>` (the minimal branded
 * strip shown while auth resolves / in verification limbo) all render it so the
 * logo can never drift between surfaces.
 *
 * - `size` — "md" (top bars) or "sm" (denser drawer header).
 * - `wordmark` — "responsive" hides the wordmark below `sm` (top bars, where
 *   space is tight); "always" keeps it (the drawer, which is wide); "hidden"
 *   drops it entirely (the collapsed rail rail-icon state).
 */
export function BrandLogo({
  className,
  size = "md",
  wordmark = "responsive",
  onClick,
}: {
  className?: string;
  size?: "sm" | "md";
  wordmark?: "responsive" | "always" | "hidden";
  onClick?: () => void;
}): JSX.Element {
  const iconSize = size === "sm" ? "h-7 w-7" : "h-[30px] w-[30px]";
  const textSize = size === "sm" ? "text-lg" : "text-[21px]";
  const wordmarkVisibility =
    wordmark === "always" ? "inline" : "hidden sm:inline";

  return (
    <Link
      to="/"
      onClick={onClick}
      className={`flex items-center gap-2.5 ${className ?? ""}`}
    >
      <div className="relative">
        <Video className={`${iconSize} text-primary`} />
        <Sparkles className="h-[15px] w-[15px] text-brand-blue absolute -top-[3px] -right-[3px]" />
      </div>
      {wordmark !== "hidden" && (
        <span
          className={`${wordmarkVisibility} ${textSize} font-bold tracking-[-0.01em] text-primary`}
        >
          hired.video
        </span>
      )}
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
  const { isAuthenticated } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b bg-sidebar/80 backdrop-blur-md border-sidebar-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <LocaleSwitcher variant="compact" />
            {/* Post-logout redirect to /login keeps the bootstrap /
                verification-limbo shell's "clean exit" behavior. */}
            {isAuthenticated && (
              <SignOutButton variant="inline" redirectTo="/login" />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { NEW_KIT_PATH } from "@/lib/build-entry";

interface AuthButtonsProps {
  /** `inline` = the desktop header pair; `bar` = the phone's two equal
   *  buttons (bottom bar + menu drawer). */
  layout?: "inline" | "bar";
  onNavigate?: () => void;
  className?: string;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Signed-out account CTAs (consolidated-header mockup): "Sign in" and the
 * primary "Make your video", which drops the visitor straight into the
 * anonymous build flow (account creation happens inline later, at
 * download/post time). The ONE source for these two buttons — the desktop
 * header, the phone bottom bar and the phone menu drawer all render it.
 */
export function AuthButtons({ layout = "inline", onNavigate, className }: AuthButtonsProps) {
  const { t } = useTranslation();
  const isBar = layout === "bar";

  return (
    <div className={cn(isBar ? "grid grid-cols-2 gap-2.5" : "flex items-center gap-2 lg:gap-3", className)}>
      <Link
        to="/login"
        onClick={onNavigate}
        className={cn(
          "inline-flex items-center justify-center font-semibold text-foreground transition-colors",
          FOCUS_RING,
          isBar
            ? "min-h-12 rounded-xl border border-border bg-background text-[15px] hover:bg-muted"
            : "min-h-[44px] rounded-lg px-3 text-sm hover:text-primary",
        )}
      >
        {t("nav.header.signIn")}
      </Link>
      <Link
        to={NEW_KIT_PATH}
        onClick={onNavigate}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90",
          FOCUS_RING,
          isBar ? "min-h-12 rounded-xl px-3 text-[15px]" : "min-h-[44px] rounded-[10px] px-[18px] text-sm",
        )}
      >
        {t("nav.header.makeVideo")}
      </Link>
    </div>
  );
}

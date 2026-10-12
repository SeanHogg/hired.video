/**
 * The studio's way into the Distribution Hub (#2047), next to "+ New" on
 * /studio. Self-gating: scheduling needs an account, so a signed-out
 * visitor or a guest session sees nothing.
 */
import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export default function DistributionHubLink() {
  const { t } = useTranslation();
  const { user, isGuest } = useAuth();
  if (!user || isGuest) return null;
  return (
    <Link
      to="/studio/distribution"
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-accent"
    >
      <CalendarClock className="h-4 w-4" aria-hidden="true" />
      <span>{t("distribution.navLabel")}</span>
    </Link>
  );
}

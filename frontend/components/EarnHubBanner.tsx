// EarnHubBanner — surfaces the three monetization paths on the dashboard so
// an unemployed user discovers they can actually generate revenue here.
// Dismissable per-user via localStorage; mirrors ReferralBanner's pattern.

import { useState } from "react";
import { Link } from "react-router-dom";
import { DollarSign, X, Mic, Briefcase, Sparkles, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";

const DISMISS_KEY_BASE = "earn_hub_banner_dismissed_v1";

export default function EarnHubBanner() {
  const { user } = useAuth();
  const dismissKey = user?.id ? `${DISMISS_KEY_BASE}:${user.id}` : DISMISS_KEY_BASE;

  const [dismissed, setDismissed] = useState(() => {
    try { return Boolean(localStorage.getItem(dismissKey)); } catch { /* ignore SSR */ return false; }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(dismissKey, "1"); } catch { /* ignore quota / SSR */ }
    setDismissed(true);
  };

  const tiles = [
    {
      to: "/studio?tab=voice-clones",
      icon: Mic,
      title: "License your voice",
      desc: "Record once, earn 95% on every sale",
    },
    {
      to: "/services",
      icon: Briefcase,
      title: "Offer services",
      desc: "Resume reviews, coaching, video editing",
    },
    {
      to: "/creators",
      icon: Sparkles,
      title: "Become a Creator",
      desc: "Make promo videos for paying clients",
    },
  ];

  return (
    <div className="relative rounded-xl border border-emerald-300/40 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent px-5 py-4 mb-6">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
        title="Dismiss"
        aria-label="Dismiss earn banner"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 mb-4 pr-8">
        <div className="mt-0.5 shrink-0 w-9 h-9 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <DollarSign className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <p className="font-semibold text-sm">Earn on hired.video</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            You can make money here while you job search. Pick a path:
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {tiles.map(({ to, icon: Icon, title, desc }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/60 hover:bg-background hover:border-emerald-500/40 transition-colors px-3 py-2.5"
          >
            <Icon className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{desc}</p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all mt-1 shrink-0" />
          </Link>
        ))}
      </div>

      <div className="mt-3 text-[11px] text-muted-foreground">
        Already earning? <Link to="/affiliate-program" className="underline underline-offset-2 hover:text-foreground">Refer a friend</Link> to add a 4th income stream.
      </div>
    </div>
  );
}

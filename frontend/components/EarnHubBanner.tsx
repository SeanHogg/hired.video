// EarnHubBanner — surfaces a small set of role-appropriate paths on the
// dashboard. Job seekers see the three monetization paths (license voice,
// offer services, become a creator); employers see the four hiring power
// moves (post a job, promote with AI video, analyze candidates, outreach).
// Self-gates on the effective role so the consumer just renders <EarnHubBanner />.

import { useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Briefcase,
  DollarSign,
  Mic,
  Send,
  Sparkles,
  Video,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import { roleUtils } from "@/lib/role-utils";

const DISMISS_KEY_BASE = "earn_hub_banner_dismissed_v1";

interface BannerVariant {
  /** Outline gradient used for the banner background. */
  ringClass: string;
  /** Class for the small icon chip at the top-left of the banner. */
  iconChipClass: string;
  /** Class for the icon stroke colour (also used for hover highlights on tiles). */
  accentClass: string;
  Icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  tiles: BannerTile[];
  /** Optional footnote rendered under the tiles. */
  footnote?: { text: string; linkLabel: string; linkTo: string };
}

interface BannerTile {
  to: string;
  Icon: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}

const JOB_SEEKER_VARIANT: BannerVariant = {
  ringClass: "border-emerald-300/40 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent",
  iconChipClass: "bg-emerald-500/15",
  accentClass: "text-emerald-600",
  Icon: DollarSign,
  title: "Earn on hired.video",
  subtitle: "You can make money here while you job search. Pick a path:",
  tiles: [
    { to: "/studio?tab=voice-clones", Icon: Mic, title: "License your voice", desc: "Record once, earn 95% on every sale" },
    { to: "/services", Icon: Briefcase, title: "Offer services", desc: "Resume reviews, coaching, video editing" },
    { to: "/services?wizard=open", Icon: Sparkles, title: "Become a Creator", desc: "Make promo videos for paying clients" },
  ],
  footnote: {
    text: "Already earning?",
    linkLabel: "Refer a friend",
    linkTo: "/affiliate-program",
  },
};

const EMPLOYER_VARIANT: BannerVariant = {
  ringClass: "border-brand-purple/40 bg-gradient-to-r from-brand-purple/10 via-brand-blue/5 to-transparent",
  iconChipClass: "bg-brand-purple/15",
  accentClass: "text-brand-purple",
  Icon: Briefcase,
  title: "Hire faster on hired.video",
  subtitle: "Pick a power move to fill your next role:",
  tiles: [
    { to: "/jobs/create", Icon: Briefcase, title: "Post a job", desc: "List a role and start collecting applicants" },
    { to: "/studio?contentTemplate=company_promo", Icon: Video, title: "Promote with AI video", desc: "Spin up a 30s company promo to attract talent" },
    { to: "/tools", Icon: Wrench, title: "Analyze candidates", desc: "Score resumes, extract skills, surface fit" },
    { to: "/outreach", Icon: Send, title: "Outreach", desc: "Promote your jobs to the right candidates" },
  ],
};

function variantFor(role: string | null): BannerVariant | null {
  if (roleUtils.isEmployer(role)) return EMPLOYER_VARIANT;
  if (roleUtils.isJobSeeker(role)) return JOB_SEEKER_VARIANT;
  return null;
}

export default function EarnHubBanner() {
  const { user } = useAuth();
  const effectiveRole = useEffectiveRole();
  const variant = variantFor(effectiveRole);

  const dismissKey = user?.id ? `${DISMISS_KEY_BASE}:${user.id}` : DISMISS_KEY_BASE;
  const [dismissed, setDismissed] = useState(() => {
    try { return Boolean(localStorage.getItem(dismissKey)); } catch { return false; }
  });

  if (!variant || dismissed) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(dismissKey, "1"); } catch { /* quota / SSR */ }
    setDismissed(true);
  };

  const tileCols = variant.tiles.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3";

  return (
    <div className={`relative rounded-xl border px-5 py-4 mb-6 ${variant.ringClass}`}>
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
        title="Dismiss"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 mb-4 pr-8">
        <div className={`mt-0.5 shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${variant.iconChipClass}`}>
          <variant.Icon className={`h-5 w-5 ${variant.accentClass}`} />
        </div>
        <div>
          <p className="font-semibold text-sm">{variant.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{variant.subtitle}</p>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${tileCols} gap-2`}>
        {variant.tiles.map(({ to, Icon, title, desc }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-start gap-2.5 rounded-lg border border-border/60 bg-background/60 hover:bg-background hover:border-current transition-colors px-3 py-2.5"
          >
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${variant.accentClass}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{desc}</p>
            </div>
            <ArrowRight className={`h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-all mt-1 shrink-0 ${variant.accentClass}`} />
          </Link>
        ))}
      </div>

      {variant.footnote && (
        <div className="mt-3 text-[11px] text-muted-foreground">
          {variant.footnote.text}{" "}
          <Link to={variant.footnote.linkTo} className="underline underline-offset-2 hover:text-foreground">
            {variant.footnote.linkLabel}
          </Link>
        </div>
      )}
    </div>
  );
}

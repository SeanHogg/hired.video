// Top-of-dashboard quick actions for the job-seeker workspace: the two jobs
// the product does — build a resume, then post it as a video. Both open the
// the kit workspace (the studio list is one tap away for existing videos).

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, FileText, Send } from "lucide-react";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { cn } from "@/lib/utils";

interface QuickAction {
  key: string;
  to: string;
  icon: typeof FileText;
  titleKey: string;
  bodyKey: string;
  primary?: boolean;
}

const ACTIONS: readonly QuickAction[] = [
  { key: "build", to: NEW_KIT_PATH, icon: FileText, titleKey: "dashboard.quick.build.title", bodyKey: "dashboard.quick.build.body", primary: true },
  { key: "post", to: "/studio", icon: Send, titleKey: "dashboard.quick.post.title", bodyKey: "dashboard.quick.post.body" },
];

export function DashboardQuickActions({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("dashboard.quick.label")} className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {ACTIONS.map(({ key, to, icon: Icon, titleKey, bodyKey, primary }) => (
        <Link
          key={key}
          to={to}
          className={cn(
            "group flex min-h-[88px] items-center gap-4 rounded-[20px] border p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            primary
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent/40",
          )}
        >
          <span
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
              primary ? "bg-primary-foreground/15" : "bg-brand-green/15 text-brand-green-text",
            )}
          >
            <Icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-display text-lg font-bold tracking-[-0.02em]">{t(titleKey)}</span>
            <span className={cn("text-sm", primary ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {t(bodyKey)}
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}

export default DashboardQuickActions;

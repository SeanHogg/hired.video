/**
 * CreateIntentChooser — the studio home's "start with" line (#2363). Opens
 * on the creation this visitor most likely came for (resolveCreateIntent:
 * the /for/:audience page they arrived through, their last pick, their
 * role), shown first and marked as suggested, with the other offered
 * intents beside it so switching is one tap. A document intent (résumé, job
 * post, company page) opens the create step first — a design template and,
 * for a résumé, master or variant (#2221, CreateDocumentDialog); a video goes
 * straight to its start. The pick is remembered for next time.
 *
 * Self-contained: reads the user, the `?for=<audience>` hand-off and the
 * per-viewer memory itself, so the page only places it.
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Briefcase, Building2, Clapperboard, FileText, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  LANDING_SOURCE_PARAM,
  createIntentHref,
  documentKindForIntent,
  orderCreateIntents,
  resolveCreateIntent,
  type CreateIntent,
} from "@/lib/studio/create-intent";
import { cn } from "@/lib/utils";
import CreateDocumentDialog from "@/components/studio/landing/CreateDocumentDialog";
import type { CreatableDocumentKind } from "@/lib/studio/landing/use-document-create";
import { JOB_POST_LEAD_PATH, useJobPostAccess } from "@/lib/studio/job-post-access";
import { readCreateIntentPreferences, readLandingSource, rememberCreateIntent } from "./create-intent-memory";

const INTENT_ICON: Record<CreateIntent, LucideIcon> = {
  resume: FileText,
  video: Clapperboard,
  job: Briefcase,
  company: Building2,
};

const CHIP =
  "inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function CreateIntentChooser({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const handoff = params.get(LANDING_SOURCE_PARAM);
  const [creating, setCreating] = useState<CreatableDocumentKind | null>(null);
  // A job post is for recruiters / employers (#1915): hidden from other
  // signed-in roles; a signed-out visitor goes to the lead capture.
  const jobAccess = useJobPostAccess();

  const intents = useMemo(() => {
    const suggested = resolveCreateIntent(
      user ? { role: user.role } : null,
      readCreateIntentPreferences(),
      { audience: handoff ?? readLandingSource() },
    );
    return orderCreateIntents(suggested).filter((i) => i !== "job" || jobAccess !== "denied");
  }, [user, handoff, jobAccess]);

  return (
    <nav aria-label={t("createIntent.ariaLabel")} className={cn("flex flex-wrap items-center gap-2 py-4", className)}>
      <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
        {t("createIntent.heading")}
      </span>
      {intents.map((intent, i) => {
        const Icon = INTENT_ICON[intent];
        const suggested = i === 0;
        const leadCapture = intent === "job" && jobAccess === "sign-in";
        const documentKind = leadCapture ? null : documentKindForIntent(intent);
        const chipClass = cn(
          CHIP,
          suggested
            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            : "border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground",
        );
        const body = (
          <>
            <Icon className="h-4 w-4 flex-none" aria-hidden="true" />
            <span className="truncate">{t(`createIntent.option.${intent}`)}</span>
            {suggested && <span className="sr-only">{t("createIntent.suggested")}</span>}
          </>
        );
        return documentKind ? (
          <button
            key={intent}
            type="button"
            aria-haspopup="dialog"
            onClick={() => {
              rememberCreateIntent(intent);
              setCreating(documentKind);
            }}
            className={chipClass}
          >
            {body}
          </button>
        ) : (
          <Link
            key={intent}
            to={leadCapture ? JOB_POST_LEAD_PATH : createIntentHref(intent)}
            onClick={() => rememberCreateIntent(intent)}
            className={chipClass}
          >
            {body}
          </Link>
        );
      })}
      <CreateDocumentDialog kind={creating} onOpenChange={(open) => !open && setCreating(null)} />
    </nav>
  );
}

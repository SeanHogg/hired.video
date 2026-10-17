/**
 * ExistingResumePicker — "Use an existing resume" on the kit empty state.
 *
 * A signed-in visitor already has résumés on the platform, so making them
 * re-upload a file to start a video was busy-work. This lists what they own and
 * hands the chosen résumé's content straight to the intake — no parse, no AI
 * round-trip, no token spend.
 *
 * Self-gating: renders nothing for anonymous visitors and nothing when the
 * account has no résumés yet, so the host panel drops it in unconditionally
 * and signed-out intake is unchanged.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntakeOption } from "@/components/build/IntakeOption";
import { useAuth } from "@/lib/auth";
import { resumeService } from "@/lib/services/resume-service";
import type { ResumeContent } from "@shared/resume";
import { useUserResumes } from "@/hooks/queries/use-resumes";

export interface ExistingResumePickerProps {
  /** Receives the chosen résumé's content, the label to echo in the chat, and
   *  its id (so later saves update that résumé rather than copying it). */
  onSelect: (content: ResumeContent, title: string, resumeId: string) => void;
  disabled?: boolean;
}

export function ExistingResumePicker(props: ExistingResumePickerProps): JSX.Element | null {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;
  return <AuthenticatedExistingResumePicker {...props} />;
}

function AuthenticatedExistingResumePicker({
  onSelect,
  disabled,
}: ExistingResumePickerProps): JSX.Element | null {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Same cache key the rest of the app reads, so opening the picker after a
  // visit to /resumes costs no request.
  const { data: resumes = [], isLoading, isError } = useUserResumes();

  // Nothing to offer → stay out of the way entirely (the upload/paste paths
  // remain the whole panel for a brand-new account).
  if (!isLoading && !isError && resumes.length === 0) return null;

  const choose = async (id: string, title: string) => {
    setLoadError(false);
    setLoadingId(id);
    try {
      const resume = await resumeService.getResumeById(id);
      onSelect(resume.content, title, id);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingId(null);
    }
  };

  if (!open) {
    return (
      <IntakeOption
        icon={<FileText />}
        title={t("build.intake.existing")}
        hint={t("build.intake.existingHint")}
        disabled={disabled}
        onClick={() => setOpen(true)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-foreground">
          {t("build.intake.existing")}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t("build.intake.existingBack")}
        </Button>
      </div>

      {isLoading && (
        <p className="text-[13px] text-muted-foreground">{t("build.intake.existingLoading")}</p>
      )}
      {(isError || loadError) && (
        <p role="alert" className="text-[13px] text-destructive">
          {t("build.intake.existingError")}
        </p>
      )}

      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {resumes.map((resume) => {
          const id = resume.id ?? "";
          const title = resume.title?.trim() || t("build.untitledResume");
          const busy = loadingId === id;
          return (
            <li key={id}>
              <button
                type="button"
                disabled={disabled || !id || loadingId !== null}
                onClick={() => void choose(id, title)}
                className="flex min-h-11 w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 flex-none animate-spin" />
                ) : (
                  <FileText aria-hidden="true" className="h-4 w-4 flex-none text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{title}</span>
                {resume.headline ? (
                  <span className="hidden min-w-0 max-w-[45%] truncate text-xs text-muted-foreground sm:inline">
                    {resume.headline}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

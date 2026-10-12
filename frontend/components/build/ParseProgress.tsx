/**
 * The résumé-parse wait on the kit workspace: a checklist of what is being read
 * (contact → experience → education → skills → projects → layout), each step
 * with its own bar, so the visitor sees the work moving and stays put.
 *
 * Steps are paced (useStagedProgress) inside the window the streamed parse
 * stage allows — reading holds before education, structuring before layout,
 * refinement is layout — and the last one holds until the result lands. Then
 * the remaining steps tick through to done (the intake holds the result for
 * PARSE_COMPLETE_HOLD_MS) before this unmounts and the résumé takes its place. Streamed
 * previews put what was actually found beside each step. Without progress
 * (a non-streaming API) the steps simply pace.
 */
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2 } from "lucide-react";
import type { ResumeParseStage } from "@shared/resume-parse-stream";
import { PARSE_COMPLETE_HOLD_MS, type ResumeParseProgress } from "@/lib/services/resume-parse-stream";
import { useStagedProgress } from "@/lib/build/use-staged-progress";
import { cn } from "@/lib/utils";

const STEPS = [
  "build.parseProgress.contact",
  "build.parseProgress.experience",
  "build.parseProgress.education",
  "build.parseProgress.skills",
  "build.parseProgress.projects",
  "build.parseProgress.layout",
] as const;

const STEP_MS = 2600;
/** The held last step creeps instead of filling — it ends when the parse does. */
const LAST_STEP_MS = 30_000;

/** Once the result lands, every remaining step (plus the final "all done")
 *  ticks through inside the intake's hold. */
const FINISH_STEP_MS = Math.floor(PARSE_COMPLETE_HOLD_MS / (STEPS.length + 2));

/** Step indices (into STEPS) each streamed stage lets the pacing reach. */
const STAGE_WINDOW: Record<ResumeParseStage, { floor: number; ceiling: number }> = {
  read: { floor: 0, ceiling: 1 },
  ocr: { floor: 0, ceiling: 1 },
  structure: { floor: 1, ceiling: 4 },
  refine: { floor: 5, ceiling: 5 },
};

/** Entries with at least one non-empty identifying field. */
function countReal(list: unknown, keys: readonly string[]): number {
  if (!Array.isArray(list)) return 0;
  return list.filter((item: Record<string, unknown> | null) =>
    keys.some((k) => typeof item?.[k] === "string" && (item[k] as string).trim()),
  ).length;
}

function countSkills(list: unknown): number {
  if (!Array.isArray(list)) return 0;
  return list.reduce((total: number, s: { name?: unknown; keywords?: unknown } | null) => {
    const keywords = Array.isArray(s?.keywords) ? s.keywords.filter(Boolean).length : 0;
    return total + (keywords > 0 ? keywords : s?.name ? 1 : 0);
  }, 0);
}

/** What the streamed preview has found, per step (index-aligned with STEPS). */
function useFoundDetails(preview: Record<string, unknown> | null): Array<string | null> {
  const { t } = useTranslation();
  if (!preview) return STEPS.map(() => null);
  const name = (preview.basics as { name?: unknown } | undefined)?.name;
  const roles = countReal(preview.work, ["name", "position"]);
  const schools = countReal(preview.education, ["institution", "area"]);
  const skills = countSkills(preview.skills);
  const extras = countReal(preview.projects, ["name"]) + countReal(preview.certificates, ["name"]);
  return [
    typeof name === "string" && name.trim() ? name.trim() : null,
    roles > 0 ? t("build.parseProgress.roles", { count: roles }) : null,
    schools > 0 ? t("build.parseProgress.schools", { count: schools }) : null,
    skills > 0 ? t("build.parseProgress.skillsFound", { count: skills }) : null,
    extras > 0 ? t("build.parseProgress.projectsFound", { count: extras }) : null,
    null,
  ];
}

interface ParseProgressProps {
  /** Streamed parse progress; null paces the steps on time alone. */
  progress?: ResumeParseProgress | null;
}

export default function ParseProgress({ progress = null }: ParseProgressProps) {
  const { t } = useTranslation();
  const complete = progress?.complete === true;
  const stageWindow = complete
    ? { ceiling: STEPS.length }
    : progress
      ? STAGE_WINDOW[progress.stage]
      : undefined;
  // `active === STEPS.length` means every step is done.
  const active = useStagedProgress(STEPS.length, complete ? FINISH_STEP_MS : STEP_MS, stageWindow);
  const found = useFoundDetails(progress?.preview ?? null);
  const pages =
    progress?.stage === "ocr" && progress.pages && progress.pages > 1
      ? t("build.parseProgress.pages", { page: progress.page ?? 0, pages: progress.pages })
      : null;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4 text-left">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-[15px] font-semibold text-foreground">{t("build.parseProgress.title")}</p>
        {pages && <p className="text-xs text-muted-foreground">{pages}</p>}
      </div>
      <ol className="flex flex-col gap-3">
        {STEPS.map((key, i) => {
          const state = i < active ? "done" : i === active ? "active" : "pending";
          return (
            <li key={key} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-6 w-6 flex-none items-center justify-center rounded-full border",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "active" && "border-primary text-primary",
                  state === "pending" && "border-input text-muted-foreground",
                )}
              >
                {state === "done" && <Check className="h-3.5 w-3.5" />}
                {state === "active" && <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span
                    className={cn(
                      "text-sm",
                      state === "pending" ? "text-muted-foreground" : "font-medium text-foreground",
                    )}
                  >
                    {t(key)}
                  </span>
                  {found[i] && <span className="min-w-0 truncate text-xs text-muted-foreground">{found[i]}</span>}
                </span>
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                  {state !== "pending" && (
                    <span
                      className={cn(
                        "block h-full rounded-full bg-primary",
                        state === "done" ? "w-full" : "w-[4%] motion-safe:animate-progress-fill",
                      )}
                      style={
                        state === "active"
                          ? ({
                            "--fill-ms": `${i === STEPS.length - 1 || i === stageWindow?.ceiling ? LAST_STEP_MS : STEP_MS}ms`,
                          } as CSSProperties)
                          : undefined
                      }
                    />
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {t(STEPS[Math.min(active, STEPS.length - 1)])}
      </p>
      <p className="text-center text-xs text-muted-foreground">{t("build.parseProgress.stay")}</p>
    </div>
  );
}

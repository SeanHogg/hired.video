/**
 * KitStartBand — the studio home's start: "Make your résumé, cover letter
 * and video at once" with the kit drop zone, then "Or start with one" —
 * every start opens the same workspace (a new kit, its drop zone leading
 * with that slot — `?start=`) and the other two can be added there. The drop hands what was dropped to /studio/new as router
 * state (BuildEntryState), where the kit applies it.
 *
 * `aside` is a third start in the same row (the studio home passes its
 * template picks). With it, all three share the row from `lg`, the drop
 * zone kept narrow so the other two get room; below `lg` they stack.
 */
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText, Mail, Video, Briefcase } from "lucide-react";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import { cn } from "@/lib/utils";
import KitDropZone from "../kit/KitDropZone";

const STARTS = [
  { key: "resume", icon: FileText },
  { key: "letter", icon: Mail },
  { key: "video", icon: Video },
  { key: "job", icon: Briefcase },
] as const;

export default function KitStartBand({ aside }: { aside?: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <section
      aria-labelledby="kit-start"
      className={cn(
        "mb-12 grid gap-6",
        aside
          ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,1fr)]"
          : "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]",
      )}
    >
      <KitDropZone
        onStart={(state) => navigate(NEW_KIT_PATH, { state })}
        slotsRowFrom={aside ? "xl" : "lg"}
        heading={
          <div className="flex flex-col gap-1">
            <h2 id="kit-start" className="font-display text-xl font-bold tracking-[-0.02em] text-foreground">
              {t("workspace.home.startHeading")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("workspace.home.startSub")}</p>
          </div>
        }
      />
      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{t("workspace.home.orOne")}</h3>
        {STARTS.map(({ key, icon: Icon }) => (
          <Link
            key={key}
            to={`${NEW_KIT_PATH}?start=${key}`}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-left hover:border-primary/60"
          >
            <Icon className="h-5 w-5 flex-none text-primary" aria-hidden="true" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-foreground">{t(`workspace.home.start.${key}`)}</span>
              <span className="text-xs text-muted-foreground">{t(`workspace.home.start.${key}Hint`)}</span>
            </span>
          </Link>
        ))}
        <p className="text-xs text-muted-foreground">{t("workspace.home.sameWorkspace")}</p>
      </div>
      {aside}
    </section>
  );
}

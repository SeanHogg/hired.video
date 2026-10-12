/**
 * "This version" beside the job match: whether what is on the page is an
 * unsaved review (saving makes it a version of the ★ master), the master
 * itself, a saved version of it, or a résumé with no master link. Lineage
 * facts come from useResumeLineage (the same ones LineageBadge shows).
 */
import { useTranslation } from "react-i18next";
import type { ResumeLineage } from "@shared/resume-lineage";
import LineageBadge from "@/components/build/review/LineageBadge";

interface Props {
  lineage: ResumeLineage | null;
  /** A tailor / create-from-a-job review is open and not saved yet. */
  unsaved: boolean;
}

function bodyOf(lineage: ResumeLineage | null, unsaved: boolean): { key: string; values?: Record<string, string | number> } {
  const master = lineage?.master?.title;
  if (unsaved) return master ? { key: "build.match.version.unsavedOfMaster", values: { master } } : { key: "build.match.version.unsaved" };
  if (lineage?.role === "master") return { key: "build.match.version.isMaster" };
  if (lineage?.role === "version" && master) return { key: "build.match.version.isVersion", values: { master } };
  return { key: "build.match.version.standalone" };
}

export default function VersionNote({ lineage, unsaved }: Props) {
  const { t } = useTranslation();
  const body = bodyOf(lineage, unsaved);
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-3 text-[13px] text-foreground">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("build.match.version.title")}</h3>
      {!unsaved && <LineageBadge lineage={lineage} />}
      <p className="leading-relaxed">{t(body.key, body.values ?? {})}</p>
      {!unsaved && lineage?.role === "version" && lineage.stale && (
        <p className="text-review-foreground">{t("build.match.version.stale")}</p>
      )}
    </section>
  );
}

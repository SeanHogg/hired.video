// Public-profile Templates tab — every public template the profile owner
// published (the owner also sees their private / unlisted drafts), résumé templates included (#866): a résumé template is a studio
// template with documentKind 'resume', so ONE listing (studio templates by
// creator) carries them all; they're grouped by what they make. Cards are
// the shared marketplace TemplateCard, so a template looks and applies the
// same here as on /templates. Self-fetching + self-gating; the parent only
// passes `userId` + `isOwner`. Mirrors ProfileArticlesPanel /
// ProfileCoursesPanel so the tab strip is consistent (#909).

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import TemplateCard from "@/components/resume-renderer/TemplateCard";
import { studioTemplatesService, type StudioTemplate } from "@/lib/services/studio-templates-service";
import { groupProfileTemplates } from "@/lib/templates/profile-groups";
import type { TemplateMeta } from "@/lib/templates/types";
import EmptyProgramState from "./EmptyProgramState";

interface Props {
  userId: string;
  isOwner: boolean;
}

export default function ProfileTemplatesPanel({ userId, isOwner }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<StudioTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // The owner also sees their private / unlisted ones (e.g. a résumé
    // design they just saved from the career kit); everyone else, public only.
    (isOwner ? studioTemplatesService.listMine() : studioTemplatesService.listPublicByCreator(userId))
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isOwner]);

  const groups = useMemo(() => groupProfileTemplates(items), [items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground" role="status">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> {t("profileTemplates.loading")}
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyProgramState program="templates" isOwner={isOwner} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <TemplateGroup title={t("profileTemplates.resumeGroup")} templates={groups.resume} />
      <TemplateGroup title={t("profileTemplates.otherGroup")} templates={groups.other} />
    </div>
  );
}

function TemplateGroup({ title, templates }: { title: string; templates: TemplateMeta[] }) {
  if (templates.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h3 className="text-sm font-semibold text-muted-foreground">
        {title} <span className="font-normal">({templates.length})</span>
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {templates.map((meta) => (
          <TemplateCard key={meta.origin.kind === "studio-creator" ? meta.origin.template.id : meta.slug} meta={meta} />
        ))}
      </div>
    </section>
  );
}

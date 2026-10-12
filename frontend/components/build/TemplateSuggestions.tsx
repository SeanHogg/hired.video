/**
 * "Templates picked for you" — the top-ranked resume templates, previewed
 * with the visitor's OWN content (TemplatePreview, the same thumbnail the
 * marketplace cards use). Selecting one re-skins the preview pane.
 */
import { useTranslation } from "react-i18next";
import TemplatePreview from "@/components/templates/TemplatePreview";
import { getStaticTemplateBySlug } from "@/lib/templates/registry";
import type { TemplateMeta } from "@/lib/templates/types";
import { cn } from "@/lib/utils";
import type { Resume } from "@/types/resume";

interface TemplateSuggestionsProps {
  slugs: readonly string[];
  selected: string;
  onSelect: (slug: string) => void;
  resume: Resume;
}

export default function TemplateSuggestions({ slugs, selected, onSelect, resume }: TemplateSuggestionsProps) {
  const { t } = useTranslation();
  const metas = slugs.map((s) => getStaticTemplateBySlug(s)).filter((m): m is TemplateMeta => m !== null);
  if (metas.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {t("build.templates.title")}
      </h2>
      <ul className="grid grid-cols-3 gap-2">
        {metas.map((meta) => {
          const active = meta.slug === selected;
          return (
            <li key={meta.slug} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(meta.slug)}
                aria-pressed={active}
                aria-label={t("build.templates.use", { name: meta.name })}
                className={cn(
                  "flex w-full flex-col gap-1.5 rounded-xl bg-card text-left text-foreground transition-colors",
                  active ? "border-2 border-primary p-2" : "border border-border p-[9px] hover:border-primary/60",
                )}
              >
                <span
                  className="relative block aspect-[8.5/11] overflow-hidden rounded-[4px] bg-card shadow-[inset_0_0_0_1px_hsl(var(--border))]"
                  aria-hidden="true"
                >
                  <span
                    className="pointer-events-none absolute left-0 top-0 block origin-top-left"
                    style={{ width: 900, transform: "scale(0.14)" }}
                  >
                    <TemplatePreview meta={meta} resume={resume} compact />
                  </span>
                </span>
                <span className="block truncate text-xs font-semibold">{meta.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// BlogStudioTemplateRow — self-gating preview row for Studio video
// templates referenced from a blog post. Owns its visibility (returns
// null when the post doesn't list any template files or when none of the
// listed files match the registered visual themes). Per the project's DRY
// rule, the consumer never needs to gate this component itself.
//
// Each card links to `/studio?template=<file>` which StudioLanding's mount
// deep-link effect picks up (dynamic-imports `loadTemplate`, seeds a v2 draft
// via the `kind:"script"` create seam) to pre-load the worked-example.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import MonoChip from "@/components/templates/MonoChip";
import { VISUAL_THEMES, type VisualTheme } from "@/lib/studio/visual-themes";

interface Props {
  files: string[] | undefined;
}

export default function BlogStudioTemplateRow({ files }: Props) {
  const { t } = useTranslation();
  if (!files || files.length === 0) return null;
  const matched = files
    .map((file) => VISUAL_THEMES.find((theme) => theme.file === file))
    .filter((theme): theme is VisualTheme => Boolean(theme));
  if (matched.length === 0) return null;

  return (
    <div className="my-8 grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-4">
      {matched.map((theme) => (
        <Link
          key={theme.file}
          to={`/studio?template=${theme.file}`}
          className="group flex flex-col gap-3 rounded-[18px] border border-border bg-card p-3.5 transition-colors hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("blog.studioTemplate.useAria", { name: theme.label })}
        >
          {/* The theme's own palette (data, not UI chrome): canvas,
              accent and surface swatches. */}
          <div className="flex h-24 overflow-hidden rounded-xl border border-border" aria-hidden="true">
            {theme.colors.map((color, i) => (
              <span key={`${color}-${i}`} className={i === 0 ? "flex-[3]" : "flex-1"} style={{ background: color }} />
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <MonoChip className="self-start">
              {theme.pattern
                ? t("blog.studioTemplate.pattern", { pattern: theme.pattern.replace("-", " ") })
                : t("blog.studioTemplate.template")}
            </MonoChip>
            <span className="text-[15px] font-semibold leading-snug text-foreground">{theme.label}</span>
            <span className="text-[13px] text-muted-foreground">{theme.desc}</span>
          </div>
          <span className="mt-auto inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary transition-all group-hover:gap-2">
            {t("blog.studioTemplate.use")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>
      ))}
    </div>
  );
}

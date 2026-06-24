// BlogStudioTemplateRow — self-gating preview row for Studio video
// templates referenced from a blog post. Owns its visibility (returns
// null when the post doesn't list any template files or when none of the
// listed files match the registered TEMPLATES). Per the project's DRY
// rule, the consumer never needs to gate this component itself.
//
// Each card links to `/studio?template=<file>` which StudioLanding's mount
// deep-link effect picks up (dynamic-imports `loadTemplate`, seeds a v2 draft
// via the `kind:"script"` create seam) to pre-load the worked-example.

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { TEMPLATES } from "@/pages/studio/StudioSidebar";

interface Props {
  files: string[] | undefined;
}

export default function BlogStudioTemplateRow({ files }: Props) {
  if (!files || files.length === 0) return null;
  const matched = files
    .map((file) => TEMPLATES.find((t) => t.file === file))
    .filter((t): t is (typeof TEMPLATES)[number] => Boolean(t));
  if (matched.length === 0) return null;

  const grid =
    matched.length === 1
      ? "grid-cols-1"
      : matched.length === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`my-8 grid gap-4 ${grid}`}>
      {matched.map((t) => {
        const swatch = `linear-gradient(135deg, ${t.colors[0]} 0%, ${t.colors[1] ?? t.colors[0]} 50%, ${t.colors[2] ?? t.colors[1] ?? t.colors[0]} 100%)`;
        return (
          <Link
            key={t.file}
            to={`/studio?template=${t.file}`}
            className="group rounded-xl border bg-card overflow-hidden flex flex-col hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={`Use the ${t.label} video resume template`}
          >
            <div
              className="relative w-full h-40 border-b"
              style={{ background: swatch }}
            >
              <div className="absolute inset-0 flex items-end p-4">
                <div className="text-white">
                  <div className="text-xs uppercase tracking-wide opacity-80">
                    {t.pattern ? `${t.pattern.replace("-", " ")} pattern` : "Template"}
                  </div>
                  <div className="text-2xl font-bold leading-tight">{t.label}</div>
                </div>
              </div>
            </div>
            <div className="p-4 flex-1 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{t.desc}</p>
              <div className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
                Use this template <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

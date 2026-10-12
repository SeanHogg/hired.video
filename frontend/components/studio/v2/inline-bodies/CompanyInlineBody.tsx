/**
 * CompanyInlineBody — renders a company the user owns inside a
 * `linked-content` canvas widget. Mirrors the company-detail hero
 * (logo + name + tagline + industry + size + description + culture
 * tags + tech stack) so the widget reads like a thumbnail of the
 * company's public page.
 *
 * No `<DeclarativeCompanyRenderer/>` exists yet — when one lands this
 * body migrates to it like `ResumeInlineBody` did. Same pattern as
 * the other inline bodies: fetch by id, render inside
 * `<ScaledTemplateFrame/>`.
 */
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import {
  companyService,
  type CompanyProfile,
} from "@/lib/services/company-service";
import ScaledTemplateFrame from "./ScaledTemplateFrame";
import { InlineBodyMessage } from "./InlineBodyMessage";

interface CompanyInlineBodyProps {
  id: string;
}

export default function CompanyInlineBody({ id }: CompanyInlineBodyProps) {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadState("loading");
    companyService
      .getCompanyProfileById(id)
      .then((c) => {
        if (cancelled) return;
        setCompany(c);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadState === "loading") return <InlineBodyMessage label="Loading company…" />;
  if (loadState === "error" || !company) {
    return <InlineBodyMessage label="Couldn't load this company." />;
  }

  const data = company.data;
  const headquarters = data.headquarters;
  const hqLine = [headquarters?.city, headquarters?.state, headquarters?.country]
    .filter(Boolean)
    .join(", ");

  return (
    <ScaledTemplateFrame>
      <section className="bg-white px-10 py-8 text-slate-900">
        <header className="mb-6 flex items-center gap-6">
          {data.logo ? (
            <img
              src={data.logo}
              alt={data.name}
              className="h-20 w-20 rounded-md object-contain ring-1 ring-slate-200"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
              <Building2 className="h-10 w-10" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-3xl font-bold leading-tight">
              {data.name}
            </h1>
            {data.tagline && (
              <p className="mt-1 text-base text-slate-600">{data.tagline}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
              {data.industry && data.industry !== "Not specified" && (
                <span>{data.industry}</span>
              )}
              {data.size && data.size !== "Not specified" && (
                <span>· {data.size}</span>
              )}
              {hqLine && <span>· {hqLine}</span>}
              {data.founded && <span>· Founded {data.founded}</span>}
            </div>
          </div>
        </header>
        {data.description && (
          <p className="mb-6 text-sm leading-relaxed text-slate-700">
            {data.description}
          </p>
        )}
        {data.culture && data.culture.length > 0 && (
          <div className="mb-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Culture
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {data.culture.slice(0, 10).map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
        {data.technologies && data.technologies.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tech stack
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {data.technologies.slice(0, 12).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </ScaledTemplateFrame>
  );
}

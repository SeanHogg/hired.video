import { useParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import ResourceManager from "@/components/people/ResourceManager";
import { SURFACES } from "@/lib/people-ops/surfaces";

/**
 * Dynamic People-Ops surface page — /people/s/* resolves the splat to a
 * SurfaceDef and renders the generic ResourceManager. One page covers every
 * descriptor-driven CRUD surface (objectives, reviews, pulse, syncs,
 * scorecards, meeting-intel, workflows, headcount, pto, …).
 */
export default function PeopleSurface() {
  const params = useParams();
  const key = (params["*"] ?? "").replace(/\/$/, "");
  const def = SURFACES[key];
  useSEO("/people-ops");
  useBreadcrumbs([
    { name: "People Operations", url: "/people-ops" },
    { name: def?.title ?? "Surface", url: `/people/s/${key}` },
  ]);

  if (!def) {
    return (
      <AppShell bgClassName="bg-background">
        <main className="px-6 py-16 text-center text-muted-foreground">Unknown People-Ops surface.</main>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <ResourceManager def={def} />
    </AppShell>
  );
}

/**
 * v2 Studio landing page — the chooser shown to authenticated users
 * who have opted in to the new editor. Two sections: templates (start a
 * new video from a preset) and "My videos" (resume a project). Clicking
 * either deep-links into `/studio/:id` with the new editor mounted.
 *
 * The marketing page for unauthenticated users still lives in
 * StudioLayout.tsx and is unchanged. The opt-in dispatch in
 * StudioLayout decides which surface to render.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FilePlus2, Sparkles, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TEMPLATE_CATALOG } from "@/components/studio/templates/catalog";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import EditorVersionToggle from "@/components/studio/v2/EditorVersionToggle";

export default function StudioLandingV2() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projects, setProjects] = useState<StudioProject[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await studioService.getProjects();
        if (!cancelled) setProjects(res.data ?? []);
      } catch (err) {
        if (!cancelled) {
          toast({
            title: "Couldn't load your projects",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive",
          });
          setProjects([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const sortedProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects].sort((a, b) =>
      b.updateDateTime.localeCompare(a.updateDateTime),
    );
  }, [projects]);

  function openNewBlank() {
    navigate("/studio/new?template=basic");
  }

  function openTemplate(templateId: string) {
    navigate(`/studio/new?template=${encodeURIComponent(templateId)}`);
  }

  function openProject(id: string) {
    navigate(`/studio/${encodeURIComponent(id)}`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Studio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a new video from a template or continue editing an existing one.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <EditorVersionToggle compact />
          <Button onClick={openNewBlank} className="gap-2">
            <Plus className="h-4 w-4" />
            Create blank video
          </Button>
        </div>
      </header>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-medium">Create with templates</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <button
            type="button"
            onClick={openNewBlank}
            className="group flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-4 text-sm font-medium text-muted-foreground transition hover:border-brand-purple hover:bg-muted/60 hover:text-foreground"
          >
            <FilePlus2 className="h-8 w-8" />
            Blank
          </button>
          {TEMPLATE_CATALOG.map((template) => {
            const Icon = template.icon;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => openTemplate(template.id)}
                className="group flex aspect-[4/3] flex-col gap-2 overflow-hidden rounded-lg border border-border bg-card p-4 text-left transition hover:border-brand-purple hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-purple/10 text-brand-purple">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-auto">
                  <p className="text-sm font-medium leading-tight">
                    {template.label}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {template.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">My videos</h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="aspect-video animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : sortedProjects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center">
            <Video className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">No videos yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pick a template above to get started.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {sortedProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => openProject(project.id)}
                className="group overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-brand-purple hover:shadow-md"
              >
                <div className="relative aspect-video bg-gradient-to-br from-brand-purple/20 to-brand-blue/20">
                  {project.thumbnailUrl ? (
                    <img
                      src={project.thumbnailUrl}
                      alt={project.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Sparkles className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{project.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Updated{" "}
                    {new Date(project.updateDateTime).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

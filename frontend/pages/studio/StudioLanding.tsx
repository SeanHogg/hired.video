/**
 * Studio landing page — the PowerPoint-style chooser shown to every
 * authenticated user at /studio. Two sections: templates (start a new
 * video from a preset) and "My videos" (resume a project). Clicking
 * either navigates to `/studio/:id`, where the editor (v1 or v2 by
 * preference) opens.
 *
 * The templates section is a horizontal scroller with arrow controls,
 * category pills, and an inline search field — see TemplateCarousel
 * below for the scroll mechanics.
 *
 * Legacy deep-link forwarding: extensions and marketing CTAs sometimes
 * hit /studio with editor-relevant query params (`?capture=`, `?subject=`,
 * `?template=`, `?contentTemplate=`, `?studioTemplate=`). When detected,
 * the chooser auto-navigates to `/studio/new` preserving the params so
 * the editor receives them as today.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Sparkles,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  TEMPLATE_CATALOG,
  TEMPLATE_CATEGORIES,
  getTemplate,
  type TemplateCategory,
  type TemplateDef,
} from "@/components/studio/templates/catalog";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import EditorVersionToggle from "@/components/studio/v2/EditorVersionToggle";
import TemplateThumb from "@/components/studio/templates/TemplateThumb";
import { cn } from "@/lib/utils";
import { useEditorPreference } from "@/lib/studio/editor-v2/preferences";
import { seedCanvasFromTemplate } from "@/lib/studio/editor-v2/template-seeds";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";

// Legacy query params that mean "open the editor with this seed". When
// any of these appear on /studio, the chooser forwards to /studio/new
// preserving the params instead of rendering the catalog.
const EDITOR_DEEP_LINK_KEYS = [
  "subject",
  "capture",
  "template",
  "contentTemplate",
  "studioTemplate",
  "new",
] as const;

type CategoryFilter = "all" | TemplateCategory;

export default function StudioLanding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { isV2 } = useEditorPreference();
  const [projects, setProjects] = useState<StudioProject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

  // Legacy deep-link handling. Runs once on mount and short-circuits the
  // chooser when the URL already implies "open the editor".
  useEffect(() => {
    const projectIdParam = searchParams.get("projectId");
    if (projectIdParam) {
      navigate(`/studio/${encodeURIComponent(projectIdParam)}`, { replace: true });
      return;
    }
    const hasEditorParam = EDITOR_DEEP_LINK_KEYS.some((key) => searchParams.has(key));
    if (hasEditorParam) {
      navigate(`/studio/new?${searchParams.toString()}`, { replace: true });
    }
    // First-paint only — subsequent searchParam changes shouldn't bounce the
    // user out of the chooser.
  }, []);

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

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATE_CATALOG.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  // Create a real draft up front so it shows up in "My videos" immediately.
  // Both editors receive a stable GUID URL — no `/new` sentinel. The new
  // project's `kind` matches the user's editor preference so v2 users get
  // a seeded `timelineSpec` and v1 users get the legacy storyboard flow.
  async function createDraftAndOpen(templateId: string) {
    if (creating) return;
    setCreating(true);
    try {
      const template = getTemplate(templateId);
      const seededTimeline = isV2
        ? canvasStateToTimeline(seedCanvasFromTemplate(templateId))
        : undefined;
      const res = await studioService.saveDraft({
        name: template.defaultName,
        kind: isV2 ? "nle" : "scene",
        timelineSpec: seededTimeline,
      });
      const id = res.data?.id;
      if (!id) throw new Error("No project id returned");
      // Optimistically prepend so the user sees it under "My videos" if they
      // navigate back. The full record will refresh on next mount.
      setProjects((prev) => (prev ? [res.data!, ...prev] : [res.data!]));
      navigate(`/studio/${encodeURIComponent(id)}`);
    } catch (err) {
      toast({
        title: "Couldn't create video",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  function openNewBlank() {
    void createDraftAndOpen("basic");
  }

  function openTemplate(templateId: string) {
    void createDraftAndOpen(templateId);
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
          <Button onClick={openNewBlank} disabled={creating} className="gap-2">
            <Plus className="h-4 w-4" />
            {creating ? "Creating…" : "Create blank video"}
          </Button>
        </div>
      </header>

      <section className="mb-12">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-medium">Create with templates</h2>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates"
              className="h-9 pl-9"
            />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <CategoryPill
            label="Recommended"
            active={category === "all"}
            onClick={() => setCategory("all")}
          />
          {TEMPLATE_CATEGORIES.map((c) => (
            <CategoryPill
              key={c.id}
              label={c.label}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
            />
          ))}
        </div>

        <TemplateCarousel
          templates={filteredTemplates}
          onPick={openTemplate}
        />
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

function CategoryPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition",
        active
          ? "border-brand-purple bg-brand-purple/10 text-brand-purple"
          : "border-border bg-card text-muted-foreground hover:border-brand-purple/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function TemplateCarousel({
  templates,
  onPick,
}: {
  templates: TemplateDef[];
  onPick: (id: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [templates.length]);

  function scrollByCards(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    // One viewport-width step keeps the next visible card aligned to the edge.
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
        No templates match your search.
      </div>
    );
  }

  return (
    <div className="relative">
      <ArrowButton
        side="left"
        visible={canScrollLeft}
        onClick={() => scrollByCards(-1)}
      />
      <ArrowButton
        side="right"
        visible={canScrollRight}
        onClick={() => scrollByCards(1)}
      />
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:thin]"
      >
        {templates.map((template) => {
          const Icon = template.icon;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onPick(template.id)}
              className="group flex w-60 shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-brand-purple hover:shadow-md"
            >
              <TemplateThumb template={template} />
              <div className="flex items-start gap-2 p-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-purple/10 text-brand-purple">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-tight">
                    {template.label}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {template.desc}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ArrowButton({
  side,
  visible,
  onClick,
}: {
  side: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      tabIndex={visible ? 0 : -1}
      className={cn(
        "absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/95 shadow-md backdrop-blur transition hover:bg-background",
        side === "left" ? "-left-3" : "-right-3",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

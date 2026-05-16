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
  Globe,
  Pencil,
  Search,
  Video,
} from "lucide-react";
import { projectVisibilityVisual } from "@/lib/studio/visibility";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import ProjectDetailsSheet from "@/components/studio/shared/ProjectDetailsSheet";
import {
  TEMPLATE_CATALOG,
  TEMPLATE_CATEGORIES,
  type ContentTemplate,
  type TemplateCategory,
  type TemplateDef,
} from "@/components/studio/templates/catalog";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import VideoProjectThumbnail from "@/components/studio/shared/VideoProjectThumbnail";
import TemplateThumb from "@/components/studio/templates/TemplateThumb";
import WorkspaceSwitcher from "@/components/studio/WorkspaceSwitcher";
import WizardLauncher from "@/components/studio/shared/WizardLauncher";
import NewVideoSplitButton from "@/components/studio/shared/NewVideoSplitButton";
import { AppShell } from "@/components/AppShell";
import { cn } from "@/lib/utils";
import { selectionToQuery, useWorkspace } from "@/lib/hooks/useWorkspace";
import { useCreateStudioDraft } from "@/lib/studio/use-create-studio-draft";

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
  const { selection } = useWorkspace();
  const workspaceQuery = selectionToQuery(selection);
  const [projects, setProjects] = useState<StudioProject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  // Single drawer mounted at the page root — cards open it by setting
  // `detailsProject`. Avoids N drawers in the DOM for a long video grid.
  const [detailsProject, setDetailsProject] = useState<StudioProject | null>(null);
  // Optimistic prepend so the user sees their new project in "My videos"
  // if they navigate back. The hook does the saveDraft + navigate; we
  // only inject the local-cache update via `onCreated`.
  const { create, creating } = useCreateStudioDraft({
    onCreated: (created) => {
      setProjects((prev) => (prev ? [created, ...prev] : [created]));
    },
  });

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
    setLoading(true);
    (async () => {
      try {
        const res = await studioService.getProjects(undefined, workspaceQuery);
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
  }, [toast, workspaceQuery]);

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

  function openTemplate(templateId: string) {
    void create({ kind: "template", templateId: templateId as ContentTemplate });
  }

  function openProject(id: string) {
    navigate(`/studio/${encodeURIComponent(id)}`);
  }

  // Local-state patch after a project mutation (rename, SEO save). Keeps
  // the card grid in sync without a re-fetch.
  function patchProject(next: StudioProject) {
    setProjects((prev) =>
      prev ? prev.map((p) => (p.id === next.id ? next : p)) : prev,
    );
    setDetailsProject((cur) => (cur && cur.id === next.id ? next : cur));
  }

  return (
    <AppShell>
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Studio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a new video from a template or continue editing an existing one.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Wizard launcher — opens the 3-step "create your first video"
              modal. Mounted here (was previously duplicated on the v2
              editor header; the editor lost it 2026-05-14 because that
              header acts on the CURRENT project, not creates another). */}
          <WizardLauncher variant="button" />
          {/* Split-button "+ New <last-used-template> [▼]" — single
              source of truth for "start a new video" with last-used
              template memory. Replaces the inline Create-blank-video
              CTA so the same control + persistence used to exist on the
              editor toolbar now lives here only (DRY). */}
          <NewVideoSplitButton variant="primary" />
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
        {/* My videos header — title + workspace switcher inline. The
            switcher self-gates (returns null when the user has no
            companies / delegations to act through), so single-workspace
            users see a plain title. Selection persists across reloads
            and is shared with the editor's sidebar control. */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">My videos</h2>
          <WorkspaceSwitcher />
        </div>
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
              <StudioVideoCard
                key={project.id}
                project={project}
                onOpen={() => openProject(project.id)}
                onShowDetails={() => setDetailsProject(project)}
                onRenamed={patchProject}
              />
            ))}
          </div>
        )}
      </section>
      <ProjectDetailsSheet
        open={detailsProject !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsProject(null);
        }}
        project={detailsProject}
        onChange={patchProject}
      />
    </div>
    </AppShell>
  );
}

// Single video card. Hover overlay surfaces Edit + Details affordances —
// mirrors the TemplateCarousel hover pill pattern below so the two grids
// feel consistent. Title is inline-editable: hovering reveals a pencil
// hint, click swaps in an editable input that persists on blur/Enter via
// studioService.saveDraft. Optimistic local update through onRenamed.
function StudioVideoCard({
  project,
  onOpen,
  onShowDetails,
  onRenamed,
}: {
  project: StudioProject;
  onOpen: () => void;
  onShowDetails: () => void;
  onRenamed: (next: StudioProject) => void;
}) {
  const { toast } = useToast();
  const [titleDraft, setTitleDraft] = useState(project.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Re-sync local draft if the parent patches the project (e.g. after a
  // SEO save bumps the DTO).
  useEffect(() => {
    if (!editingTitle) setTitleDraft(project.title);
  }, [project.title, editingTitle]);

  // Focus the input when the user opts in (vs autoFocus, which jsx-a11y
  // flags because focus changes that aren't user-initiated reduce screen
  // reader usability).
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  async function commitRename() {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (!next || next === project.title) {
      setTitleDraft(project.title);
      return;
    }
    setRenaming(true);
    try {
      const res = await studioService.saveDraft({
        projectId: project.id,
        name: next,
      });
      if (res.data) onRenamed(res.data);
    } catch (err) {
      // Keep the user's draft in the input so they can retry without
      // retyping (#663). The toast offers a one-click retry action that
      // re-enters edit mode pinned to the same draft.
      toast({
        title: "Couldn't rename",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
        action: (
          <ToastAction
            altText="Retry rename"
            onClick={() => {
              setEditingTitle(true);
              queueMicrotask(() => titleInputRef.current?.focus());
            }}
          >
            Retry
          </ToastAction>
        ),
      });
    } finally {
      setRenaming(false);
    }
  }

  // At-a-glance visibility indicator. Doubles as the details opener so
  // users have a single, always-visible affordance to inspect a video.
  // Visual decision resolved via the shared `projectVisibilityVisual`
  // helper so this surface and `VisibilityChip` stay in lockstep
  // (#673).
  const { Icon: VisibilityIcon, label: visibilityLabel } =
    projectVisibilityVisual(project.isPublic);

  return (
    <div className="group overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-brand-purple hover:shadow-md">
      <div className="relative aspect-video overflow-hidden">
        <button
          type="button"
          onClick={onOpen}
          className="block h-full w-full"
          aria-label={`Open ${project.title}`}
        >
          <VideoProjectThumbnail project={project} />
        </button>
        {/* Always-visible visibility badge — top-right of the thumbnail.
            Clicking opens the Details side panel where the visibility
            can be flipped (and SEO + metrics live). */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onShowDetails();
          }}
          title={`${visibilityLabel} — click for details`}
          aria-label={`${visibilityLabel} — open details`}
          className={cn(
            "absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold shadow-md backdrop-blur transition",
            project.isPublic
              ? "bg-emerald-500/90 text-white hover:bg-emerald-500"
              : "bg-white/90 text-slate-900 hover:bg-white",
          )}
        >
          <VisibilityIcon className="h-3 w-3" />
          {visibilityLabel}
        </button>
        {/* Hover overlay — Edit pill takes the user straight into the
            editor; Details pill opens the side panel. The always-
            visible visibility badge above is also an opener but reads
            as a status indicator first; the Details pill is the
            "manage everything" affordance, so both coexist. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-md hover:bg-slate-100"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShowDetails();
            }}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-md hover:bg-slate-100"
          >
            <Globe className="h-3.5 w-3.5" />
            Details
          </button>
        </div>
      </div>
      <div className="p-3">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              } else if (e.key === "Escape") {
                setTitleDraft(project.title);
                setEditingTitle(false);
              }
            }}
            className="block w-full truncate rounded border border-border bg-background px-1.5 py-0.5 text-sm font-medium outline-none focus:border-brand-purple"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            className="flex w-full items-center gap-1.5 text-left"
            aria-label={`Rename ${project.title}`}
          >
            <span className="truncate text-sm font-medium">
              {project.title}
            </span>
            <Pencil
              className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          </button>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {renaming
            ? "Saving…"
            : `Updated ${new Date(project.updateDateTime).toLocaleDateString()}`}
        </p>
      </div>
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
              <div className="relative">
                <TemplateThumb template={template} />
                {/* Hover affordance — without it the cards read as
                    "pick a category", not "click to start a new video
                    in this template". The overlay only appears on
                    hover/focus, so the grid stays calm at rest. */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-md">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </span>
                </div>
              </div>
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

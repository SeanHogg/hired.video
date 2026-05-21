/**
 * Studio landing page — the PowerPoint-style chooser shown to every
 * authenticated user at /studio. Two sections: templates (start a new
 * video from a preset) and "My videos" (resume a project). Clicking
 * either navigates to `/studio/:id`, where the editor opens.
 *
 * The templates section is a horizontal scroller with arrow controls,
 * category pills, and an inline search field — see UnifiedTemplateCarousel
 * below for the scroll mechanics. Built-in catalog rows and the user's
 * own published/claimed/purchased rows share one scroller, with filter
 * pills (All / built-in categories / Created / Purchased) gating which
 * subset is visible.
 *
 * Deep-link handling — extensions, entity cards (ResumeCard / JobCard /
 * etc.), marketing CTAs, and the marketplace "Use" button sometimes hit
 * /studio with editor-relevant query params (`?capture=`, `?subject=`,
 * `?contentTemplate=`, `?studioTemplate=`, `?new=1`). Every variant mints
 * the project SERVER-SIDE via `useCreateStudioDraft` and navigates
 * straight to `/studio/<real-id>` — the legacy `/studio/new` bouncer is
 * gone. UI-state seeds that the editor still reads from the URL
 * (`?capture=`) are forwarded along on the destination URL.
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Globe,
  Pencil,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  User as UserIcon,
  Video,
} from "lucide-react";
import { projectVisibilityVisual } from "@/lib/studio/visibility";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import ProjectDetailsSheet from "@/components/studio/shared/ProjectDetailsSheet";
import DeleteProjectConfirm from "@/components/studio/shared/DeleteProjectConfirm";
import {
  TEMPLATE_CATALOG,
  TEMPLATE_CATEGORIES,
  type ContentTemplate,
  type TemplateCategory,
  type TemplateDef,
} from "@/components/studio/templates/catalog";
import { slugToBuiltinId, studioBuiltinSlug } from "@/lib/templates/registry";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import {
  studioTemplatesService,
  type LicensedStudioTemplate,
  type StudioTemplate,
} from "@/lib/services/studio-templates-service";
import { parseStudioSubject } from "@shared/studio-subject";
import {
  MEDIA_KINDS,
  MEDIA_KIND_UI,
  type MediaKind,
} from "@shared/media-kinds";
import type { VideoScript } from "@/types/video-script";
import VideoProjectThumbnail from "@/components/studio/shared/VideoProjectThumbnail";
import TemplateThumb from "@/components/studio/templates/TemplateThumb";
import MediaKindBadge from "@/components/studio/shared/MediaKindBadge";
import WorkspaceSwitcher from "@/components/studio/WorkspaceSwitcher";
import WizardLauncher from "@/components/studio/shared/WizardLauncher";
import NewVideoSplitButton from "@/components/studio/shared/NewVideoSplitButton";
import { AppShell } from "@/components/AppShell";
import { cn } from "@/lib/utils";
import { selectionToQuery, useWorkspace } from "@/lib/hooks/useWorkspace";
import { useCreateStudioDraft } from "@/lib/studio/use-create-studio-draft";

// UI-state seed params the editor reads from `searchParams` (not from
// project state). When the chooser forwards a deep-link to the freshly-
// minted /studio/<id> URL, these survive as query params so the editor
// honours them on first paint. Non-listed params are dropped.
const EDITOR_FORWARDED_PARAMS = ["capture"] as const;

// The chooser carries TWO orthogonal filter axes per #906 / PRD §6.1:
//
//   - `kindFilter` (Type)    — MediaKind | "all". Reads `MEDIA_KINDS` so
//                              adding a kind doesn't touch this file.
//   - `useForFilter` (Use-for) — TemplateCategory | created | purchased | "all".
//                                The pre-existing single-axis filter.
//
// The two axes AND together: picking `Podcast` + `Promote` shows podcast
// templates in the promote bucket only. "All" on a row disables that
// axis. Per the standing DRY rule, both rows render their pills from
// the canonical registries — no parallel pill arrays here.
type UseForFilter = "all" | TemplateCategory | "created" | "purchased";
type KindFilter = "all" | MediaKind;

// Normalised shape the owned-template surfaces consume so the card +
// carousel renderers don't branch on "is this a creator-published row or
// a license join". The provenance field gates the badge label and the
// Edit affordance — only `created` rows get an edit pencil because
// purchased rows don't belong to the viewer.
type OwnedTemplate = {
  template: StudioTemplate;
  provenance: "created" | "purchased" | "claimed";
};

// Discriminated row the unified carousel renders — built-in catalog rows
// and owned rows share one scroller, the card switches on `kind`.
type TemplateRow =
  | { kind: "builtin"; template: TemplateDef }
  | { kind: "owned"; owned: OwnedTemplate };

export default function StudioLanding() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { selection } = useWorkspace();
  const workspaceQuery = selectionToQuery(selection);
  const [projects, setProjects] = useState<StudioProject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  // Two orthogonal filter axes — see UseForFilter / KindFilter above.
  const [useForFilter, setUseForFilter] = useState<UseForFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  // User's own published templates + claimed/purchased licensed templates.
  // Single source of truth feeding the unified Templates section — both
  // the "All" merged view and the dedicated Created/Purchased filters.
  const [userCreatedTemplates, setUserCreatedTemplates] = useState<StudioTemplate[]>([]);
  const [userLicensedTemplates, setUserLicensedTemplates] = useState<LicensedStudioTemplate[]>([]);
  const [userTemplatesLoading, setUserTemplatesLoading] = useState(true);
  // Single drawer mounted at the page root — cards open it by setting
  // `detailsProject`. Avoids N drawers in the DOM for a long video grid.
  const [detailsProject, setDetailsProject] = useState<StudioProject | null>(null);
  // Same pattern for the delete confirm — one AlertDialog instance, cards
  // flip the target to request confirmation.
  const [deletingProject, setDeletingProject] = useState<StudioProject | null>(null);
  // Optimistic prepend so the user sees their new project in "My videos"
  // if they navigate back. Skips the hook's internal navigate so the
  // deep-link forwarder below can append UI-state seed params (capture
  // mode, etc.) onto the destination URL.
  const { create, creating } = useCreateStudioDraft({
    skipNavigate: true,
    onCreated: (created) => {
      setProjects((prev) => (prev ? [created, ...prev] : [created]));
    },
  });

  // Deep-link handling. Runs once on mount; every variant mints a real
  // project server-side and navigates to /studio/<real-id> with any
  // UI-state seed params (?capture=) forwarded along. No /studio/new
  // sentinel anywhere in this path.
  useEffect(() => {
    const projectIdParam = searchParams.get("projectId");
    if (projectIdParam) {
      navigate(`/studio/${encodeURIComponent(projectIdParam)}`, { replace: true });
      return;
    }

    // Compose the destination query string from the whitelisted set of
    // editor UI-state params (only ?capture today; expanded by adding
    // entries to EDITOR_FORWARDED_PARAMS). Single helper so every branch
    // below shares one forwarding rule — no per-branch string surgery.
    const forwarded = new URLSearchParams();
    for (const key of EDITOR_FORWARDED_PARAMS) {
      const v = searchParams.get(key);
      if (v) forwarded.set(key, v);
    }
    const navigateToProject = (project: StudioProject | null) => {
      if (!project) return;
      const qs = forwarded.toString();
      navigate(
        `/studio/${encodeURIComponent(project.id)}${qs ? `?${qs}` : ""}`,
        { replace: true },
      );
    };

    const contentTemplateSlug = searchParams.get("contentTemplate");
    if (contentTemplateSlug) {
      const id = slugToBuiltinId(contentTemplateSlug);
      if (id) {
        void create({ kind: "template", templateId: id }).then(navigateToProject);
        return;
      }
    }
    const studioTemplateSlug = searchParams.get("studioTemplate");
    if (studioTemplateSlug) {
      void (async () => {
        try {
          const tpl = await studioTemplatesService.getBySlug(studioTemplateSlug);
          const script = tpl.videoScript as VideoScript | null | undefined;
          if (!script) {
            toast({
              title: "Template has no content",
              description: "The creator hasn't finished setting it up yet.",
              variant: "destructive",
            });
            return;
          }
          const created = await create({ kind: "script", script, name: tpl.name });
          navigateToProject(created);
        } catch (err) {
          toast({
            title: "Couldn't load template",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive",
          });
        }
      })();
      return;
    }
    // Non-template seed paths — entity-card "Create Video" buttons emit
    // ?subject=resume:abc&new=1; the chrome extension emits ?capture=...;
    // marketing CTAs sometimes emit ?new=1 to force a fresh start.
    // All three now mint a blank server-side draft (with subjects if
    // present) and land the user on /studio/<real-id>?capture=... so
    // the editor receives the UI-state seed without a route bounce.
    const subject = parseStudioSubject(searchParams.get("subject"));
    const wantsBlank =
      subject !== null ||
      searchParams.has("capture") ||
      searchParams.has("new");
    if (wantsBlank) {
      void create({
        kind: "blank",
        subjects: subject ? [subject] : undefined,
      }).then(navigateToProject);
    }
    // First-paint only — subsequent searchParam changes shouldn't bounce the
    // user out of the chooser.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Load the user's own + licensed templates once on mount. Both endpoints
  // soft-fail to an empty list — a network blip or 401 shouldn't break the
  // built-in carousel, which is the primary CTA on this page.
  useEffect(() => {
    let cancelled = false;
    setUserTemplatesLoading(true);
    Promise.all([
      studioTemplatesService.listMine().catch(() => [] as StudioTemplate[]),
      studioTemplatesService.listMyLicensedTemplates().catch(
        () => [] as LicensedStudioTemplate[],
      ),
    ]).then(([mine, licensed]) => {
      if (cancelled) return;
      setUserCreatedTemplates(mine);
      setUserLicensedTemplates(licensed);
      setUserTemplatesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects].sort((a, b) =>
      b.updateDateTime.localeCompare(a.updateDateTime),
    );
  }, [projects]);

  // Composed list of every template the user owns — their own published
  // rows plus their claimed/purchased licenses. Sorted by most-recent so
  // the freshly-acquired template lands at the front. Search query
  // applies here so users can find a specific one without scrolling.
  const ownedTemplates = useMemo<OwnedTemplate[]>(() => {
    const q = query.trim().toLowerCase();
    const created: OwnedTemplate[] = userCreatedTemplates.map((t) => ({
      template: t,
      provenance: "created" as const,
    }));
    const licensed: OwnedTemplate[] = userLicensedTemplates.map((row) => ({
      template: row.template,
      provenance:
        row.license.source === "purchase" ? ("purchased" as const) : ("claimed" as const),
    }));
    const merged = [...created, ...licensed];
    const filtered = merged.filter(({ template: t }) => {
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
      );
    });
    filtered.sort((a, b) =>
      (b.template.updatedAt ?? "").localeCompare(a.template.updatedAt ?? ""),
    );
    return filtered;
  }, [userCreatedTemplates, userLicensedTemplates, query]);

  // Unified row list for the single carousel. Owned rows lead the "All"
  // view so the user's own stuff sits before the starter catalog — the
  // built-ins are always reachable, but a recurring user expects to see
  // their library first. Category pills scope to built-ins;
  // Created/Purchased pills scope to owned.
  const filteredRows = useMemo<TemplateRow[]>(() => {
    const showOwned = useForFilter === "all" || useForFilter === "created" || useForFilter === "purchased";
    const showBuiltins = useForFilter === "all" || (useForFilter !== "created" && useForFilter !== "purchased");

    const q = query.trim().toLowerCase();
    const builtinRows: TemplateRow[] = showBuiltins
      ? TEMPLATE_CATALOG.filter((t) => {
          if (useForFilter !== "all" && t.category !== useForFilter) return false;
          if (kindFilter !== "all" && t.mediaKind !== kindFilter) return false;
          if (!q) return true;
          return (
            t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)
          );
        }).map((t) => ({ kind: "builtin" as const, template: t }))
      : [];

    const ownedRows: TemplateRow[] = showOwned
      ? ownedTemplates
          .filter((o) => {
            if (useForFilter === "created") return o.provenance === "created";
            if (useForFilter === "purchased") return o.provenance !== "created";
            return true;
          })
          // Creator-published templates don't yet carry mediaKind on the
          // row (#909) so they're implicitly `video`. When the kind filter
          // is set to anything other than `all` or `video`, drop them so
          // the carousel doesn't show stale video-shaped owned templates
          // under "Podcast" / "Voice" / "Animation".
          .filter(() => kindFilter === "all" || kindFilter === "video")
          .map((o) => ({ kind: "owned" as const, owned: o }))
      : [];

    return [...ownedRows, ...builtinRows];
  }, [useForFilter, kindFilter, query, ownedTemplates]);

  function openTemplate(templateId: string) {
    // skipNavigate is set on the shared `create` so the deep-link
    // forwarder can append UI-state seed params (?capture=) onto the
    // destination URL. Carousel clicks don't need that, so route the
    // user straight to /studio/<id> here.
    void create({ kind: "template", templateId: templateId as ContentTemplate })
      .then((created) => {
        if (created) navigate(`/studio/${encodeURIComponent(created.id)}`);
      });
  }

  // Open a user-published (or claimed/purchased) studio template — mints
  // a new draft project from the template's canvas script and routes the
  // user to /studio/<real-id>. Mirrors the `?studioTemplate=` deep-link
  // handler above; kept inline here so the carousel/grid card clicks
  // don't need to fake a URL bounce.
  async function openStudioTemplate(template: StudioTemplate) {
    const script = template.videoScript as VideoScript | null | undefined;
    if (!script) {
      toast({
        title: "Template has no content",
        description: "The creator hasn't finished setting it up yet.",
        variant: "destructive",
      });
      return;
    }
    try {
      const created = await create({
        kind: "script",
        script,
        name: template.name,
      });
      if (created) navigate(`/studio/${encodeURIComponent(created.id)}`);
    } catch (err) {
      toast({
        title: "Couldn't open template",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  // Preview a user-published template — same listing page the
  // marketplace + built-in carousel both link to. Falls back to the
  // template id when the row hasn't generated a slug yet (private +
  // unlisted drafts).
  function previewStudioTemplate(template: StudioTemplate) {
    const slug = template.listingSlug ?? template.id;
    navigate(`/marketplace/templates/${slug}`);
  }

  // Click-through to the public marketplace preview page. Same URL the
  // homepage / search results / TemplateCard "Preview" buttons open, so
  // /studio cards and every other surface land on the same SEO page.
  function previewTemplate(templateId: ContentTemplate) {
    navigate(`/marketplace/templates/${studioBuiltinSlug(templateId)}`);
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
          <div>
            <h2 className="text-lg font-medium">Templates</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Start a new video from a preset, or reuse one you've published or purchased.
            </p>
          </div>
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

        {/* Type axis — MediaKind. Reads MEDIA_KINDS so adding a kind
            (#894 phases 4/5) doesn't touch this file. Self-hides
            entirely when the only kind in the catalog is `video` — no
            point showing a one-option filter row. */}
        <FilterPillRow
          label="Type"
          render={() => (
            <>
              <CategoryPill
                label="All"
                active={kindFilter === "all"}
                onClick={() => setKindFilter("all")}
              />
              {MEDIA_KINDS.map((kind) => (
                <CategoryPill
                  key={kind}
                  label={MEDIA_KIND_UI[kind].badgeLabel}
                  active={kindFilter === kind}
                  onClick={() => setKindFilter(kind)}
                />
              ))}
            </>
          )}
        />
        {/* Use-for axis — the pre-existing category + created/purchased
            row. AND'd with the Type axis above so picking Podcast +
            Promote shows podcast templates in the promote bucket. */}
        <FilterPillRow
          label="Use for"
          render={() => (
            <>
              <CategoryPill
                label="All"
                active={useForFilter === "all"}
                onClick={() => setUseForFilter("all")}
              />
              {TEMPLATE_CATEGORIES.map((c) => (
                <CategoryPill
                  key={c.id}
                  label={c.label}
                  active={useForFilter === c.id}
                  onClick={() => setUseForFilter(c.id)}
                />
              ))}
              {/* Owned-template filters — same row as the built-in
                  categories so the user has one consolidated filter
                  surface for every template visible on /studio. */}
              <CategoryPill
                label="Created"
                active={useForFilter === "created"}
                onClick={() => setUseForFilter("created")}
              />
              <CategoryPill
                label="Purchased"
                active={useForFilter === "purchased"}
                onClick={() => setUseForFilter("purchased")}
              />
            </>
          )}
        />

        <UnifiedTemplateCarousel
          rows={filteredRows}
          loading={userTemplatesLoading}
          useForFilter={useForFilter}
          kindFilter={kindFilter}
          onPickBuiltin={openTemplate}
          onPreviewBuiltin={previewTemplate}
          onPickOwned={openStudioTemplate}
          onPreviewOwned={previewStudioTemplate}
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
                onRequestDelete={() => setDeletingProject(project)}
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
      <DeleteProjectConfirm
        open={deletingProject !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingProject(null);
        }}
        project={deletingProject}
        onDeleted={(deletedId) => {
          setProjects((prev) =>
            prev ? prev.filter((p) => p.id !== deletedId) : prev,
          );
          setDeletingProject(null);
          if (detailsProject?.id === deletedId) setDetailsProject(null);
        }}
      />
    </div>
    </AppShell>
  );
}

// Single video card. Hover overlay surfaces Edit + Details affordances —
// mirrors the BuiltinTemplateCard hover pill pattern below so the two
// grids feel consistent. Title is inline-editable: hovering reveals a pencil
// hint, click swaps in an editable input that persists on blur/Enter via
// studioService.saveDraft. Optimistic local update through onRenamed.
function StudioVideoCard({
  project,
  onOpen,
  onShowDetails,
  onRenamed,
  onRequestDelete,
}: {
  project: StudioProject;
  onOpen: () => void;
  onShowDetails: () => void;
  onRenamed: (next: StudioProject) => void;
  onRequestDelete: () => void;
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
        {/* Kind badge — bottom-left, mirrors the template-card position
            so the chooser + "My videos" grid read symmetric. Self-hides
            when `mediaKind === "video"` — the StudioProject DTO defaults
            to 'video' for every pre-#894 row. */}
        <MediaKindBadge
          mediaKind={project.mediaKind ?? "video"}
          className="absolute bottom-2 left-2 z-10"
        />
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete();
            }}
            aria-label={`Delete ${project.title}`}
            title="Delete"
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-white text-red-600 shadow-md hover:bg-red-500 hover:text-white"
          >
            <Trash2 className="h-3.5 w-3.5" />
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

/**
 * Single-axis filter row with a left-rail label and a wrap of pills. ONE
 * component renders both the Type (#894 mediaKind) and Use-for axes so
 * a layout tweak (label position, spacing) lands in one place. Caller
 * supplies the pill JSX via `render` — keeps the row dumb to which axis
 * lives inside it.
 */
function FilterPillRow({
  label,
  render,
}: {
  label: string;
  render: () => ReactNode;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {render()}
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

/**
 * Single carousel that renders the consolidated Templates section —
 * built-in catalog rows and user-owned rows live side-by-side in one
 * horizontal scroller, gated by the same filter pills above. Owned rows
 * already lead the list when "All" is active (composed in `filteredRows`)
 * so the user's library sits ahead of the starter catalog.
 */
function UnifiedTemplateCarousel({
  rows,
  loading,
  useForFilter,
  kindFilter,
  onPickBuiltin,
  onPreviewBuiltin,
  onPickOwned,
  onPreviewOwned,
}: {
  rows: TemplateRow[];
  loading: boolean;
  useForFilter: UseForFilter;
  kindFilter: KindFilter;
  onPickBuiltin: (id: string) => void;
  onPreviewBuiltin: (id: ContentTemplate) => void;
  onPickOwned: (template: StudioTemplate) => void;
  onPreviewOwned: (template: StudioTemplate) => void;
}) {
  // Owned-only filters depend on the licensed-templates fetch; the
  // built-in catalog is static so it never reads from `loading`. Only
  // gate the skeleton on `loading` when the active filter actually needs
  // the owned set.
  const dependsOnOwned = useForFilter === "all" || useForFilter === "created" || useForFilter === "purchased";
  if (loading && dependsOnOwned) {
    return (
      <div className="flex gap-4 overflow-hidden pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="aspect-video w-60 shrink-0 animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    // Kind-aware empty-state copy. Driven by MEDIA_KIND_UI[kind].badgeLabel
    // so the "No Podcast templates yet…" message rolls out automatically
    // when the user filters to a kind that has no entries in the catalog.
    const kindLabel = kindFilter !== "all" ? MEDIA_KIND_UI[kindFilter].badgeLabel : null;
    const message = useForFilter === "created"
      ? kindLabel
        ? `You haven't published any ${kindLabel} templates yet.`
        : "You haven't published any templates yet."
      : useForFilter === "purchased"
        ? kindLabel
          ? `You haven't purchased or claimed any ${kindLabel} templates yet.`
          : "You haven't purchased or claimed any templates yet."
        : kindLabel
          ? `No ${kindLabel} templates match your search yet — pick a Video template to start while we ship more.`
          : "No templates match your search.";
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
        {message}
      </div>
    );
  }
  return (
    <HorizontalScroller itemCount={rows.length}>
      {rows.map((row) =>
        row.kind === "builtin" ? (
          <div
            key={`builtin:${row.template.id}`}
            className="w-60 shrink-0 snap-start"
          >
            <BuiltinTemplateCard
              template={row.template}
              onPick={onPickBuiltin}
              onPreview={onPreviewBuiltin}
            />
          </div>
        ) : (
          <div
            key={`owned:${row.owned.provenance}:${row.owned.template.id}`}
            className="w-60 shrink-0 snap-start"
          >
            <OwnedTemplateCard
              owned={row.owned}
              onPick={onPickOwned}
              onPreview={onPreviewOwned}
            />
          </div>
        ),
      )}
    </HorizontalScroller>
  );
}

function BuiltinTemplateCard({
  template,
  onPick,
  onPreview,
}: {
  template: TemplateDef;
  onPick: (id: string) => void;
  onPreview: (id: ContentTemplate) => void;
}) {
  const Icon = template.icon;
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-brand-purple hover:shadow-md">
      {/* Card body: clicking starts a new project from this template
          (the primary action on /studio). Wrapped in its own button so
          it doesn't nest with the Preview pill below. */}
      <button
        type="button"
        onClick={() => onPick(template.id)}
        className="flex flex-1 flex-col text-left"
        aria-label={`Use ${template.label} template`}
      >
        <div className="relative">
          <TemplateThumb template={template} />
          {/* Hover label confirms the click action. The Preview pill is
              rendered as a sibling button outside this one so click
              events route to the right handler. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-md">
              <Pencil className="h-3.5 w-3.5" />
              Use
            </span>
          </div>
          {/* Kind badge — bottom-left, always visible, self-hides for
              `mediaKind === "video"` so the existing video-only catalog
              doesn't gain redundant "Video" chips. */}
          <MediaKindBadge
            mediaKind={template.mediaKind}
            className="absolute bottom-2 left-2 z-10"
          />
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
      {/* Preview pill — opens /marketplace/templates/<slug>, the same
          SEO surface the homepage + search results link to. Positioned
          absolutely so it sits over the thumb without nesting inside
          the Use button. */}
      <button
        type="button"
        onClick={() => onPreview(template.id)}
        aria-label={`Preview ${template.label} template`}
        className="absolute right-2 top-2 z-10 hidden items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-md backdrop-blur transition hover:bg-white group-hover:flex group-focus-within:flex"
      >
        <Eye className="h-3.5 w-3.5" />
        Preview
      </button>
    </div>
  );
}

/**
 * Horizontal scroller with overflow arrow controls. itemCount is the
 * only signal the scroller needs to re-check its overflow bounds when
 * the visible cards change.
 */
function HorizontalScroller({
  itemCount,
  children,
}: {
  itemCount: number;
  children: ReactNode;
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
  }, [itemCount]);

  function scrollByCards(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
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
        {children}
      </div>
    </div>
  );
}

// ─── Owned templates (created + claimed/purchased) ──────────────────────────

/**
 * Self-contained card for a template the user owns — used inside the
 * Mine-mode carousel AND the dedicated "Your templates" grid below the
 * built-ins. Renders the row's thumbnail image (or a fallback marquee
 * for templates that don't have one yet) plus a provenance badge so the
 * user can tell their published rows from their purchased/claimed ones
 * at a glance. Self-gates the Preview pill: only public/unlisted rows
 * have a listing page, so private drafts render the card without it.
 */
function OwnedTemplateCard({
  owned,
  onPick,
  onPreview,
}: {
  owned: OwnedTemplate;
  onPick: (template: StudioTemplate) => void;
  onPreview: (template: StudioTemplate) => void;
}) {
  const { template, provenance } = owned;
  const badge = PROVENANCE_BADGE[provenance];
  const canPreview = template.visibility !== "private";
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-brand-purple hover:shadow-md">
      <button
        type="button"
        onClick={() => onPick(template)}
        className="flex flex-1 flex-col text-left"
        aria-label={`Use ${template.name} template`}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          {template.thumbnailUrl ? (
            <img
              src={template.thumbnailUrl}
              alt={template.name}
              className="h-full w-full object-cover"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 via-brand-purple/80 to-brand-blue text-white">
              <Sparkles className="h-6 w-6 opacity-80" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-md">
              <Pencil className="h-3.5 w-3.5" />
              Use
            </span>
          </div>
          {/* Kind badge — bottom-left, symmetric with BuiltinTemplateCard.
              Self-hides when the template is `video` so the existing
              owned-template surface stays clean. `studio_templates` does
              not yet carry a `media_kind` column (#909), so every owned
              template is implicitly `video` and the badge renders nothing.
              Once #909 lands, swap the hardcoded `"video"` for the
              template's own field. */}
          <MediaKindBadge
            mediaKind="video"
            className="absolute bottom-2 left-2 z-10"
          />
        </div>
        <div className="flex items-start gap-2 p-3">
          <div className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            badge.iconClassName,
          )}>
            <badge.Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">
              {template.name}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {template.description?.trim() || badge.fallbackBlurb}
            </p>
          </div>
        </div>
      </button>
      {/* Provenance badge — always visible so users can scan the grid
          and tell their own published rows from purchased/claimed ones
          without hovering. */}
      <span
        className={cn(
          "pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur",
          badge.pillClassName,
        )}
      >
        <badge.Icon className="h-3 w-3" />
        {badge.label}
      </span>
      {canPreview && (
        <button
          type="button"
          onClick={() => onPreview(template)}
          aria-label={`Preview ${template.name} template`}
          className="absolute right-2 top-2 z-10 hidden items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-md backdrop-blur transition hover:bg-white group-hover:flex group-focus-within:flex"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
      )}
    </div>
  );
}

const PROVENANCE_BADGE: Record<
  OwnedTemplate["provenance"],
  {
    label: string;
    Icon: typeof UserIcon;
    iconClassName: string;
    pillClassName: string;
    fallbackBlurb: string;
  }
> = {
  created: {
    label: "Yours",
    Icon: UserIcon,
    iconClassName: "bg-brand-purple/10 text-brand-purple",
    pillClassName: "bg-brand-purple/90 text-white",
    fallbackBlurb: "Your published template.",
  },
  purchased: {
    label: "Purchased",
    Icon: ShoppingBag,
    iconClassName: "bg-emerald-500/10 text-emerald-600",
    pillClassName: "bg-emerald-500/90 text-white",
    fallbackBlurb: "Template you purchased from the marketplace.",
  },
  claimed: {
    label: "Claimed",
    Icon: Sparkles,
    iconClassName: "bg-sky-500/10 text-sky-600",
    pillClassName: "bg-sky-500/90 text-white",
    fallbackBlurb: "Free template you claimed.",
  },
};

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

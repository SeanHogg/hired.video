/**
 * Studio landing page — the PowerPoint-style chooser shown to every
 * authenticated user at /studio. Two sections: templates (start a new
 * project from a preset) and "My projects" (resume an existing one —
 * videos, podcasts, voice, animations, games, comics, images all live
 * here post-#894). Clicking either navigates to `/studio/:id`, where
 * the editor opens.
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
import { TABLE_SURFACE, TABLE_HEAD } from "@/lib/ui/table-surface";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Eye,
  Globe,
  Pencil,
  ShoppingBag,
  Sparkles,
  Trash2,
  User as UserIcon,
  Video,
} from "lucide-react";
import { projectVisibilityVisual } from "@/lib/studio/visibility";
import { Button } from "@/components/ui/button";
import HeaderSearch from "@/components/HeaderSearch";
import Pagination, { usePaginatedList } from "@/components/Pagination";
import ViewModeToggle, {
  BROWSE_VIEW_MODES,
  type ViewMode,
} from "@/components/ViewModeToggle";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import ProjectDetailsSheet from "@/components/studio/shared/ProjectDetailsSheet";
import DeleteProjectConfirm from "@/components/studio/shared/DeleteProjectConfirm";
import {
  TEMPLATE_CATALOG,
  type ContentTemplate,
  type TemplateDef,
} from "@/components/studio/templates/catalog";
import TemplateCatalogFilters, {
  filterBuiltinTemplates,
  type TemplateKindFilter,
  type TemplateUseForFilter,
} from "@/components/studio/templates/TemplateCatalogFilters";
import { CategoryPill, FilterPillRow } from "@/components/studio/shared/FilterPills";
import { slugToBuiltinId, studioBuiltinSlug } from "@/lib/templates/registry";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { resumeService } from "@/lib/services/resume-service";
import { articleService } from "@/lib/services/article-service";
import { jobService } from "@/lib/services/job-service";
import {
  type DocumentState,
  createJobDocumentState,
  createResumeDocumentState,
} from "@/lib/studio/editor-v2/document-state";
import {
  DOCUMENT_AUTHORING,
  STUDIO_EDIT_PARAMS,
  type DocumentAuthoringKind,
} from "@/lib/studio/studio-authoring";
import {
  applyDocumentTemplate,
  resumeTemplateOption,
} from "@/lib/studio/editor-v2/document-templates";
import { articleToDocumentState } from "@/lib/studio/document/document-from-article";
import {
  studioTemplatesService,
  type LicensedStudioTemplate,
  type StudioTemplate,
} from "@/lib/services/studio-templates-service";
import { parseStudioSubject, type StudioSubject } from "@shared/studio-subject";
import { MEDIA_KIND_UI } from "@shared/media-kinds";
import StudioLoadingShell from "./StudioLoadingShell";
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
//
// `contentTemplate` is forwarded so the editor can resolve `mediaKind`
// synchronously at mount via the catalog lookup — eliminates the
// "flash of video defaults" before the post-load effect kicks in for
// audio-only kinds (podcast / voice). Server is still SoT for
// `studio_projects.media_kind`; this is a UI hint.
const EDITOR_FORWARDED_PARAMS = ["capture", "contentTemplate"] as const;

// The chooser carries TWO orthogonal filter axes per #906 / PRD §6.1:
// Type (MediaKind) AND Use-for (TemplateCategory | created | purchased).
// Both rows + the underlying predicate live in
// `TemplateCatalogFilters` — DRY-shared with the New-project Wizard so
// both surfaces always render the same pills against the same catalog.
//
// "My projects" visibility filter — projects only carry `isPublic: boolean`
// today, so a third "unlisted" option would require backend work (see
// `studio_projects.isPublic` schema in studio-service.ts). Keep this
// binary + "all" for now; expand here when the project visibility model
// grows a third state.
type VisibilityFilter = "all" | "public" | "private";

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
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { selection } = useWorkspace();
  const workspaceQuery = selectionToQuery(selection);
  const [projects, setProjects] = useState<StudioProject[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  // Two orthogonal filter axes — see TemplateCatalogFilters for the
  // canonical types + pill rendering.
  const [useForFilter, setUseForFilter] = useState<TemplateUseForFilter>("all");
  const [kindFilter, setKindFilter] = useState<TemplateKindFilter>("all");
  // "My projects" grid visibility filter — independent from the
  // templates-section filters above (a published template isn't the
  // same as a public project).
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  // Per-section layout mode (Scroll | Grid | Table), persisted to
  // localStorage via `useViewMode` so the choice survives reloads.
  const [templatesView, setTemplatesView] = useViewMode(
    "studio.templates",
    "scroll",
    BROWSE_VIEW_MODES,
  );
  const [contentView, setContentView] = useViewMode(
    "studio.content",
    "grid",
    BROWSE_VIEW_MODES,
  );
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
  // Optimistic prepend so the user sees their new project in "My projects"
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

    // Reopen the EXISTING studio document project linked to this entity, if
    // one was already created — so "Edit" lands straight in the editor instead
    // of minting a duplicate project on every click (#1882). Returns null when
    // none exists yet (first-ever edit). Shared seam:
    // `studioService.findDocumentProject` (the resume "Edit" buttons resolve
    // the same project to skip the `?editResume=` redirect entirely).
    const findExistingDocProject = (subject: StudioSubject) =>
      studioService.findDocumentProject(subject);

    // Open an EXISTING document entity (resume / job / article) on the canvas
    // (#1914/#1915). Registry-driven — ONE flow for every kind (DRY, see
    // [studio-authoring.ts](../../lib/studio/studio-authoring.ts)): reuse the
    // linked project if present (#1882), else build the entity's DocumentState,
    // bind the subject, and mint a `kind:"document"` project. Per-kind logic is
    // only the `load(id)` that fetches the row + seeds its doc state; adding a
    // new document entity = one entry here + one DOCUMENT_AUTHORING entry.
    const docEditHandlers: Array<{
      kind: DocumentAuthoringKind;
      load: (id: string) => Promise<{ name: string; documentState: DocumentState }>;
    }> = [
      {
        kind: "resume",
        load: async (id) => {
          const resume = await resumeService.getResumeById(id);
          const content = (resume.content ?? {}) as Record<string, unknown>;
          const populated = Object.keys(content).filter(
            (k) => Array.isArray(content[k]) && (content[k] as unknown[]).length > 0,
          );
          let documentState = createResumeDocumentState(id, populated, () =>
            crypto.randomUUID(),
          );
          // Seed the resume's CHOSEN design template (`content.meta.template`)
          // so the canvas + preview match the read-only /resumes/:id view's
          // theme/font/sections (else the first edit opens on the blank default).
          const templateId = (content.meta as Record<string, unknown> | undefined)
            ?.template as string | undefined;
          const option = resumeTemplateOption(templateId);
          if (option) {
            documentState = applyDocumentTemplate(documentState, option, () =>
              crypto.randomUUID(),
            );
          }
          return { name: resume.title || t("labels.studioLanding.resumeFallbackName"), documentState };
        },
      },
      {
        kind: "job",
        load: async (id) => {
          const job = await jobService.getJobById(id);
          return {
            name: job.title || t("labels.studioLanding.jobFallbackName"),
            documentState: createJobDocumentState(id, () => crypto.randomUUID()),
          };
        },
      },
      {
        kind: "article",
        load: async (id) => {
          const article = await articleService.getMine(id);
          return {
            name: article.title || t("labels.studioLanding.articleFallbackName"),
            documentState: articleToDocumentState(
              { id: article.id, title: article.title, bodyMd: article.bodyMd },
              () => crypto.randomUUID(),
            ),
          };
        },
      },
    ];
    for (const handler of docEditHandlers) {
      const editId = searchParams.get(DOCUMENT_AUTHORING[handler.kind].editParam);
      if (!editId) continue;
      void (async () => {
        try {
          const subject: StudioSubject = {
            kind: DOCUMENT_AUTHORING[handler.kind].subjectKind,
            id: editId,
          };
          const existing = await findExistingDocProject(subject);
          if (existing) {
            navigateToProject(existing);
            return;
          }
          const { name, documentState } = await handler.load(editId);
          const created = await create({
            kind: "document",
            documentState,
            name,
            subjects: [subject],
          });
          navigateToProject(created);
        } catch (err) {
          toast({
            title: t("messages.studioLanding.openContentFailed"),
            description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"),
            variant: "destructive",
          });
        }
      })();
      return;
    }

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
              title: t("messages.studioLanding.templateNoContentTitle"),
              description: t("messages.studioLanding.templateNoContentBody"),
              variant: "destructive",
            });
            return;
          }
          const created = await create({ kind: "script", script, name: tpl.name });
          navigateToProject(created);
        } catch (err) {
          toast({
            title: t("messages.studioLanding.loadTemplateFailed"),
            description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"),
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
            title: t("messages.studioLanding.loadProjectsFailed"),
            description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"),
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
    const q = query.trim().toLowerCase();
    const filtered = projects.filter((p) => {
      if (visibilityFilter === "public" && p.isPublic !== true) return false;
      if (visibilityFilter === "private" && p.isPublic === true) return false;
      // The single primary search filters this section too (#1917) — match
      // on title so typing in the header narrows "My content" live.
      if (q && !p.title.toLowerCase().includes(q)) return false;
      return true;
    });
    return filtered.sort((a, b) =>
      b.updateDateTime.localeCompare(a.updateDateTime),
    );
  }, [projects, visibilityFilter, query]);

  // Total count BEFORE visibility filter applies — drives the "no
  // matches" vs "no projects yet" branch in the empty state.
  const totalProjectCount = projects?.length ?? 0;

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

    const builtinRows: TemplateRow[] = showBuiltins
      ? filterBuiltinTemplates(
          TEMPLATE_CATALOG,
          kindFilter,
          useForFilter,
          query,
        ).map((t) => ({ kind: "builtin" as const, template: t }))
      : [];

    const ownedRows: TemplateRow[] = showOwned
      ? ownedTemplates
          .filter((o) => {
            if (useForFilter === "created") return o.provenance === "created";
            if (useForFilter === "purchased") return o.provenance !== "created";
            return true;
          })
          // Kind axis applies to owned rows too post-#913 — the
          // `studio_templates.media_kind` column lets a creator's
          // podcast template show up under the Podcast filter and not
          // the Video filter.
          .filter((o) => kindFilter === "all" || o.template.mediaKind === kindFilter)
          .map((o) => ({ kind: "owned" as const, owned: o }))
      : [];

    return [...ownedRows, ...builtinRows];
  }, [useForFilter, kindFilter, query, ownedTemplates]);

  function openTemplate(templateId: string) {
    // skipNavigate is set on the shared `create` so the deep-link
    // forwarder can append UI-state seed params (?capture=) onto the
    // destination URL. Carousel clicks don't need that, so route the
    // user straight to /studio/<id> here.
    //
    // Forward `?contentTemplate=<id>` on the destination URL so the
    // editor knows the project's mediaKind synchronously at mount —
    // without this, audio-only kinds (podcast / voice) briefly flash
    // the video defaults (Widgets tab + collapsed timeline) before
    // the post-load effect re-applies the kind-aware defaults. Pure
    // UI hint, server is the SoT for `studio_projects.media_kind`.
    void create({ kind: "template", templateId: templateId as ContentTemplate })
      .then((created) => {
        if (created) {
          navigate(
            `/studio/${encodeURIComponent(created.id)}?contentTemplate=${encodeURIComponent(templateId)}`,
          );
        }
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
        title: t("messages.studioLanding.templateNoContentTitle"),
        description: t("messages.studioLanding.templateNoContentBody"),
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
        title: t("messages.studioLanding.openTemplateFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"),
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

  // A redirect deep-link is in flight (the mount effect above mints/finds a
  // project then `navigate(..., {replace:true})`). Show the loading shell, not
  // the chooser, so "Edit resume" goes straight to the editor without flashing
  // the project picker (#1882).
  const redirecting =
    searchParams.has("projectId") ||
    STUDIO_EDIT_PARAMS.some((p) => searchParams.has(p)) ||
    searchParams.has("subject") ||
    searchParams.has("capture") ||
    searchParams.has("new");
  if (redirecting) return <StudioLoadingShell />;

  return (
    <AppShell>
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Site-wide search relocated inline (was docked in the top bar;
            users routinely missed it there). Page title + description are
            dropped — the chooser body labels itself with the "Templates"
            and "My projects" section headings below. */}
        {/* Single primary search — the global header search doubles as the
            live filter for both sections below via `onQueryChange` (#1917),
            so there's no separate per-section search box. Enter still runs
            the global "search everything" navigation. */}
        <div className="min-w-0 flex-1">
          <HeaderSearch onQueryChange={setQuery} />
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
            <h2 className="text-lg font-medium">{t("headings.studioLanding.templates")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("messages.studioLanding.templatesDescription")}
            </p>
          </div>
          <ViewModeToggle
            value={templatesView}
            onChange={setTemplatesView}
            modes={BROWSE_VIEW_MODES}
          />
        </div>

        {/* Type + Use-for filter rows — shared with the New-project
            Wizard via `<TemplateCatalogFilters>`. `includeOwnedPills`
            adds the "Created" / "Purchased" pills the wizard hides
            (the wizard only authors fresh built-in templates). */}
        <TemplateCatalogFilters
          kindFilter={kindFilter}
          onKindFilterChange={setKindFilter}
          useForFilter={useForFilter}
          onUseForFilterChange={setUseForFilter}
          includeOwnedPills
        />

        <UnifiedTemplateCarousel
          rows={filteredRows}
          loading={userTemplatesLoading}
          useForFilter={useForFilter}
          kindFilter={kindFilter}
          viewMode={templatesView}
          onPickBuiltin={openTemplate}
          onPreviewBuiltin={previewTemplate}
          onPickOwned={openStudioTemplate}
          onPreviewOwned={previewStudioTemplate}
        />
      </section>

      <section>
        {/* My projects header — title + workspace switcher inline. The
            switcher self-gates (returns null when the user has no
            companies / delegations to act through), so single-workspace
            users see a plain title. Selection persists across reloads
            and is shared with the editor's sidebar control. Title is
            "My projects" (was "My videos" pre-#894) because the studio
            now hosts every media kind, not just video. */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{t("headings.studioLanding.myContent")}</h2>
          <div className="flex items-center gap-3">
            <ViewModeToggle
              value={contentView}
              onChange={setContentView}
              modes={BROWSE_VIEW_MODES}
            />
            <WorkspaceSwitcher />
          </div>
        </div>
        {/* Visibility axis — gates the grid below by `isPublic`. Reuses
            the templates-section FilterPillRow so the visual matches
            the Type / Use-for rows above. */}
        <FilterPillRow label={t("fields.visibility.label")}>
          <CategoryPill
            label={t("labels.allShort")}
            active={visibilityFilter === "all"}
            onClick={() => setVisibilityFilter("all")}
          />
          <CategoryPill
            label={t("labels.public")}
            active={visibilityFilter === "public"}
            onClick={() => setVisibilityFilter("public")}
          />
          <CategoryPill
            label={t("labels.private")}
            active={visibilityFilter === "private"}
            onClick={() => setVisibilityFilter("private")}
          />
        </FilterPillRow>
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
              {totalProjectCount === 0 ? (
                <>
                  <p className="text-sm font-medium">{t("messages.studioLanding.noProjectsYet")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("messages.studioLanding.noProjectsYetHint")}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    {visibilityFilter === "public"
                      ? t("messages.studioLanding.noPublicProjects")
                      : t("messages.studioLanding.noPrivateProjects")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("messages.studioLanding.noFilteredProjectsHint")}
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <StudioContentView
            projects={sortedProjects}
            viewMode={contentView}
            onOpen={openProject}
            onShowDetails={setDetailsProject}
            onRenamed={patchProject}
            onRequestDelete={setDeletingProject}
          />
        )}
      </section>
      <ProjectDetailsSheet
        noTrigger
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
  const { t } = useTranslation();
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
        title: t("messages.studioLanding.renameFailed"),
        description: err instanceof Error ? err.message : t("errors.unknownErrorAdmin"),
        variant: "destructive",
        action: (
          <ToastAction
            altText={t("labels.studioLanding.retryRenameAlt")}
            onClick={() => {
              setEditingTitle(true);
              queueMicrotask(() => titleInputRef.current?.focus());
            }}
          >
            {t("actions.retry")}
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
  const { Icon: VisibilityIcon } = projectVisibilityVisual(project.isPublic);
  const visibilityLabel = project.isPublic
    ? t("labels.public")
    : t("labels.private");

  return (
    <div className="group overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-brand-purple hover:shadow-md">
      <div className="relative aspect-video overflow-hidden">
        <button
          type="button"
          onClick={onOpen}
          className="block h-full w-full"
          aria-label={t("labels.studioLanding.openProjectAria", { title: project.title })}
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
          title={t("labels.studioLanding.visibilityBadgeTitle", { label: visibilityLabel })}
          aria-label={t("labels.studioLanding.visibilityBadgeAria", { label: visibilityLabel })}
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
        {/* Kind badge — bottom-left, mirrors the template-card position so
            the chooser + "My content" grid read symmetric. `alwaysShow` so
            EVERY item is typed (including video) per the "each content needs
            a type pill" requirement (#1917). */}
        <MediaKindBadge
          mediaKind={project.mediaKind ?? "video"}
          alwaysShow
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
            {t("actions.edit")}
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
            {t("actions.details")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete();
            }}
            aria-label={t("labels.studioLanding.deleteProjectAria", { title: project.title })}
            title={t("actions.delete")}
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
            aria-label={t("labels.studioLanding.renameProjectAria", { title: project.title })}
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
            ? t("messages.studioLanding.saving")
            : t("labels.studioLanding.updatedOn", {
                date: new Date(project.updateDateTime).toLocaleDateString(),
              })}
        </p>
      </div>
    </div>
  );
}

/**
 * My-content view switcher — Scroll / Grid / Table over the user's studio
 * projects. Scroll + Grid reuse `StudioVideoCard`; Table is a dense rows
 * view. The active mode is chosen by the section's `<ViewModeToggle>` and
 * persisted via `useViewMode`.
 */
function StudioContentView({
  projects,
  viewMode,
  onOpen,
  onShowDetails,
  onRenamed,
  onRequestDelete,
}: {
  projects: StudioProject[];
  viewMode: ViewMode;
  onOpen: (id: string) => void;
  onShowDetails: (project: StudioProject) => void;
  onRenamed: (next: StudioProject) => void;
  onRequestDelete: (project: StudioProject) => void;
}) {
  if (viewMode === "table") {
    return (
      <StudioContentTable
        projects={projects}
        onOpen={onOpen}
        onShowDetails={onShowDetails}
        onRequestDelete={onRequestDelete}
      />
    );
  }
  const renderCard = (project: StudioProject) => (
    <StudioVideoCard
      key={project.id}
      project={project}
      onOpen={() => onOpen(project.id)}
      onShowDetails={() => onShowDetails(project)}
      onRenamed={onRenamed}
      onRequestDelete={() => onRequestDelete(project)}
    />
  );
  // Scroll is a horizontal carousel — it stays unpaginated by design (the
  // whole point is to swipe through the row). Grid + Table are the
  // "browse everything" modes, so both page the full list (#1917 follow-up).
  if (viewMode === "scroll") {
    return (
      <HorizontalScroller itemCount={projects.length}>
        {projects.map((project) => (
          <Fragment key={project.id}>{renderCard(project)}</Fragment>
        ))}
      </HorizontalScroller>
    );
  }
  return <StudioContentGrid projects={projects} renderCard={renderCard} />;
}

/** Paginated grid of "My content" cards. Pages the fully-loaded project
 *  array through the shared `usePaginatedList` anchor so a user with a
 *  large library doesn't render hundreds of thumbnails at once. */
function StudioContentGrid({
  projects,
  renderCard,
}: {
  projects: StudioProject[];
  renderCard: (project: StudioProject) => ReactNode;
}) {
  const { pageItems, paginationProps } = usePaginatedList(projects, 12);
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {pageItems.map(renderCard)}
      </div>
      <Pagination {...paginationProps} />
    </div>
  );
}

/** Dense table view of "My content" — one row per project with type chip,
 *  visibility, last-updated, and Edit / Details / Delete actions. */
function StudioContentTable({
  projects,
  onOpen,
  onShowDetails,
  onRequestDelete,
}: {
  projects: StudioProject[];
  onOpen: (id: string) => void;
  onShowDetails: (project: StudioProject) => void;
  onRequestDelete: (project: StudioProject) => void;
}) {
  const { t } = useTranslation();
  const { pageItems, paginationProps } = usePaginatedList(projects, 12);
  return (
    <div>
    <div className={TABLE_SURFACE}>
      <table className="w-full text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-3 py-2 font-medium">{t("labels.name")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.type")}</th>
            <th className="px-3 py-2 font-medium">{t("fields.visibility.label")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.updated")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((project) => {
            const { Icon: VisibilityIcon } = projectVisibilityVisual(project.isPublic);
            const visibilityLabel = project.isPublic
              ? t("labels.public")
              : t("labels.private");
            return (
              <tr
                key={project.id}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onOpen(project.id)}
                    className="font-medium hover:text-brand-purple"
                  >
                    {project.title}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <MediaKindBadge
                    mediaKind={project.mediaKind ?? "video"}
                    alwaysShow
                  />
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <VisibilityIcon className="h-3.5 w-3.5" />
                    {visibilityLabel}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(project.updateDateTime).toLocaleDateString()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpen(project.id)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      {t("actions.edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onShowDetails(project)}
                    >
                      <Globe className="mr-1 h-3.5 w-3.5" />
                      {t("actions.details")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRequestDelete(project)}
                      aria-label={t("labels.studioLanding.deleteProjectAria", { title: project.title })}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <Pagination {...paginationProps} />
    </div>
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
  viewMode,
  onPickBuiltin,
  onPreviewBuiltin,
  onPickOwned,
  onPreviewOwned,
}: {
  rows: TemplateRow[];
  loading: boolean;
  useForFilter: TemplateUseForFilter;
  kindFilter: TemplateKindFilter;
  viewMode: ViewMode;
  onPickBuiltin: (id: string) => void;
  onPreviewBuiltin: (id: ContentTemplate) => void;
  onPickOwned: (template: StudioTemplate) => void;
  onPreviewOwned: (template: StudioTemplate) => void;
}) {
  const { t } = useTranslation();
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
        ? t("messages.studioLanding.emptyCreatedKind", { kind: kindLabel })
        : t("messages.studioLanding.emptyCreated")
      : useForFilter === "purchased"
        ? kindLabel
          ? t("messages.studioLanding.emptyPurchasedKind", { kind: kindLabel })
          : t("messages.studioLanding.emptyPurchased")
        : kindLabel
          ? t("messages.studioLanding.emptySearchKind", { kind: kindLabel })
          : t("messages.studioLanding.emptySearch");
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
        {message}
      </div>
    );
  }
  const rowKey = (row: TemplateRow) =>
    row.kind === "builtin"
      ? `builtin:${row.template.id}`
      : `owned:${row.owned.provenance}:${row.owned.template.id}`;
  const renderCard = (row: TemplateRow) =>
    row.kind === "builtin" ? (
      <BuiltinTemplateCard
        template={row.template}
        onPick={onPickBuiltin}
        onPreview={onPreviewBuiltin}
      />
    ) : (
      <OwnedTemplateCard
        owned={row.owned}
        onPick={onPickOwned}
        onPreview={onPreviewOwned}
      />
    );

  if (viewMode === "table") {
    return (
      <TemplateTable
        rows={rows}
        onPickBuiltin={onPickBuiltin}
        onPreviewBuiltin={onPreviewBuiltin}
        onPickOwned={onPickOwned}
        onPreviewOwned={onPreviewOwned}
      />
    );
  }
  if (viewMode === "grid") {
    return <TemplateGrid rows={rows} rowKey={rowKey} renderCard={renderCard} />;
  }
  return (
    <HorizontalScroller
      itemCount={rows.length}
      cellClassName="w-[72vw] max-w-[15rem] shrink-0 snap-start sm:w-60 sm:max-w-none"
    >
      {rows.map((row) => (
        <Fragment key={rowKey(row)}>{renderCard(row)}</Fragment>
      ))}
    </HorizontalScroller>
  );
}

/** Paginated grid of template rows. Mirrors `StudioContentGrid` — the
 *  scroll view stays a free carousel, but the grid pages the full row set
 *  through the shared `usePaginatedList` anchor so a large owned-template
 *  library plus the starter catalog don't render in one wall. */
function TemplateGrid({
  rows,
  rowKey,
  renderCard,
}: {
  rows: TemplateRow[];
  rowKey: (row: TemplateRow) => string;
  renderCard: (row: TemplateRow) => ReactNode;
}) {
  const { pageItems, paginationProps } = usePaginatedList(rows, 12);
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {pageItems.map((row) => (
          <div key={rowKey(row)}>{renderCard(row)}</div>
        ))}
      </div>
      <Pagination {...paginationProps} />
    </div>
  );
}

/**
 * Dense table view of the Templates section. Same rows + handlers as the
 * scroller/grid; one row per template with kind chip + Use/Preview actions.
 */
function TemplateTable({
  rows,
  onPickBuiltin,
  onPreviewBuiltin,
  onPickOwned,
  onPreviewOwned,
}: {
  rows: TemplateRow[];
  onPickBuiltin: (id: string) => void;
  onPreviewBuiltin: (id: ContentTemplate) => void;
  onPickOwned: (template: StudioTemplate) => void;
  onPreviewOwned: (template: StudioTemplate) => void;
}) {
  const { t } = useTranslation();
  const { pageItems, paginationProps } = usePaginatedList(rows, 12);
  return (
    <div>
    <div className={TABLE_SURFACE}>
      <table className="w-full text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-3 py-2 font-medium">{t("labels.name")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.type")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.studioLanding.source")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((row) => {
            // Inline-narrow the discriminated union into one normalized
            // cell shape so the row markup is written once.
            const cells =
              row.kind === "builtin"
                ? {
                    key: `builtin:${row.template.id}`,
                    name: row.template.label,
                    mediaKind: row.template.mediaKind,
                    source: t("labels.studioLanding.sourceStarter"),
                    canPreview: true,
                    onUse: () => onPickBuiltin(row.template.id),
                    onPreview: () => onPreviewBuiltin(row.template.id),
                  }
                : {
                    key: `owned:${row.owned.provenance}:${row.owned.template.id}`,
                    name: row.owned.template.name,
                    mediaKind: row.owned.template.mediaKind,
                    source: provenanceBadge(t)[row.owned.provenance].label,
                    canPreview: row.owned.template.visibility !== "private",
                    onUse: () => onPickOwned(row.owned.template),
                    onPreview: () => onPreviewOwned(row.owned.template),
                  };
            return (
              <tr
                key={cells.key}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={cells.onUse}
                    className="font-medium hover:text-brand-purple"
                  >
                    {cells.name}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <MediaKindBadge mediaKind={cells.mediaKind} alwaysShow />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{cells.source}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={cells.onUse}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      {t("actions.use")}
                    </Button>
                    {cells.canPreview && (
                      <Button variant="ghost" size="sm" onClick={cells.onPreview}>
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {t("actions.preview")}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <Pagination {...paginationProps} />
    </div>
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
  const { t } = useTranslation();
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
        aria-label={t("labels.studioLanding.useTemplateAria", { name: template.label })}
      >
        <div className="relative">
          <TemplateThumb template={template} />
          {/* Hover label confirms the click action. The Preview pill is
              rendered as a sibling button outside this one so click
              events route to the right handler. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-md">
              <Pencil className="h-3.5 w-3.5" />
              {t("actions.use")}
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
        aria-label={t("labels.studioLanding.previewTemplateAria", { name: template.label })}
        className="absolute right-2 top-2 z-10 hidden items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-md backdrop-blur transition hover:bg-white group-hover:flex group-focus-within:flex"
      >
        <Eye className="h-3.5 w-3.5" />
        {t("actions.preview")}
      </button>
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
  const { t } = useTranslation();
  const { template, provenance } = owned;
  const badge = provenanceBadge(t)[provenance];
  const canPreview = template.visibility !== "private";
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-brand-purple hover:shadow-md">
      <button
        type="button"
        onClick={() => onPick(template)}
        className="flex flex-1 flex-col text-left"
        aria-label={t("labels.studioLanding.useTemplateAria", { name: template.name })}
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
              {t("actions.use")}
            </span>
          </div>
          {/* Kind badge — bottom-left, symmetric with BuiltinTemplateCard.
              Reads `template.mediaKind` post-#913; pre-#913 rows
              default to 'video' via the zod schema default so this is
              safe for legacy templates too. Self-hides for video. */}
          <MediaKindBadge
            mediaKind={template.mediaKind}
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
          aria-label={t("labels.studioLanding.previewTemplateAria", { name: template.name })}
          className="absolute right-2 top-2 z-10 hidden items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-md backdrop-blur transition hover:bg-white group-hover:flex group-focus-within:flex"
        >
          <Eye className="h-3.5 w-3.5" />
          {t("actions.preview")}
        </button>
      )}
    </div>
  );
}

function provenanceBadge(t: TFunction): Record<
  OwnedTemplate["provenance"],
  {
    label: string;
    Icon: typeof UserIcon;
    iconClassName: string;
    pillClassName: string;
    fallbackBlurb: string;
  }
> {
  return {
    created: {
      label: t("labels.studioLanding.provenanceYours"),
      Icon: UserIcon,
      iconClassName: "bg-brand-purple/10 text-brand-purple",
      pillClassName: "bg-brand-purple/90 text-white",
      fallbackBlurb: t("messages.studioLanding.provenanceYoursBlurb"),
    },
    purchased: {
      label: t("labels.studioLanding.provenancePurchased"),
      Icon: ShoppingBag,
      iconClassName: "bg-emerald-500/10 text-emerald-600",
      pillClassName: "bg-emerald-500/90 text-white",
      fallbackBlurb: t("messages.studioLanding.provenancePurchasedBlurb"),
    },
    claimed: {
      label: t("labels.studioLanding.provenanceClaimed"),
      Icon: Sparkles,
      iconClassName: "bg-sky-500/10 text-sky-600",
      pillClassName: "bg-sky-500/90 text-white",
      fallbackBlurb: t("messages.studioLanding.provenanceClaimedBlurb"),
    },
  };
}

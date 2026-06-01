// StudioWizard.tsx — kind-aware "create your first project" modal.
//
// Step 1 (always): Pick a content template (drives the import mode +
//   downstream intake form). Filtered by the same Type (MediaKind) +
//   Use-for (TemplateCategory) pills the /studio landing chooser uses
//   — DRY-shared via `<TemplateCatalogFilters>`. The wizard sets
//   `includeOwnedPills={false}` because it only authors fresh built-in
//   templates (owned templates are opened directly from the carousel).
//
// Step 2 (conditional): Pick a visual theme + background preset. This
//   step is video-shape chrome — `VISUAL_THEMES` + `BG_PRESETS` carry
//   video-frame defaults. It mounts only for kinds where those
//   defaults make sense (`video`, `podcast`). Voice / comic / game /
//   image / animation / cad skip it — comic uses per-genre palettes,
//   the non-CanvasState kinds bring their own runtime state shape, and
//   voice has no visible frame.
//
// Step 3 (always): Mount the catalog-defined intake for the active
//   template. Each template's `IntakeForm` ships its own kind-correct
//   copy (BasicIntake says "video" because basic is mediaKind=video;
//   PodcastIntake / VoiceIntake / ComicIntake / GameIntake / ImageIntake
//   each carry their own).
//
// The template catalog (components/studio/templates/catalog) is the single
// source of truth: the same templates drive the sidebar, the wizard's first
// step, and the editor's first tab.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resumeToText, jobToText } from "@/components/PromptEditor";
import ResumeEmptyDropzone from "@/components/ResumeEmptyDropzone";
import TemplateList from "@/components/studio/templates/TemplateList";
import TemplateCatalogFilters, {
  filterBuiltinTemplates,
  type TemplateKindFilter,
  type TemplateUseForFilter,
} from "@/components/studio/templates/TemplateCatalogFilters";
import {
  TEMPLATE_CATALOG,
  getTemplate,
  type ContentTemplate,
  type TemplateDef,
} from "@/components/studio/templates/catalog";
import { MEDIA_KIND_UI, type MediaKind } from "@shared/media-kinds";
import {
  TEMPLATES,
  BG_PRESETS,
  loadTemplate,
} from "./StudioSidebar";
import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";
import { resumeService } from "@/lib/services/resume-service";
import { userService, type UserProfile } from "@/lib/services/user-service";
import { jobService, type JobSummary } from "@/lib/services/job-service";
import { companyService, type CompanyMetadata } from "@/lib/services/company-service";

// ─── Text serializers ────────────────────────────────────────────────────────

/** Build resume-style text from the user's profile fields. */
function profileToText(p: UserProfile): string {
  const lines: string[] = [];
  const fullName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  const headline = p.data?.headline ?? "";
  if (fullName || headline) {
    lines.push(fullName + (headline ? ` — ${headline}` : ""));
  }
  const currentRole = p.currentRole ?? p.data?.currentRole;
  const currentCompany = p.currentCompany ?? p.data?.currentCompany;
  if (currentRole || currentCompany) {
    lines.push(
      `${currentRole ?? ""}${currentRole && currentCompany ? " at " : ""}${currentCompany ?? ""}`,
    );
  }
  if (p.location ?? p.data?.location) {
    lines.push(`Location: ${p.location ?? p.data?.location}`);
  }
  const summary = p.data?.summary ?? p.bio;
  if (summary) lines.push(`\nSummary:\n${summary}`);
  if (p.data?.yearsOfExperience != null) {
    lines.push(`\nYears of experience: ${p.data.yearsOfExperience}`);
  }
  const skills = p.data?.skills ?? p.skills;
  if (skills?.length) lines.push(`\nSkills:\n${skills.join(", ")}`);
  if (p.data?.industries?.length) {
    lines.push(`\nIndustries: ${p.data.industries.join(", ")}`);
  }
  if (p.data?.preferredRoles?.length) {
    lines.push(`Preferred roles: ${p.data.preferredRoles.join(", ")}`);
  }
  const links: string[] = [];
  if (p.linkedIn ?? p.data?.linkedIn) links.push(`LinkedIn: ${p.linkedIn ?? p.data?.linkedIn}`);
  if (p.github ?? p.data?.gitHub) links.push(`GitHub: ${p.github ?? p.data?.gitHub}`);
  if (p.website ?? p.data?.website) links.push(`Website: ${p.website ?? p.data?.website}`);
  if (links.length) lines.push(`\n${links.join("\n")}`);
  return lines.join("\n");
}

/** Build company context text from a CompanyMetadata record. */
function companyToText(c: CompanyMetadata): string {
  const lines: string[] = [];
  if (c.name) lines.push(c.name);
  if (c.tagline) lines.push(c.tagline);
  if (c.description) lines.push(`\n${c.description}`);
  const facts: string[] = [];
  if (c.industry) facts.push(`Industry: ${c.industry}`);
  if (c.size) facts.push(`Size: ${c.size}`);
  if (c.location) facts.push(`Location: ${c.location}`);
  if (c.founded) facts.push(`Founded: ${c.founded}`);
  if (c.website) facts.push(`Website: ${c.website}`);
  if (facts.length) lines.push(`\n${facts.join("\n")}`);
  return lines.join("\n");
}


// ─── Step identities ─────────────────────────────────────────────────────────
//
// Wizard steps are referenced by stable id rather than positional index
// because the effective step list shrinks/grows per the selected
// template's `mediaKind` (see `kindNeedsThemeStep`). Index-based logic
// would break the moment the theme step disappears.

type StepId = "template" | "theme" | "details";

const ALL_STEP_IDS = ["template", "theme", "details"] as const satisfies readonly StepId[];

const STEP_TITLE: Record<StepId, string> = {
  template: "Choose Template",
  theme: "Theme & Style",
  details: "Your Details",
};

/** Whether the wizard's video-frame theme + background step applies to
 *  this kind. Only `video` and `podcast` carry video-frame defaults via
 *  the shared `VISUAL_THEMES` / `BG_PRESETS` registries; every other
 *  kind owns its visual defaults inside its own runtime (game / image /
 *  animation / cad) or per-template palette (comic genres), or has no
 *  visible frame (voice).
 *
 *  #1201 — a parallel per-kind "Look & Feel" step is planned (genre
 *  palette swatch for comic, base style + size for image / animation,
 *  sprite pack for game, default voice for voice). For now the wizard
 *  jumps straight to the intake form for those kinds because the
 *  intake already captures the kind-specific tunables. Tracked in the
 *  Consolidated Gap Register so the asymmetry is visible. */
function kindNeedsThemeStep(kind: MediaKind): boolean {
  return kind === "video" || kind === "podcast";
}

/** Whether the wizard's "Done" actually fires an LLM generator. Only
 *  CanvasState-authoring kinds do — `WizardLauncher.handleGenerate`
 *  hits `generateStoryboard` for video/podcast and `generateComic` for
 *  comic. Voice / animation / game / image / cad take the
 *  `kind: "template"` seed path with no AI round-trip, so the CTA
 *  reads "Create …" rather than "Generate …". */
function kindNeedsAiGeneration(kind: MediaKind): boolean {
  return kind === "video" || kind === "podcast" || kind === "comic";
}

interface Props {
  open: boolean;
  state: StudioProjectState;
  onStateChange: (patch: Partial<StudioProjectState>) => void;
  contentTemplate: ContentTemplate;
  onContentTemplateSelect: (t: ContentTemplate) => void;
  onTemplateLoad: (script: VideoScript) => void;
  onBackgroundSelect: (bgValue: string, customImageUrl?: string) => void;
  onGenerate: () => Promise<void> | void;
  onClose: () => void;
  /** Deep-link entry — when provided, the wizard pre-runs its template
   *  selection (triggering the same auto-import that a click would) and
   *  auto-advances past the template step once the import succeeds. Set
   *  by callers that read `?contentTemplate=<slug>` from the URL. */
  initialTemplateId?: ContentTemplate;
}

export default function StudioWizard({
  open,
  state,
  onStateChange,
  contentTemplate,
  onContentTemplateSelect,
  onTemplateLoad,
  onBackgroundSelect,
  onGenerate,
  onClose,
  initialTemplateId,
}: Props) {
  const [step, setStep] = useState(0);
  const [activeTemplateFile, setActiveTemplateFile] = useState<string | null>(null);
  const [activeBg, setActiveBg] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  /** Catalog id the user selected on the template step. null until a card is clicked. */
  const [selectedTemplateId, setSelectedTemplateId] = useState<ContentTemplate | null>(null);

  // Type + Use-for filters on the template chooser — DRY-shared with
  // /studio landing via `<TemplateCatalogFilters>`. The wizard hides
  // the Created / Purchased pills because it only authors fresh built-in
  // templates (owned templates open from the carousel on /studio).
  const [kindFilter, setKindFilter] = useState<TemplateKindFilter>("all");
  const [useForFilter, setUseForFilter] = useState<TemplateUseForFilter>("all");
  // Inline search field — parity with /studio landing chooser; the
  // helper already accepts a query arg, so this just threads through.
  const [templateQuery, setTemplateQuery] = useState("");

  // Artifact import state
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [importedLabel, setImportedLabel] = useState<string | null>(null);
  // Distinguishes the "no master resume → user can fix this by uploading"
  // case from generic errors so we can swap the red banner for an inline
  // upload affordance instead of dead-ending the user.
  const [needsResumeUpload, setNeedsResumeUpload] = useState(false);

  // Picker state (jobs / companies)
  const [jobsList, setJobsList] = useState<JobSummary[] | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [companiesList, setCompaniesList] = useState<CompanyMetadata[] | null>(null);
  const [companiesLoading, setCompaniesLoading] = useState(false);

  const selectedTemplate: TemplateDef | null = selectedTemplateId
    ? getTemplate(selectedTemplateId)
    : null;

  // Filtered chooser list — applies the same Type + Use-for predicate
  // /studio uses. The selected template is force-kept in the list so
  // changing a filter after selection doesn't visually drop the user's
  // pick mid-flow (they can still see what they have).
  const filteredTemplates = useMemo(() => {
    const filtered = filterBuiltinTemplates(
      TEMPLATE_CATALOG,
      kindFilter,
      useForFilter,
      templateQuery,
    );
    if (
      selectedTemplate &&
      !filtered.some((t) => t.id === selectedTemplate.id)
    ) {
      return [selectedTemplate, ...filtered];
    }
    return filtered;
  }, [kindFilter, useForFilter, templateQuery, selectedTemplate]);

  // Per-kind step list. `theme` is video-frame chrome (VISUAL_THEMES +
  // BG_PRESETS) so it only mounts for kinds where those defaults apply
  // — video + podcast (the latter because the video-podcast branch
  // rides the same theme + bg). Voice, comic, game, image, animation,
  // and cad skip it: their authoring surfaces own their own visual
  // defaults (comic genre palettes, game / image / animation runtimes).
  const stepIds = useMemo<readonly StepId[]>(() => {
    const kind = selectedTemplate?.mediaKind;
    // Pre-selection — show the full set so the indicator dots don't
    // jump under the user as they make their first pick.
    if (!kind) return ALL_STEP_IDS;
    return kindNeedsThemeStep(kind)
      ? (["template", "theme", "details"] as const)
      : (["template", "details"] as const);
  }, [selectedTemplate?.mediaKind]);

  // Clamp `step` when the effective step list shrinks (e.g. user
  // switches from a video template to a voice template — the theme
  // step disappears, so a step=2 cursor needs to back off to the new
  // tail). Runs as an effect so the render that flipped the step list
  // doesn't also try to mount a missing step.
  useEffect(() => {
    if (step >= stepIds.length) setStep(stepIds.length - 1);
  }, [stepIds, step]);

  const stepId = stepIds[step] ?? "template";
  const isFirst = step === 0;
  const isLast = step === stepIds.length - 1;

  // Kind-aware noun for the header + Done button. Falls back to a
  // generic "project" before any template is picked so the wizard
  // never reads as "video"-only.
  const kindNoun = selectedTemplate
    ? MEDIA_KIND_UI[selectedTemplate.mediaKind].badgeLabel.toLowerCase()
    : "project";

  function resetImportState() {
    setImportStatus("idle");
    setImportError(null);
    setImportedLabel(null);
    setNeedsResumeUpload(false);
  }

  // Extracted so it can be re-invoked after the user uploads a resume from
  // the inline dropzone — same auto-import path, no code duplication.
  async function importMasterResume() {
    setImportStatus("loading");
    setNeedsResumeUpload(false);
    try {
      const groups = await resumeService.getMasterResumeGroups();
      const master =
        groups.find((g) => g.masterResume?.isMaster)?.masterResume ??
        groups[0]?.masterResume;
      const masterId = master?.id;
      if (!masterId) {
        // No master yet — surface the inline upload dropzone instead of a
        // dead-end error so the user can resolve this without leaving Studio.
        setImportStatus("idle");
        setNeedsResumeUpload(true);
        return;
      }
      const full = await resumeService.getResumeById(masterId);
      const text = resumeToText(full);
      if (!text.trim()) {
        setImportStatus("error");
        setImportError("Your master resume is empty. Add some content first.");
        return;
      }
      onStateChange({ resumeText: text, resumeId: masterId });
      setImportedLabel(master?.title ?? "Master resume");
      setImportStatus("success");
    } catch (e) {
      setImportStatus("error");
      setImportError(e instanceof Error ? e.message : "Failed to load master resume");
    }
  }

  async function handleTemplateSelect(id: ContentTemplate) {
    setSelectedTemplateId(id);
    onContentTemplateSelect(id);
    resetImportState();

    const tmpl = getTemplate(id);

    if (tmpl.importMode === "auto-resume") {
      await importMasterResume();
      return;
    }

    if (tmpl.importMode === "auto-profile") {
      setImportStatus("loading");
      try {
        const profile = await userService.getCurrentUser();
        const text = profileToText(profile);
        if (!text.trim()) {
          setImportStatus("error");
          setImportError("Your profile is empty. Fill it out in Settings first.");
          return;
        }
        onStateChange({ resumeText: text });
        const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
        setImportedLabel(fullName || "Your profile");
        setImportStatus("success");
      } catch (e) {
        setImportStatus("error");
        setImportError(e instanceof Error ? e.message : "Failed to load profile");
      }
      return;
    }

    if (tmpl.importMode === "pick-job") {
      if (jobsList === null) {
        setJobsLoading(true);
        try {
          const [saved, owned] = await Promise.all([
            jobService.getSavedJobs().catch(() => [] as JobSummary[]),
            jobService.getUserJobs().catch(() => [] as JobSummary[]),
          ]);
          // De-dupe by id
          const merged = [...owned, ...saved].filter(
            (j, i, arr) => arr.findIndex((x) => x.id === j.id) === i,
          );
          setJobsList(merged);
        } finally {
          setJobsLoading(false);
        }
      }
      return;
    }

    if (tmpl.importMode === "pick-company") {
      if (companiesList === null) {
        setCompaniesLoading(true);
        try {
          // The pick-company flow drives the "Promote Your Company"
          // template — it must show the user's OWN companies, not
          // companies they happen to follow.
          const list = await companyService.getMyCompanies().catch(
            () => [] as CompanyMetadata[],
          );
          setCompaniesList(list);
        } finally {
          setCompaniesLoading(false);
        }
      }
    }

    // "none" — the intake form on the details step captures everything; nothing to do.
  }

  function handlePickJob(job: JobSummary) {
    onStateChange({ resumeText: jobToText(job), jobDescription: job.description ?? undefined });
    setImportedLabel(`${job.title}${job.company ? ` — ${job.company}` : ""}`);
    setImportStatus("success");
    setImportError(null);
  }

  function handlePickCompany(company: CompanyMetadata) {
    onStateChange({ resumeText: companyToText(company) });
    setImportedLabel(company.name ?? "Company");
    setImportStatus("success");
    setImportError(null);
  }

  async function handleTheme(file: string) {
    const script = await loadTemplate(file);
    if (script) {
      setActiveTemplateFile(file);
      onTemplateLoad(script);
    }
  }

  function handleBg(value: string) {
    setActiveBg(value);
    onBackgroundSelect(value);
  }

  // Per-step gating
  //   - template: must pick a template + (if it auto-imports) the import must succeed
  //   - details:  needs enough input to call generate. Templates with no
  //               import mode use a looser threshold because the intake
  //               form captures structured data, not free-text.
  const canGenerate =
    selectedTemplate?.importMode === "none"
      ? state.resumeText.trim().length > 0
      : state.resumeText.trim().length > 50;

  const templateStepReady =
    selectedTemplate != null &&
    (selectedTemplate.importMode === "none" || importStatus === "success");

  const canAdvance =
    stepId === "template"
      ? templateStepReady
      : stepId === "details"
        ? canGenerate
        : true;

  // Deep-link bootstrap: when the wizard opens with an initial template id
  // (set from `?contentTemplate=<slug>` in the URL), run the same selection
  // flow a click would trigger so the auto-import kicks in. We only do this
  // once per open — re-runs would clobber the user's manual choices.
  useEffect(() => {
    if (!open) return;
    if (!initialTemplateId) return;
    if (selectedTemplateId) return;
    void handleTemplateSelect(initialTemplateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTemplateId]);

  // Once the deep-linked template has imported successfully, skip past
  // the "pick a template" step so the visitor lands on the next
  // applicable step (Theme & Style for video/podcast, Your Details for
  // every other kind) rather than re-confirming the choice they already
  // made on the marketplace.
  useEffect(() => {
    if (!initialTemplateId) return;
    if (stepId !== "template") return;
    if (!templateStepReady) return;
    if (stepIds.length > 1) setStep(1);
  }, [initialTemplateId, stepId, templateStepReady, stepIds.length]);

  async function handleDone() {
    if (!canGenerate) return;
    setRunning(true);
    try {
      await onGenerate();
      onClose();
      setStep(0);
    } finally {
      setRunning(false);
    }
  }

  // Visibility gate sits AFTER every hook so toggling `open` doesn't change
  // the hook count between renders (React error #310). All useState /
  // useEffect calls above this line run unconditionally; the dialog itself
  // is the only thing that's hidden.
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header — title is kind-aware once a template is picked
            ("New podcast project", "New comic project", ...) and falls
            back to a generic "New project wizard" pre-selection so the
            modal never reads as video-only. */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">
              {selectedTemplate ? `New ${kindNoun} project` : "New project wizard"}
            </h2>
            <span className="text-xs text-muted-foreground">
              · Step {step + 1} of {stepIds.length}: {STEP_TITLE[stepId]}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close wizard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator dots — count + labels driven by stepIds so a
            voice / comic / game project shows 2 dots, video / podcast
            shows 3. */}
        <div className="flex items-center justify-center gap-2 px-5 py-3 border-b bg-muted/30">
          {stepIds.map((id, i) => (
            <div key={id} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold transition-colors ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "bg-primary/20 text-primary border border-primary"
                      : "bg-muted text-muted-foreground"
                }`}
                title={STEP_TITLE[id]}
              >
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              {i < stepIds.length - 1 && (
                <div className={`w-8 h-px ${i < step ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {stepId === "template" && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Choose a template
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Each template captures different inputs and shapes the
                  output differently. We'll auto-import the right artifact
                  when there is one.
                </p>
                {/* Inline template search — parity with /studio landing
                    so a user who knows the template name doesn't have to
                    scroll the filtered grid. */}
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    value={templateQuery}
                    onChange={(e) => setTemplateQuery(e.target.value)}
                    placeholder="Search templates"
                    className="h-9 pl-9"
                  />
                </div>
                {/* Type + Use-for filters — DRY-shared with the /studio
                    landing chooser. `includeOwnedPills={false}` because
                    the wizard only authors built-ins. */}
                <TemplateCatalogFilters
                  kindFilter={kindFilter}
                  onKindFilterChange={setKindFilter}
                  useForFilter={useForFilter}
                  onUseForFilterChange={setUseForFilter}
                />
                {filteredTemplates.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 py-8 text-center text-xs text-muted-foreground">
                    No templates match these filters — try a different
                    Type or Use-for.
                  </div>
                ) : (
                  <TemplateList
                    templates={filteredTemplates}
                    selected={selectedTemplateId ?? undefined}
                    onSelect={(id) => void handleTemplateSelect(id)}
                  />
                )}
              </div>

              {/* Import status — auto-import feedback */}
              {selectedTemplate && importStatus === "loading" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 rounded-md bg-muted/40 border">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading…
                </div>
              )}
              {selectedTemplate && importStatus === "success" && importedLabel && (
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-md bg-green-50 border border-green-200 text-green-800">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 truncate">
                    Imported: <span className="font-semibold">{importedLabel}</span>
                  </span>
                </div>
              )}
              {selectedTemplate && importStatus === "error" && importError && (
                <div className="text-xs px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-800">
                  {importError}
                </div>
              )}
              {/* Inline upload affordance — shown when an auto-resume template
                  is picked but the user has no master yet. Reuses the same
                  dropzone / sheet flow as /resumes so the UX matches
                  everywhere. After upload we re-run the auto-import. */}
              {selectedTemplate?.importMode === "auto-resume" && needsResumeUpload && (
                <ResumeEmptyDropzone
                  title="Upload your resume to continue"
                  description="Drop your resume here, or click to upload — we'll use it to generate your video. Your first resume becomes your master automatically."
                  onUploadSuccess={() => {
                    void importMasterResume();
                  }}
                  compact
                />
              )}

              {/* Inline Job picker */}
              {selectedTemplate?.importMode === "pick-job" && (
                <div className="border rounded-lg">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Pick a job to promote
                    </span>
                    {jobsLoading && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {!jobsLoading && (jobsList?.length ?? 0) === 0 ? (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                        No jobs yet — save a job from{" "}
                        <span className="font-medium text-primary">/jobs</span>{" "}
                        or post one to promote.
                      </div>
                    ) : (
                      <ul className="divide-y">
                        {jobsList?.map((j) => {
                          const jobId = j.id ?? "";
                          const isSelected =
                            importStatus === "success" &&
                            importedLabel ===
                              `${j.title}${j.company ? ` — ${j.company}` : ""}`;
                          return (
                            <li key={jobId}>
                              <button
                                type="button"
                                onClick={() => handlePickJob(j)}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors ${
                                  isSelected ? "bg-primary/5" : ""
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`font-semibold truncate ${
                                      isSelected ? "text-primary" : ""
                                    }`}
                                  >
                                    {j.title}
                                  </span>
                                  {isSelected && (
                                    <Check className="w-3 h-3 text-primary ml-auto shrink-0" />
                                  )}
                                </div>
                                {j.company && (
                                  <div className="text-muted-foreground mt-0.5 truncate">
                                    {j.company}
                                    {j.location ? ` · ${j.location}` : ""}
                                  </div>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Inline Company picker */}
              {selectedTemplate?.importMode === "pick-company" && (
                <div className="border rounded-lg">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Pick a company to promote
                    </span>
                    {companiesLoading && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {!companiesLoading && (companiesList?.length ?? 0) === 0 ? (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center space-y-2">
                        <p>You don't have a company yet — create one before promoting it.</p>
                        <Link
                          to="/companies/create"
                          className="inline-block font-semibold text-primary hover:underline"
                        >
                          Create your company →
                        </Link>
                      </div>
                    ) : (
                      <ul className="divide-y">
                        {companiesList?.map((c) => {
                          const cId = c.id ?? c.slug ?? c.name ?? "";
                          const isSelected =
                            importStatus === "success" &&
                            importedLabel === (c.name ?? "Company");
                          return (
                            <li key={cId}>
                              <button
                                type="button"
                                onClick={() => handlePickCompany(c)}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors ${
                                  isSelected ? "bg-primary/5" : ""
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`font-semibold truncate ${
                                      isSelected ? "text-primary" : ""
                                    }`}
                                  >
                                    {c.name}
                                  </span>
                                  {isSelected && (
                                    <Check className="w-3 h-3 text-primary ml-auto shrink-0" />
                                  )}
                                </div>
                                {(c.tagline || c.industry) && (
                                  <div className="text-muted-foreground mt-0.5 truncate">
                                    {c.tagline || c.industry}
                                  </div>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {stepId === "theme" && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Visual Theme
                </p>
                <ul className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((t) => {
                    const isActive = activeTemplateFile === t.file;
                    return (
                      <li key={t.file}>
                        <button
                          type="button"
                          onClick={() => handleTheme(t.file)}
                          className={`w-full text-left px-3 py-3 rounded-lg border transition-colors ${
                            isActive
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40 hover:bg-accent"
                          }`}
                        >
                          <div className="flex gap-1 mb-2">
                            {t.colors.map((c) => (
                              <div
                                key={c}
                                className="h-2 flex-1 rounded-sm"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                          <div className="flex items-center justify-between mb-0.5">
                            <span
                              className={`text-sm font-semibold ${isActive ? "text-primary" : ""}`}
                            >
                              {t.label}
                            </span>
                            {isActive && <Check className="w-3.5 h-3.5 text-primary" />}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-tight">
                            {t.desc}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Background / Colors
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {BG_PRESETS.map((bg) => (
                    <button
                      key={bg.value}
                      type="button"
                      title={bg.label}
                      onClick={() => handleBg(bg.value)}
                      className={`relative h-14 rounded-md border-2 transition-all overflow-hidden ${
                        activeBg === bg.value
                          ? "border-primary ring-1 ring-primary"
                          : "border-transparent hover:border-primary/40"
                      }`}
                      style={{ background: bg.preview }}
                    >
                      {activeBg === bg.value && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Check className="w-4 h-4 text-white drop-shadow" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Pick a starting look — you can fine-tune everything later from the sidebar.
                </p>
              </div>
            </div>
          )}

          {stepId === "details" && (() => {
            // Mount the catalog-defined intake for the active template — every
            // template owns its own form so this branch never grows.
            const activeTmpl = getTemplate(contentTemplate);
            const Intake = activeTmpl.IntakeForm;
            return (
              <div>
                <Intake
                  state={state}
                  onStateChange={onStateChange}
                  kind={activeTmpl.mediaKind}
                />
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={isFirst || running}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>

          {!isLast ? (
            <Button
              size="sm"
              onClick={() => setStep((s) => Math.min(stepIds.length - 1, s + 1))}
              disabled={!canAdvance}
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleDone} disabled={!canGenerate || running}>
              {running ? (
                <>{selectedTemplate ? (kindNeedsAiGeneration(selectedTemplate.mediaKind) ? "Generating…" : "Creating…") : "Working…"}</>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  Done — {selectedTemplate ? MEDIA_KIND_UI[selectedTemplate.mediaKind].createVerb : "Generate"}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

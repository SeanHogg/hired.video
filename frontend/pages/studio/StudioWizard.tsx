// StudioWizard.tsx — 3-step "create your first video" modal.
//
// Step 1: What do you want to promote? (Resume / Profile / Job / Company / Personal Brand / Skills Demo)
// Step 2: Pick a visual theme (template) + background preset/color
// Step 3: Fill in the corresponding inputs (reuses PromptEditor or SkillsDemoSetup) and Generate.

import { useState } from "react";
import {
  Briefcase,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Monitor,
  Sparkles,
  UserCircle,
  Wand2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import PromptEditor, {
  resumeToText,
  jobToText,
} from "@/components/PromptEditor";
import SkillsDemoSetup from "@/components/studio/SkillsDemoSetup";
import {
  TEMPLATES,
  BG_PRESETS,
  loadTemplate,
  type ContentTemplate,
} from "./StudioSidebar";
import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";
import { resumeService } from "@/lib/services/resume-service";
import { userService } from "@/lib/services/user-service";
import type { UserProfile } from "@/lib/services/user-service";
import { jobService } from "@/lib/services/job-service";
import type { JobSummary } from "@/lib/services/job-service";
import { companyService } from "@/lib/services/company-service";
import type { CompanyMetadata } from "@/lib/services/company-service";

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

// What-to-promote options — each maps to an existing ContentTemplate
// and specifies how the associated artifact is imported.
type ImportMode = "auto-resume" | "auto-profile" | "pick-job" | "pick-company" | "none";

type PromoteOption = {
  key: string;
  contentTemplate: ContentTemplate;
  label: string;
  desc: string;
  importMode: ImportMode;
  icon: LucideIcon;
};

const PROMOTE_OPTIONS: PromoteOption[] = [
  {
    key: "resume",
    contentTemplate: "resume",
    label: "Your Resume",
    desc: "Turn your work history into a 60-second video pitch.",
    importMode: "auto-resume",
    icon: FileText,
  },
  {
    key: "profile",
    contentTemplate: "personal_brand",
    label: "Your Profile",
    desc: "Promote your hired.video profile, bio, and highlights.",
    importMode: "auto-profile",
    icon: UserCircle,
  },
  {
    key: "job",
    contentTemplate: "job_ad",
    label: "A Job",
    desc: "Make a short ad to promote an open role.",
    importMode: "pick-job",
    icon: Briefcase,
  },
  {
    key: "company",
    contentTemplate: "job_ad",
    label: "A Company",
    desc: "Company promo video — values, culture, products.",
    importMode: "pick-company",
    icon: Building2,
  },
  {
    key: "personal_brand",
    contentTemplate: "personal_brand",
    label: "Your Personal Brand",
    desc: "Tell your career story from scratch — no resume needed.",
    importMode: "none",
    icon: Sparkles,
  },
  {
    key: "skills_demo",
    contentTemplate: "skills-demo",
    label: "Skills Demo",
    desc: "Screen-share walkthrough of something you built.",
    importMode: "none",
    icon: Monitor,
  },
];

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
}: Props) {
  const [step, setStep] = useState(0);
  const [activeTemplateFile, setActiveTemplateFile] = useState<string | null>(null);
  const [activeBg, setActiveBg] = useState<string | null>(null);
  const [showJD, setShowJD] = useState(false);
  const [running, setRunning] = useState(false);
  const [promoteKey, setPromoteKey] = useState<string | null>(null);

  // Artifact import state
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [importedLabel, setImportedLabel] = useState<string | null>(null);

  // Picker state (jobs / companies)
  const [jobsList, setJobsList] = useState<JobSummary[] | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [companiesList, setCompaniesList] = useState<CompanyMetadata[] | null>(null);
  const [companiesLoading, setCompaniesLoading] = useState(false);

  if (!open) return null;

  const stepTitles = ["What to Promote", "Theme & Style", "Your Details"];
  const isFirst = step === 0;
  const isLast = step === stepTitles.length - 1;

  function resetImportState() {
    setImportStatus("idle");
    setImportError(null);
    setImportedLabel(null);
  }

  async function handlePromoteSelect(opt: PromoteOption) {
    setPromoteKey(opt.key);
    onContentTemplateSelect(opt.contentTemplate);
    resetImportState();

    if (opt.importMode === "auto-resume") {
      setImportStatus("loading");
      try {
        const groups = await resumeService.getMasterResumeGroups();
        const master =
          groups.find((g) => g.masterResume?.isMaster)?.masterResume ??
          groups[0]?.masterResume;
        const masterId = master?.id;
        if (!masterId) {
          setImportStatus("error");
          setImportError("No master resume found. Create one in Resumes first.");
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
      return;
    }

    if (opt.importMode === "auto-profile") {
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

    if (opt.importMode === "pick-job") {
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

    if (opt.importMode === "pick-company") {
      if (companiesList === null) {
        setCompaniesLoading(true);
        try {
          const list = await companyService.getFollowedCompanies().catch(
            () => [] as CompanyMetadata[],
          );
          setCompaniesList(list);
        } finally {
          setCompaniesLoading(false);
        }
      }
      return;
    }

    // "none" — personal_brand or skills_demo. No auto-import; user fills in Step 3.
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
  // Step 0 (Promote What): must pick an option
  // Step 2 (Details): needs enough input to call generate
  const canGenerate =
    contentTemplate === "skills-demo"
      ? state.resumeText.trim().length > 0
      : state.resumeText.trim().length > 50;

  // Step 0 gate:
  //  - Selected option with importMode "none" → proceed on selection alone
  //  - Auto-import or picker modes → must reach importStatus === "success"
  const selectedOpt =
    promoteKey != null
      ? PROMOTE_OPTIONS.find((o) => o.key === promoteKey)
      : null;
  const step0Ready =
    selectedOpt != null &&
    (selectedOpt.importMode === "none" || importStatus === "success");

  const canAdvance =
    step === 0 ? step0Ready : step === 2 ? canGenerate : true;

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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">New Video Wizard</h2>
            <span className="text-xs text-muted-foreground">
              · Step {step + 1} of {stepTitles.length}: {stepTitles[step]}
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

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-2 px-5 py-3 border-b bg-muted/30">
          {stepTitles.map((t, i) => (
            <div key={t} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold transition-colors ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "bg-primary/20 text-primary border border-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              {i < stepTitles.length - 1 && (
                <div className={`w-8 h-px ${i < step ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  What do you want to promote?
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Pick what the video is about — we'll auto-import the right
                  artifact and set the template.
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PROMOTE_OPTIONS.map((opt) => {
                    const isActive = promoteKey === opt.key;
                    const Icon = opt.icon;
                    return (
                      <li key={opt.key}>
                        <button
                          type="button"
                          onClick={() => handlePromoteSelect(opt)}
                          className={`w-full text-left flex flex-col gap-1.5 px-3 py-3 rounded-lg border transition-colors ${
                            isActive
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40 hover:bg-accent"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon
                              className={`w-5 h-5 shrink-0 ${
                                isActive ? "text-primary" : "text-muted-foreground"
                              }`}
                            />
                            <span
                              className={`text-sm font-semibold ${
                                isActive ? "text-primary" : ""
                              }`}
                            >
                              {opt.label}
                            </span>
                            {isActive && (
                              <Check className="w-4 h-4 text-primary ml-auto shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            {opt.desc}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Import status — auto-import feedback */}
              {promoteKey && importStatus === "loading" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 rounded-md bg-muted/40 border">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading…
                </div>
              )}
              {promoteKey && importStatus === "success" && importedLabel && (
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-md bg-green-50 border border-green-200 text-green-800">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 truncate">
                    Imported: <span className="font-semibold">{importedLabel}</span>
                  </span>
                </div>
              )}
              {promoteKey && importStatus === "error" && importError && (
                <div className="text-xs px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-800">
                  {importError}
                </div>
              )}

              {/* Inline Job picker */}
              {promoteKey === "job" && (
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
              {promoteKey === "company" && (
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
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                        No companies yet — follow or add one from{" "}
                        <span className="font-medium text-primary">/companies</span>.
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

          {step === 1 && (
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

          {step === 2 && (
            <div>
              {contentTemplate === "skills-demo" ? (
                <SkillsDemoSetup state={state} onStateChange={onStateChange} />
              ) : (
                <PromptEditor
                  state={state}
                  onStateChange={onStateChange}
                  showJD={showJD}
                  onToggleJD={() => setShowJD((v) => !v)}
                />
              )}
            </div>
          )}
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
              onClick={() => setStep((s) => Math.min(stepTitles.length - 1, s + 1))}
              disabled={!canAdvance}
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleDone} disabled={!canGenerate || running}>
              {running ? (
                <>Generating…</>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" /> Done — Generate
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

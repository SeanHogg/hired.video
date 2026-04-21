// PromptEditor.tsx — primary input for all video templates.
// Adapts its entire layout based on the selected content template (purpose).
//
// Resume / Personal Brand / Skills Demo → resume-centric: paste or pick resume, optional job targeting
// Job Ad / Company Promo               → job-centric: pick existing job or paste job/company details

import { useRef, useState, useEffect } from "react";
import { Sparkles, Upload, ChevronDown, ChevronUp, Briefcase, FileText, Bookmark, Loader2, X } from "lucide-react";
import { extractTextFromFile } from "@/lib/extract-text";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import FileUploadInput from "@/components/FileUploadInput";
import type { StudioProjectState } from "@/types/studio";
import { resumeService } from "@/lib/services/resume-service";
import type { ResumeSummary } from "@/lib/services/resume-service";
import { jobService } from "@/lib/services/job-service";
import type { JobSummary } from "@/lib/services/job-service";
import type { Resume as FrontendResume } from "@/types/resume";
import type { StudioPurpose } from "@/lib/services/studio-service";

// ─── Template config ────────────────────────────────────────────────────────

type InputMode = "resume" | "job";

interface TemplateConfig {
  /** Controls whether the primary input area shows resume tools or job tools */
  inputMode: InputMode;
  inputLabel: string;
  uploadButton: string;
  inputPlaceholder: string;
  directionPlaceholder: string;
  /** Show "Personalise for a job" secondary section (resume mode only) */
  showJobSection: boolean;
}

function getConfig(purpose: StudioPurpose): TemplateConfig {
  switch (purpose) {
    case "job_ad":
      return {
        inputMode: "job",
        inputLabel: "Job Details",
        uploadButton: "Upload Document",
        inputPlaceholder: "Paste the job title, description, requirements, and benefits here…",
        directionPlaceholder: "e.g. Create a 30-second video ad highlighting remote work and benefits",
        showJobSection: false,
      };
    case "company_promo":
    case "recruiter_brand":
      return {
        inputMode: "job",
        inputLabel: "Company Info",
        uploadButton: "Upload Document",
        inputPlaceholder: "Paste your company overview, mission, culture, and what makes you a great employer…",
        directionPlaceholder: "e.g. Create a company culture video showcasing team and values",
        showJobSection: false,
      };
    case "personal_brand":
      return {
        inputMode: "resume",
        inputLabel: "About You",
        uploadButton: "Upload Resume",
        inputPlaceholder: "Paste your bio, resume, or key talking points here…",
        directionPlaceholder: "e.g. Create a personal brand video focused on leadership and innovation",
        showJobSection: true,
      };
    case "product_launch":
      return {
        inputMode: "job",
        inputLabel: "Product Details",
        uploadButton: "Upload Document",
        inputPlaceholder: "Paste the product description, features, and value proposition here…",
        directionPlaceholder: "e.g. Create an energetic launch video with feature highlights",
        showJobSection: false,
      };
    default: // "resume"
      return {
        inputMode: "resume",
        inputLabel: "Resume",
        uploadButton: "Upload Resume",
        inputPlaceholder: "Paste your resume text here, or drag-and-drop a .pdf / .txt / .docx file…",
        directionPlaceholder: "e.g. Create a 30-second video for a senior engineering role with a bold cinematic style",
        showJobSection: true,
      };
  }
}

interface Props {
  state: StudioProjectState;
  onStateChange: (patch: Partial<StudioProjectState>) => void;
  showJD: boolean;
  onToggleJD: () => void;
}

/** Serialize a JobSummary into plain text for the AI. */
export function jobToText(j: JobSummary): string {
  const lines: string[] = [];
  lines.push(j.title);
  if (j.company) lines.push(`Company: ${j.company}`);
  if (j.location) lines.push(`Location: ${j.location}${j.isRemote ? " (Remote)" : ""}`);
  if (j.employmentType) lines.push(`Type: ${j.employmentType}`);
  if (j.experienceLevel) lines.push(`Level: ${j.experienceLevel}`);
  if (j.salaryMin != null || j.salaryMax != null) {
    const min = j.salaryMin != null ? `$${j.salaryMin.toLocaleString()}` : "";
    const max = j.salaryMax != null ? `$${j.salaryMax.toLocaleString()}` : "";
    lines.push(`Salary: ${min}${min && max ? " – " : ""}${max}`);
  }
  if (j.description) lines.push(`\n${j.description}`);
  return lines.join("\n");
}

/** Serialize a loaded FrontendResume into plain readable text for the AI. */
export function resumeToText(r: FrontendResume): string {
  const lines: string[] = [];
  const b = r?.content?.basics;
  if (b?.name) lines.push(`${b.name}${b.label ? ` — ${b.label}` : ""}`);
  if (b?.email) lines.push(`Email: ${b.email}`);
  if (b?.summary) lines.push(`\nSummary:\n${b.summary}`);

  const work = r?.content?.work;
  if (work?.length) {
    lines.push("\nWork Experience:");
    for (const w of work) {
      lines.push(`• ${w.position} at ${w.name} (${w.startDate}–${w.endDate || "Present"})`);
      if (w.summary) lines.push(`  ${w.summary}`);
      w.highlights?.forEach((h) => lines.push(`  - ${h}`));
    }
  }

  const edu = r?.content?.education;
  if (edu?.length) {
    lines.push("\nEducation:");
    for (const e of edu) {
      lines.push(`• ${e.studyType} in ${e.area}, ${e.institution} (${e.startDate}–${e.endDate})`);
    }
  }

  const skills = r?.content?.skills;
  if (skills?.length) {
    lines.push("\nSkills:");
    lines.push(skills.map((s) => s.name).filter(Boolean).join(", "));
  }

  return lines.join("\n");
}

export default function PromptEditor({ state, onStateChange, showJD, onToggleJD }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cfg = getConfig(state.purpose);

  // ── Account resume picker ───────────────────────────────────────────────
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [resumePickerOpen, setResumePickerOpen] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);

  useEffect(() => {
    resumeService.getUserResumes()
      .then(setResumes)
      .catch(() => {});
  }, []);

  async function handleSelectResume(summary: ResumeSummary) {
    const id = (summary.Id || summary.id) as string | undefined;
    if (!id) return;
    setResumeLoading(true);
    setResumePickerOpen(false);
    try {
      const full = await resumeService.getResumeById(id);
      onStateChange({ resumeText: resumeToText(full as any), resumeId: id });
    } catch {
      onStateChange({ resumeId: id });
    } finally {
      setResumeLoading(false);
    }
  }

  // ── Saved / posted jobs picker ──────────────────────────────────────────
  const [savedJobs, setSavedJobs] = useState<JobSummary[]>([]);
  const [userJobs, setUserJobs] = useState<JobSummary[]>([]);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);

  useEffect(() => {
    jobService.getSavedJobs().then(setSavedJobs).catch(() => {});
    jobService.getUserJobs().then(setUserJobs).catch(() => {});
  }, []);

  /** For resume templates: selecting a job populates the secondary jobDescription field */
  function handleSelectJobForPersonalisation(job: JobSummary) {
    onStateChange({ jobDescription: job.description ?? `${job.title}${job.company ? ` at ${job.company}` : ""}` });
    setJobPickerOpen(false);
    if (!showJD) onToggleJD();
  }

  /** For job/company templates: selecting a job populates the primary resumeText field */
  function handleSelectJobAsPrimary(job: JobSummary) {
    onStateChange({ resumeText: jobToText(job) });
    setJobPickerOpen(false);
  }

  // ── File handlers ───────────────────────────────────────────────────────
  async function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const text = await extractTextFromFile(file);
    onStateChange({ resumeText: text });
  }

  // Merge saved + posted jobs, deduplicate by id
  const allJobs = [...userJobs, ...savedJobs].filter(
    (j, i, arr) => arr.findIndex((x) => x.id === j.id) === i,
  );

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Primary input area */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label>{cfg.inputLabel}</Label>
          <div className="flex items-center gap-2">
            <FileUploadInput
              buttonText={cfg.uploadButton}
              accept=".pdf,.doc,.docx,.txt,.md,.json"
              onFileSelected={async (file) => {
                const text = await extractTextFromFile(file);
                onStateChange({ resumeText: text });
              }}
            />

            {/* Resume picker — resume-mode templates */}
            {cfg.inputMode === "resume" && resumes.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setResumePickerOpen((o) => !o); setJobPickerOpen(false); }}
                disabled={resumeLoading}
              >
                {resumeLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <><FileText className="w-3.5 h-3.5 mr-1" /> From account</>
                }
              </Button>
            )}

            {/* Job picker — job-mode templates */}
            {cfg.inputMode === "job" && allJobs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setJobPickerOpen((o) => !o); setResumePickerOpen(false); }}
              >
                <Briefcase className="w-3.5 h-3.5 mr-1" /> From jobs
              </Button>
            )}
          </div>
        </div>

        {/* Account resume picker dropdown */}
        {resumePickerOpen && cfg.inputMode === "resume" && (
          <div className="mb-2 border rounded-lg overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your resumes</span>
              <button type="button" onClick={() => setResumePickerOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <ul className="max-h-48 overflow-y-auto divide-y">
              {resumes.map((r) => {
                const id = r.id;
                const name = r.title || "Untitled";
                const desc = r.description;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
                      onClick={() => handleSelectResume(r)}
                    >
                      <p className="text-xs font-medium leading-tight">{name}</p>
                      {desc && <p className="text-[11px] text-muted-foreground truncate">{desc}</p>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Job picker dropdown — for job-mode templates */}
        {jobPickerOpen && cfg.inputMode === "job" && (
          <div className="mb-2 border rounded-lg overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your jobs</span>
              <button type="button" onClick={() => setJobPickerOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {allJobs.length > 0 ? (
              <ul className="max-h-48 overflow-y-auto divide-y">
                {allJobs.map((j) => (
                  <li key={j.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
                      onClick={() => handleSelectJobAsPrimary(j)}
                    >
                      <p className="text-xs font-medium leading-tight">{j.title}</p>
                      {j.company && <p className="text-[11px] text-muted-foreground">{j.company}{j.location ? ` · ${j.location}` : ""}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No jobs yet. Paste job details in the text area below.
              </div>
            )}
          </div>
        )}

        <Textarea
          className="h-48 font-mono text-xs resize-none"
          placeholder={cfg.inputPlaceholder}
          value={state.resumeText}
          onChange={(e) => onStateChange({ resumeText: e.target.value })}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
        />
        {state.resumeText.length > 3000 && (
          <p className="text-[10px] text-muted-foreground text-right mt-0.5">
            {state.resumeText.length.toLocaleString()} characters
          </p>
        )}
      </div>

      {/* Direction prompt */}
      <div>
        <Label className="mb-1.5 block">Direction (optional)</Label>
        <Textarea
          className="h-20 resize-none"
          placeholder={cfg.directionPlaceholder}
          value={state.prompt}
          onChange={(e) => onStateChange({ prompt: e.target.value })}
        />
      </div>

      {/* Job personalisation — resume-mode templates only */}
      {cfg.showJobSection && (
        <div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={onToggleJD}
            >
              <Briefcase className="w-4 h-4" />
              Personalise for a job
              {showJD ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {savedJobs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setJobPickerOpen((o) => !o); setResumePickerOpen(false); if (!showJD) onToggleJD(); }}
              >
                <Bookmark className="w-3.5 h-3.5 mr-1" /> Saved jobs
              </Button>
            )}
          </div>

          {/* Saved job picker for personalisation */}
          {jobPickerOpen && cfg.inputMode === "resume" && (
            <div className="mt-2 border rounded-lg overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Saved jobs</span>
                <button type="button" onClick={() => setJobPickerOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <ul className="max-h-48 overflow-y-auto divide-y">
                {savedJobs.map((j) => (
                  <li key={j.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
                      onClick={() => handleSelectJobForPersonalisation(j)}
                    >
                      <p className="text-xs font-medium leading-tight">{j.title}</p>
                      {j.company && <p className="text-[11px] text-muted-foreground">{j.company}{j.location ? ` · ${j.location}` : ""}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showJD && (
            <div className="mt-2">
              <Textarea
                className="h-32 text-xs resize-none"
                placeholder="Paste the job description here. The AI will tailor your intro, achievements and skills to this role."
                value={state.jobDescription ?? ""}
                maxLength={4000}
                onChange={(e) => onStateChange({ jobDescription: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground text-right mt-0.5">
                {(state.jobDescription ?? "").length} / 4,000
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

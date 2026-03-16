// PromptEditor.tsx — resume text + prompt + optional job description + Run

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

interface Props {
  state: StudioProjectState;
  onStateChange: (patch: Partial<StudioProjectState>) => void;
  showJD: boolean;
  onToggleJD: () => void;
}

async function extractText(file: File): Promise<string> {
  return extractTextFromFile(file);
}

/** Serialize a loaded FrontendResume into plain readable text for the AI. */
function resumeToText(r: FrontendResume): string {
  const lines: string[] = [];
  const b = r?.data?.Basics;
  if (b?.Name) lines.push(`${b.Name}${b.Label ? ` — ${b.Label}` : ""}`);
  if (b?.Email) lines.push(`Email: ${b.Email}`);
  if (b?.Summary) lines.push(`\nSummary:\n${b.Summary}`);

  const work = r?.data?.Work;
  if (work?.length) {
    lines.push("\nWork Experience:");
    for (const w of work) {
      lines.push(`• ${w.Position} at ${w.Name} (${w.StartDate}–${w.EndDate || "Present"})`);
      if (w.Summary) lines.push(`  ${w.Summary}`);
      w.Highlights?.forEach((h) => lines.push(`  - ${h}`));
    }
  }

  const edu = r?.data?.Education;
  if (edu?.length) {
    lines.push("\nEducation:");
    for (const e of edu) {
      lines.push(`• ${e.StudyType} in ${e.Area}, ${e.Institution} (${e.StartDate}–${e.EndDate})`);
    }
  }

  const skills = r?.data?.Skills;
  if (skills?.length) {
    lines.push("\nSkills:");
    lines.push(skills.map((s) => s.Name).filter(Boolean).join(", "));
  }

  return lines.join("\n");
}

export default function PromptEditor({ state, onStateChange, showJD, onToggleJD }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

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
    const id = summary.Id || summary.id;
    if (!id) return;
    setResumeLoading(true);
    setResumePickerOpen(false);
    try {
      const full = await resumeService.getResumeById(id);
      onStateChange({ resumeText: resumeToText(full), resumeId: id });
    } catch {
      // fall back — at least set the ID
      onStateChange({ resumeId: id });
    } finally {
      setResumeLoading(false);
    }
  }

  // ── Saved job picker ────────────────────────────────────────────────────
  const [savedJobs, setSavedJobs] = useState<JobSummary[]>([]);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);

  useEffect(() => {
    jobService.getSavedJobs()
      .then(setSavedJobs)
      .catch(() => {});
  }, []);

  function handleSelectJob(job: JobSummary) {
    onStateChange({ jobDescription: job.description ?? `${job.title}${job.company ? ` at ${job.company}` : ""}` });
    setJobPickerOpen(false);
    if (!showJD) onToggleJD(); // open the JD section if it's closed
  }

  // ── File handlers ───────────────────────────────────────────────────────
  async function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const text = await extractText(file);
    onStateChange({ resumeText: text });
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await extractText(file);
    onStateChange({ resumeText: text });
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Resume */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label>Resume</Label>
          <div className="flex items-center gap-2">
            <FileUploadInput
              buttonText="Upload PDF / DOCX"
              accept=".pdf,.txt,.md,.docx"
              onFileSelected={async (file) => {
                const text = await extractTextFromFile(file);
                onStateChange({ resumeText: text });
              }}
            />

            {/* From account */}
            {resumes.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setResumePickerOpen((o) => !o)}
                disabled={resumeLoading}
              >
                {resumeLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <><FileText className="w-3.5 h-3.5 mr-1" /> From account</>
                }
              </Button>
            )}
          </div>
        </div>

        {/* Account resume picker */}
        {resumePickerOpen && (
          <div className="mb-2 border rounded-lg overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Your resumes</span>
              <button type="button" onClick={() => setResumePickerOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <ul className="max-h-48 overflow-y-auto divide-y">
              {resumes.map((r) => {
                const id = r.Id || r.id;
                const name = r.Name || r.name || "Untitled";
                const desc = r.Description || r.description;
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

        <Textarea
          className="h-48 font-mono text-xs resize-none"
          placeholder="Paste your resume text here, or drag-and-drop a .pdf / .txt / .docx file…"
          value={state.resumeText}
          onChange={(e) => onStateChange({ resumeText: e.target.value })}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
        />
      </div>

      {/* Prompt */}
      <div>
        <Label className="mb-1.5 block">Direction (optional)</Label>
        <Textarea
          className="h-20 resize-none"
          placeholder="e.g. Create a 30-second video for a senior engineering role with a bold cinematic style"
          value={state.prompt}
          onChange={(e) => onStateChange({ prompt: e.target.value })}
        />
      </div>

      {/* Job Description toggle */}
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

          {/* Saved jobs picker trigger */}
          {savedJobs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setJobPickerOpen((o) => !o); if (!showJD) onToggleJD(); }}
            >
              <Bookmark className="w-3.5 h-3.5 mr-1" /> Saved jobs
            </Button>
          )}
        </div>

        {/* Saved job picker */}
        {jobPickerOpen && (
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
                    onClick={() => handleSelectJob(j)}
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
          <Textarea
            className="mt-2 h-32 text-xs resize-none"
            placeholder="Paste the job description here. The AI will tailor your intro, achievements and skills to this role."
            value={state.jobDescription ?? ""}
            onChange={(e) => onStateChange({ jobDescription: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}

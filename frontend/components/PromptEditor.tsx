// PromptEditor.tsx — resume text + prompt + optional job description + Run

import { useRef } from "react";
import JSZip from "jszip";
import { Sparkles, Upload, ChevronDown, ChevronUp, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { StudioProjectState } from "@/types/studio";

interface Props {
  state: StudioProjectState;
  onStateChange: (patch: Partial<StudioProjectState>) => void;
  onGenerate: () => void;
  loading: boolean;
  showJD: boolean;
  onToggleJD: () => void;
}

async function extractText(file: File): Promise<string> {
  if (file.name.endsWith(".docx")) {
    const zip = await JSZip.loadAsync(file);
    const xml = await zip.file("word/document.xml")?.async("string");
    if (!xml) return "";
    return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return file.text();
}

export default function PromptEditor({ state, onStateChange, onGenerate, loading, showJD, onToggleJD }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

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

  const canRun = state.resumeText.trim().length > 50;

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Resume */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label>Resume</Label>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Upload .txt / .md / .docx
          </Button>
          <input ref={fileRef} type="file" accept=".txt,.md,.docx" className="hidden" onChange={handleFileInput} />
        </div>
        <Textarea
          className="h-48 font-mono text-xs resize-none"
          placeholder="Paste your resume text here, or drag-and-drop a .txt / .docx file…"
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
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={onToggleJD}
        >
          <Briefcase className="w-4 h-4" />
          Personalise for a job
          {showJD ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showJD && (
          <Textarea
            className="mt-2 h-32 text-xs resize-none"
            placeholder="Paste the job description here. The AI will tailor your intro, achievements and skills to this role."
            value={state.jobDescription ?? ""}
            onChange={(e) => onStateChange({ jobDescription: e.target.value })}
          />
        )}
      </div>

      {/* Run */}
      <Button
        className="w-full"
        size="lg"
        onClick={onGenerate}
        disabled={!canRun || loading}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            Generating…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Run
          </span>
        )}
      </Button>

      {!canRun && (
        <p className="text-xs text-muted-foreground text-center">
          Paste at least 50 characters of resume text to enable generation.
        </p>
      )}
    </div>
  );
}

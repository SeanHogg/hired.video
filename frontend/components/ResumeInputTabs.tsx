// Reusable Paste Text / Upload File / My Resumes input pattern.
// Extracted from the seven resume-input tool pages so each tool only
// describes WHAT to do with the content, not HOW to gather it.

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { resumeService } from "@/lib/services/resume-service";
import { extractTextFromFile } from "@/lib/extract-text";
import type { ResumeSummary } from "@/lib/services/resume-service";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/json",
  "application/ld+json",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface ResumeInputValue {
  /** Text content of the resume — always populated, no matter which tab was used. */
  resumeText: string;
  /** When the user picked from their saved resumes, the ID of that resume. */
  resumeId?: string;
  /** Which input mode produced the value. */
  source: "paste" | "upload" | "existing";
}

interface Props {
  value: ResumeInputValue | null;
  onChange: (value: ResumeInputValue | null) => void;
  onError?: (message: string) => void;
  /** Force a specific starting tab (e.g. when a resume is preselected). */
  defaultTab?: "text" | "upload" | "existing";
  /** Pre-select a resume by id when defaultTab === "existing". */
  initialResumeId?: string;
}

function resumeIdOf(r: ResumeSummary): string {
  return (r.Id ?? r.id ?? "") as string;
}

function resumeNameOf(r: ResumeSummary): string {
  return (r.Name ?? r.name ?? "Untitled Resume") as string;
}

export function ResumeInputTabs({ value, onChange, onError, defaultTab, initialResumeId }: Props) {
  const { isAuthenticated } = useAuth();
  const defaultTabResolved = defaultTab ?? (isAuthenticated ? "existing" : "text");
  const [tab, setTab] = useState<"text" | "upload" | "existing">(defaultTabResolved);
  const [pasteText, setPasteText] = useState(value?.source === "paste" ? value.resumeText : "");
  const [selectedResumeId, setSelectedResumeId] = useState(initialResumeId ?? (value?.source === "existing" ? value.resumeId ?? "" : ""));
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated,
  });

  // Auto-populate from an initially selected resume so downstream tool runs
  // can fire immediately (e.g. when opened from the Resumes context menu).
  useEffect(() => {
    if (!initialResumeId || !isAuthenticated) return;
    setSelectedResumeId(initialResumeId);
    (async () => {
      try {
        const resume = await resumeService.getResumeById(initialResumeId);
        const text = resume.data ? JSON.stringify(resume.data) : "";
        if (!text) {
          onError?.("Selected resume has no content yet.");
          return;
        }
        onChange({ resumeText: text, resumeId: initialResumeId, source: "existing" });
      } catch (err: any) {
        onError?.(err?.message ?? "Failed to load resume.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResumeId, isAuthenticated]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      onError?.("Please upload a PDF, Word, Markdown, JSON, or text file.");
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      onError?.("File size must be less than 10MB.");
      return;
    }
    setFile(selected);
    try {
      const text = await extractTextFromFile(selected);
      if (!text.trim()) {
        onError?.("Could not extract text from this file.");
        return;
      }
      onChange({ resumeText: text, source: "upload" });
    } catch (err: any) {
      onError?.(err?.message ?? "Failed to read file.");
    }
  };

  const handleTextChange = (text: string) => {
    setPasteText(text);
    if (text.trim()) {
      onChange({ resumeText: text, source: "paste" });
    } else {
      onChange(null);
    }
  };

  const handleSelectResume = async (id: string) => {
    setSelectedResumeId(id);
    if (!id) {
      onChange(null);
      return;
    }
    try {
      const resume = await resumeService.getResumeById(id);
      const text = resume.data ? JSON.stringify(resume.data) : "";
      if (!text) {
        onError?.("Selected resume has no content yet.");
        return;
      }
      onChange({ resumeText: text, resumeId: id, source: "existing" });
    } catch (err: any) {
      onError?.(err?.message ?? "Failed to load resume.");
    }
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="text">Paste Text</TabsTrigger>
        <TabsTrigger value="upload">Upload File</TabsTrigger>
        <TabsTrigger value="existing" disabled={!isAuthenticated}>
          My Resumes{!isAuthenticated && " (Login Required)"}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="text" className="space-y-2">
        <label className="text-sm font-medium block">Resume Text</label>
        <Textarea
          placeholder="Paste your resume text here..."
          value={pasteText}
          onChange={(e) => handleTextChange(e.target.value)}
          className="min-h-[200px]"
        />
      </TabsContent>

      <TabsContent value="upload" className="space-y-2">
        <label className="text-sm font-medium block">Upload Resume File</label>
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx,.txt,.md,.json"
            className="hidden"
            id="resume-input-tabs-file"
          />
          <label htmlFor="resume-input-tabs-file" className="cursor-pointer">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, Word, Markdown, JSON, or Text files (max 10MB)
            </p>
          </label>
        </div>
        {file && (
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium truncate">{file.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFile(null);
                onChange(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              Remove
            </Button>
          </div>
        )}
      </TabsContent>

      <TabsContent value="existing" className="space-y-2">
        <label className="text-sm font-medium block">Select Resume</label>
        <Select value={selectedResumeId} onValueChange={handleSelectResume}>
          <SelectTrigger>
            <SelectValue placeholder="Choose one of your resumes" />
          </SelectTrigger>
          <SelectContent>
            {resumes?.filter((r) => resumeIdOf(r)).map((r) => (
              <SelectItem key={resumeIdOf(r)} value={resumeIdOf(r)}>
                {resumeNameOf(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TabsContent>
    </Tabs>
  );
}

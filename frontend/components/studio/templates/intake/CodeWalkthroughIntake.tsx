// Intake for "Code Walkthrough" — collects project links, code snippets,
// and offers an inline screen + webcam recording (delegated to the existing
// WebcamRecorder). Output is serialized into resumeText so the storyboard
// generator gets the inputs it needs.

import { useEffect, useState } from "react";
import { Plus, Trash2, Github, Code2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WebcamRecorder } from "@/components/studio/WebcamRecorder";
import type { IntakeProps } from "../catalog";

interface CodeSnippet {
  id: string;
  label: string;
  language: string;
  code: string;
}

interface FormState {
  title: string;
  description: string;
  githubUrl: string;
  liveUrl: string;
  snippets: CodeSnippet[];
  recordedDurationSec: number | null;
}

const DEFAULT: FormState = {
  title: "",
  description: "",
  githubUrl: "",
  liveUrl: "",
  snippets: [],
  recordedDurationSec: null,
};

const HEADER = "Code Walkthrough";

function serialize(s: FormState): string {
  const lines = [HEADER];
  if (s.title) lines.push(`Project: ${s.title}`);
  if (s.description) lines.push(`\nOverview:\n${s.description}`);
  if (s.githubUrl) lines.push(`\nGitHub: ${s.githubUrl}`);
  if (s.liveUrl) lines.push(`Live: ${s.liveUrl}`);
  if (s.snippets.length) {
    lines.push("\nKey snippets:");
    for (const snip of s.snippets) {
      const lang = snip.language ? ` (${snip.language})` : "";
      lines.push(`\n— ${snip.label || "Snippet"}${lang} —`);
      if (snip.code) lines.push(snip.code);
    }
  }
  if (s.recordedDurationSec) {
    lines.push(`\n[Screen + webcam recording: ${Math.round(s.recordedDurationSec)}s]`);
  }
  return lines.join("\n");
}

function deserialize(text: string): FormState {
  if (!text.startsWith(HEADER)) return DEFAULT;
  const projectMatch = text.match(/^Project:\s*(.+)$/m);
  const overviewMatch = text.match(/\nOverview:\n([\s\S]*?)(?:\nGitHub:|\nLive:|\nKey snippets:|$)/);
  const githubMatch = text.match(/^GitHub:\s*(.+)$/m);
  const liveMatch = text.match(/^Live:\s*(.+)$/m);
  return {
    ...DEFAULT,
    title: projectMatch?.[1]?.trim() ?? "",
    description: overviewMatch?.[1]?.trim() ?? "",
    githubUrl: githubMatch?.[1]?.trim() ?? "",
    liveUrl: liveMatch?.[1]?.trim() ?? "",
  };
}

export default function CodeWalkthroughIntake({ state, onStateChange }: IntakeProps) {
  const [form, setForm] = useState<FormState>(() => deserialize(state.resumeText));
  const [showRecorder, setShowRecorder] = useState(false);

  useEffect(() => {
    onStateChange({ resumeText: serialize(form) });
  }, [form]);

  function addSnippet() {
    setForm((s) => ({
      ...s,
      snippets: [
        ...s.snippets,
        { id: `snip-${Date.now().toString(36)}`, label: "", language: "", code: "" },
      ],
    }));
  }

  function updateSnippet(id: string, patch: Partial<CodeSnippet>) {
    setForm((s) => ({
      ...s,
      snippets: s.snippets.map((snip) => (snip.id === id ? { ...snip, ...patch } : snip)),
    }));
  }

  function removeSnippet(id: string) {
    setForm((s) => ({ ...s, snippets: s.snippets.filter((snip) => snip.id !== id) }));
  }

  function handleRecordingComplete(_blob: Blob, durationMs: number) {
    setForm((s) => ({ ...s, recordedDurationSec: Math.round(durationMs / 1000) }));
    setShowRecorder(false);
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cw-title" className="mb-1.5 block">Project Title</Label>
          <Input
            id="cw-title"
            placeholder="e.g. Realtime Collaboration Engine"
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="cw-github" className="mb-1.5 flex items-center gap-1.5">
            <Github className="w-3.5 h-3.5" /> GitHub URL
          </Label>
          <Input
            id="cw-github"
            type="url"
            placeholder="https://github.com/username/project"
            value={form.githubUrl}
            onChange={(e) => setForm((s) => ({ ...s, githubUrl: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="cw-live" className="mb-1.5 block">Live URL (optional)</Label>
        <Input
          id="cw-live"
          type="url"
          placeholder="https://example.com"
          value={form.liveUrl}
          onChange={(e) => setForm((s) => ({ ...s, liveUrl: e.target.value }))}
        />
      </div>

      <div>
        <Label htmlFor="cw-desc" className="mb-1.5 block">What you'll walk through</Label>
        <Textarea
          id="cw-desc"
          className="h-24 resize-none text-xs"
          placeholder="The architecture, the tricky bits, the decisions you made…"
          value={form.description}
          onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
        />
      </div>

      {/* Code snippets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="flex items-center gap-1.5">
            <Code2 className="w-3.5 h-3.5" /> Code snippets
          </Label>
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={addSnippet}>
            <Plus className="w-3 h-3 mr-1" /> Add snippet
          </Button>
        </div>
        {form.snippets.length === 0 ? (
          <p className="text-[11px] text-muted-foreground border border-dashed rounded-md px-3 py-2">
            Paste any code you want to highlight in the video — each snippet
            becomes a focused beat.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {form.snippets.map((snip) => (
              <li key={snip.id} className="border rounded-lg p-2.5 bg-muted/20">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] mb-2">
                  <Input
                    placeholder="Snippet label (e.g. Auth handler)"
                    value={snip.label}
                    onChange={(e) => updateSnippet(snip.id, { label: e.target.value })}
                  />
                  <Input
                    placeholder="Lang"
                    className="w-24"
                    value={snip.language}
                    onChange={(e) => updateSnippet(snip.id, { language: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-muted-foreground hover:text-red-500"
                    onClick={() => removeSnippet(snip.id)}
                    aria-label="Remove snippet"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <textarea
                  className="w-full h-32 resize-y text-[11px] font-mono rounded-md border bg-background px-3 py-2"
                  placeholder="Paste code here…"
                  value={snip.code}
                  onChange={(e) => updateSnippet(snip.id, { code: e.target.value })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recording */}
      <div>
        <Label className="mb-1.5 flex items-center gap-1.5">
          <Video className="w-3.5 h-3.5" /> Screen + webcam recording (optional)
        </Label>
        {showRecorder ? (
          <div className="border rounded-lg p-2 bg-muted/20">
            <WebcamRecorder
              mode="screen+webcam"
              onRecordingComplete={handleRecordingComplete}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setShowRecorder(false)}
            >
              Cancel
            </Button>
          </div>
        ) : form.recordedDurationSec ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200 text-xs">
            <Video className="w-3.5 h-3.5 text-emerald-700" />
            <span className="text-emerald-800 flex-1">
              Recorded {form.recordedDurationSec}s of screen + webcam
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => {
                setForm((s) => ({ ...s, recordedDurationSec: null }));
                setShowRecorder(true);
              }}
            >
              Re-record
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowRecorder(true)}
          >
            <Video className="w-3.5 h-3.5 mr-1.5" /> Record screen + webcam
          </Button>
        )}
      </div>
    </div>
  );
}

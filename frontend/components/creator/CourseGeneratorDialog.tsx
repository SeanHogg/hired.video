"use client";

/**
 * AI Course Generator dialog — gap #162. POSTs to
 * `/api/courses/generate` and returns a course tree the parent page
 * commits via the existing course-create flow. The dialog stays UI-only:
 * persistence belongs to the caller so the route stays decoupled from
 * the editor's autosave / unsaved-changes logic.
 */

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import type { GeneratedCourse } from "@/lib/courses/generated-course";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (course: GeneratedCourse) => void;
}

export default function CourseGeneratorDialog({ open, onOpenChange, onGenerated }: Props) {
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [moduleCount, setModuleCount] = useState(4);
  const [lessonsPerModule, setLessonsPerModule] = useState(3);
  const [includeKnowledgeChecks, setIncludeKnowledgeChecks] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (topic.trim().length < 4) {
      setError("Topic must be at least 4 characters.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.post<{ data: { course: GeneratedCourse } }>(
        `/api/courses/generate`,
        {
          topic: topic.trim(),
          difficulty,
          moduleCount,
          lessonsPerModule,
          includeKnowledgeChecks,
        },
      );
      const course = (res.data as any).course as GeneratedCourse;
      onGenerated(course);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Generate a course with AI
            </span>
          </DialogTitle>
          <DialogDescription>
            Hand over a topic; we'll draft a module tree with scenes + knowledge
            checks. You can edit anything inside the studio after.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="course-gen-topic">Topic</label>
            <input
              id="course-gen-topic"
              className="w-full rounded border px-3 py-2 text-sm"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Negotiating your first job offer"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="course-gen-difficulty">Level</label>
              <select
                id="course-gen-difficulty"
                className="w-full rounded border px-2 py-2 text-sm"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="course-gen-modules">Modules</label>
              <input
                id="course-gen-modules"
                className="w-full rounded border px-2 py-2 text-sm"
                type="number"
                min={1} max={12}
                value={moduleCount}
                onChange={(e) => setModuleCount(Math.max(1, Math.min(12, Number(e.target.value) || 4)))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="course-gen-lessons">Lessons/module</label>
              <input
                id="course-gen-lessons"
                className="w-full rounded border px-2 py-2 text-sm"
                type="number"
                min={1} max={8}
                value={lessonsPerModule}
                onChange={(e) => setLessonsPerModule(Math.max(1, Math.min(8, Number(e.target.value) || 3)))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeKnowledgeChecks}
              onChange={(e) => setIncludeKnowledgeChecks(e.target.checked)}
            />
            <span>Add a knowledge check at the end of every lesson</span>
          </label>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={generating || topic.trim().length < 4}>
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

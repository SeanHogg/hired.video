// Intake for "Skills Demo" — pulls all skills from the user's selected
// (or master) resume, lets them pick which to demo, and visualizes which
// jobs each skill was used in. Output is serialized into resumeText so
// the storyboard generator gets the chosen skills + context.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Briefcase, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { resumeService } from "@/lib/services/resume-service";
import type { Resume } from "@/types/resume";
import type { IntakeProps } from "@/lib/studio/templates/catalog";

interface SkillUsage {
  skill: string;
  /** Work entries whose summary or highlights mention the skill. */
  usedIn: Array<{ id: string; position: string; company: string }>;
}

function buildSkillUsages(resume: Resume | null): SkillUsage[] {
  if (!resume) return [];
  const skills = resume.content?.skills ?? [];
  const work = resume.content?.work ?? [];
  // Pre-lowercase work blob so each skill match is a plain substring check.
  const workCorpus = work.map((w) => ({
    w,
    blob: [w.summary, ...(w.highlights ?? [])].join(" \n ").toLowerCase(),
  }));

  return skills
    .map((s) => s.name)
    .filter((n): n is string => Boolean(n?.trim()))
    .map((name) => {
      const needle = name.toLowerCase();
      const usedIn = workCorpus
        .filter((entry) => entry.blob.includes(needle))
        .map((entry, idx) => ({
          id: entry.w.id ?? `${entry.w.name}-${idx}`,
          position: entry.w.position || "Role",
          company: entry.w.name || "Company",
        }));
      return { skill: name, usedIn };
    });
}

function serialize(picked: SkillUsage[], note: string, resume: Resume | null): string {
  const lines: string[] = ["Skills Demo"];
  const name = resume?.content?.basics?.name;
  if (name) lines.push(name);
  if (note.trim()) lines.push(`\n${note.trim()}`);

  if (picked.length) {
    lines.push("\nSkills to demonstrate:");
    for (const p of picked) {
      const where = p.usedIn.length
        ? p.usedIn.map((u) => `${u.position} at ${u.company}`).join("; ")
        : "(no work history match)";
      lines.push(`• ${p.skill} — used in: ${where}`);
    }
  }
  return lines.join("\n");
}

export default function SkillsDemoIntake({ state, onStateChange }: IntakeProps) {
  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  // Load the resume once. Prefer the project's pre-set resumeId, then master.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let r: Resume | null = null;
        if (state.resumeId) {
          r = await resumeService.getResumeById(state.resumeId).catch(() => null);
        }
        if (!r) {
          const groups = await resumeService.getMasterResumeGroups();
          const masterId =
            groups.find((g) => g.masterResume?.isMaster)?.masterResume?.id ??
            groups[0]?.masterResume?.id;
          if (masterId) r = await resumeService.getResumeById(masterId);
        }
        if (cancelled) return;
        setResume(r);
        // Default-pick all skills so the user has something usable on first
        // render — they can deselect to narrow.
        const allSkills = (r?.content?.skills ?? [])
          .map((s) => s.name)
          .filter((n): n is string => Boolean(n?.trim()));
        setPicked(new Set(allSkills));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load resume");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [state.resumeId]);

  const usages = useMemo(() => buildSkillUsages(resume), [resume]);

  // Re-serialize whenever picks or note change.
  useEffect(() => {
    const pickedUsages = usages.filter((u) => picked.has(u.skill));
    onStateChange({ resumeText: serialize(pickedUsages, note, resume) });
  }, [picked, note, usages, resume]);

  function toggle(skill: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill); else next.add(skill);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your skills…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
        {error}
      </div>
    );
  }
  if (!resume || usages.length === 0) {
    return (
      <div className="p-5 text-sm border border-dashed rounded-md text-muted-foreground">
        No skills found on your resume yet. Add skills under <span className="font-medium">/resumes</span> to use this template.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Skills to demonstrate</Label>
          <span className="text-[10px] text-muted-foreground">
            {picked.size} of {usages.length} selected
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {usages.map((u) => {
            const on = picked.has(u.skill);
            return (
              <li key={u.skill}>
                <button
                  type="button"
                  onClick={() => toggle(u.skill)}
                  className={cn(
                    "w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-colors",
                    on
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  <div className={cn(
                    "shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center",
                    on ? "bg-primary border-primary" : "border-muted-foreground/40",
                  )}>
                    {on && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold">{u.skill}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {u.usedIn.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground italic">
                          No work history match
                        </span>
                      ) : (
                        u.usedIn.map((w) => (
                          <span
                            key={w.id}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                            title={`${w.position} at ${w.company}`}
                          >
                            <Briefcase className="w-2.5 h-2.5" />
                            {w.company}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <Label htmlFor="skills-demo-note" className="mb-1.5 block">Note for the AI (optional)</Label>
        <textarea
          id="skills-demo-note"
          className="w-full h-20 resize-none text-xs rounded-md border bg-background px-3 py-2"
          placeholder="Anything specific to highlight — a project, an outcome, a story…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </div>
  );
}

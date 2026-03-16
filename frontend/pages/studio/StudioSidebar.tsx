// StudioSidebar.tsx — project navigation: Create New, Recent, Templates, Roast link.

import { useState, useEffect } from "react";
import { Plus, Flame, Clock, LayoutTemplate, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { StudioProject } from "@/lib/services/studio-service";
import type { VideoScript } from "@/types/video-script";

// Template metadata with visual descriptions
const TEMPLATES: {
  label: string;
  file: string;
  desc: string;
  colors: string[];
  duration: number;
  motion: string;
}[] = [
  {
    label: "Professional",
    file: "video-resume-professional",
    desc: "28s · Purple gradient · Fade · Moderate motion",
    colors: ["#7c3aed", "#2563eb", "#c4b5fd"],
    duration: 28,
    motion: "moderate",
  },
  {
    label: "Minimal",
    file: "video-resume-minimal",
    desc: "20s · Dark monochrome · Cut · Subtle motion",
    colors: ["#18181b", "#3f3f46", "#a1a1aa"],
    duration: 20,
    motion: "minimal",
  },
];

interface Props {
  projects: StudioProject[];
  activeProjectId?: string | null;
  onCreateNew: () => void;
  onProjectSelect: (project: StudioProject) => void;
  onTemplateLoad: (script: VideoScript) => void;
}

const STATUS_COLOUR: Record<string, string> = {
  Draft:      "bg-muted text-muted-foreground",
  Processing: "bg-blue-500/20 text-blue-300",
  Publishing: "bg-amber-500/20 text-amber-300",
  Completed:  "bg-emerald-500/20 text-emerald-300",
  Failed:     "bg-red-500/20 text-red-300",
};

async function loadTemplate(file: string): Promise<VideoScript | null> {
  try {
    const mod = await import(`../../data/templates/${file}.json`);
    return mod.default as VideoScript;
  } catch {
    return null;
  }
}

export default function StudioSidebar({ projects, activeProjectId, onCreateNew, onProjectSelect, onTemplateLoad }: Props) {
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);

  // Clear active template highlight whenever the workspace is reset to a new/blank project
  useEffect(() => {
    if (activeProjectId == null) setActiveTemplate(null);
  }, [activeProjectId]);

  async function handleTemplate(file: string) {
    const script = await loadTemplate(file);
    if (script) {
      setActiveTemplate(file);
      onTemplateLoad(script);
    }
  }

  return (
    <aside className="studio-sidebar">
      {/* Create New — at the very top */}
      <div className="p-3 border-b">
        <Button className="w-full" size="sm" onClick={onCreateNew}>
          <Plus className="w-4 h-4 mr-2" /> New Video
        </Button>
      </div>

      {/* Recent Projects */}
      <section className="px-3 py-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          <Clock className="w-3 h-3" /> Recent
        </p>
        <ul className="flex flex-col gap-1">
          {projects.length === 0 && (
            <li className="text-xs text-muted-foreground px-1">No projects yet</li>
          )}
          {projects.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`w-full text-left px-2 py-1.5 rounded-md text-xs truncate flex items-center gap-2 transition-colors hover:bg-accent ${
                  p.id === activeProjectId ? "bg-accent font-medium" : ""
                }`}
                onClick={() => onProjectSelect(p)}
                title={p.title}
              >
                <span className="flex-1 truncate">{p.title}</span>
                <Badge className={`text-[10px] shrink-0 ${STATUS_COLOUR[p.status] ?? ""}`}>{p.status}</Badge>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Templates */}
      <section className="px-3 pb-3 border-t pt-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1">
          <LayoutTemplate className="w-3 h-3" /> Templates
        </p>
        <ul className="flex flex-col gap-2">
          {TEMPLATES.map((t) => {
            const isActive = activeTemplate === t.file;
            return (
              <li key={t.file}>
                <button
                  type="button"
                  className={`w-full text-left px-2.5 py-2.5 rounded-lg border transition-colors group ${
                    isActive
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-accent"
                  }`}
                  onClick={() => handleTemplate(t.file)}
                  title={`Load ${t.label} template`}
                >
                  {/* Color strip */}
                  <div className="flex gap-1 mb-2">
                    {t.colors.map((c) => (
                      <div
                        key={c}
                        className="h-2 flex-1 rounded-sm"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>

                  {/* Label + active check */}
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs font-semibold ${isActive ? "text-primary" : ""}`}>
                      {t.label}
                    </span>
                    {isActive && <Check className="w-3 h-3 text-primary" />}
                  </div>

                  {/* Description */}
                  <p className="text-[10px] text-muted-foreground leading-tight">{t.desc}</p>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Bottom links */}
      <div className="mt-auto border-t p-3">
        <Link
          to="/resume-roast"
          className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <Flame className="w-4 h-4 text-orange-400" /> Resume Roast
        </Link>
      </div>
    </aside>
  );
}

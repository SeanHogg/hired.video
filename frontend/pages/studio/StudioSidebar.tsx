// StudioSidebar.tsx — project navigation: Create New, Recent, Templates, Roast link.

import { Plus, Flame, Clock, LayoutTemplate } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { StudioProject } from "@/lib/services/studio-service";
import type { VideoScript } from "@/types/video-script";

// Minimal type for templates — just a label + the JSON filename
const TEMPLATES: { label: string; file: string }[] = [
  { label: "Professional",  file: "video-resume-professional" },
  { label: "Minimal",       file: "video-resume-minimal"      },
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
    const mod = await import(`../data/templates/${file}.json`);
    return mod.default as VideoScript;
  } catch {
    return null;
  }
}

export default function StudioSidebar({ projects, activeProjectId, onCreateNew, onProjectSelect, onTemplateLoad }: Props) {
  async function handleTemplate(file: string) {
    const script = await loadTemplate(file);
    if (script) onTemplateLoad(script);
  }

  return (
    <aside className="studio-sidebar">
      {/* Brand */}
      <div className="px-4 py-4 border-b">
        <span className="font-bold text-sm tracking-tight">hired.video Studio</span>
      </div>

      {/* Create New */}
      <div className="p-3">
        <Button className="w-full" size="sm" onClick={onCreateNew}>
          <Plus className="w-4 h-4 mr-2" /> New Video
        </Button>
      </div>

      {/* Recent Projects */}
      <section className="px-3 pb-2">
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
      <section className="px-3 pb-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-1 mt-3">
          <LayoutTemplate className="w-3 h-3" /> Templates
        </p>
        <ul className="flex flex-col gap-1">
          {TEMPLATES.map((t) => (
            <li key={t.file}>
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-accent transition-colors"
                onClick={() => handleTemplate(t.file)}
              >
                {t.label}
              </button>
            </li>
          ))}
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

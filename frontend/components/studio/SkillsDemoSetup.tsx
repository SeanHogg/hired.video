// SkillsDemoSetup.tsx — first-tab editor for the Skills Demo content template.
// Shows template selector (Code Walkthrough, Design Portfolio, etc.) and
// skill-specific fields. Serializes everything into resumeText so it flows
// through the standard generateStoryboard pipeline.

import { useState, useEffect } from "react";
import { Code2, Palette, BarChart3, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { StudioProjectState } from "@/types/studio";

// ─── Sub-template definitions ───────────────────────────────────────────────

type DemoTemplate = "general" | "code-walkthrough" | "design-portfolio" | "data-analysis";

interface DemoTemplateDef {
  value: DemoTemplate;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DEMO_TEMPLATES: DemoTemplateDef[] = [
  { value: "general",           label: "General",          description: "Flexible template for showcasing any skill or project.",          icon: Sparkles },
  { value: "code-walkthrough",  label: "Code Walkthrough", description: "Walk through code, explain architecture and decisions.",         icon: Code2 },
  { value: "design-portfolio",  label: "Design Portfolio", description: "Present design work, process, and outcomes.",                    icon: Palette },
  { value: "data-analysis",     label: "Data Analysis",    description: "Show data insights, methodology, and visualizations.",            icon: BarChart3 },
];

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  state: StudioProjectState;
  onStateChange: (patch: Partial<StudioProjectState>) => void;
}

/** Build the resumeText that gets sent to the AI from the form fields. */
function serialize(template: DemoTemplate, skillName: string, projectTitle: string, description: string, projectUrl: string): string {
  const lines: string[] = [];
  lines.push(`Skills Demo: ${skillName || "(skill name)"}`);
  lines.push(`Demo Type: ${DEMO_TEMPLATES.find((t) => t.value === template)?.label ?? template}`);
  if (projectTitle) lines.push(`Project: ${projectTitle}`);
  if (description) lines.push(`\nDescription:\n${description}`);
  if (projectUrl) lines.push(`\nProject URL: ${projectUrl}`);
  return lines.join("\n");
}

/** Try to parse fields back out of a previously serialized resumeText. */
function deserialize(text: string): { template: DemoTemplate; skillName: string; projectTitle: string; description: string; projectUrl: string } {
  const defaults = { template: "general" as DemoTemplate, skillName: "", projectTitle: "", description: "", projectUrl: "" };
  if (!text.startsWith("Skills Demo:")) return defaults;

  const skillMatch = text.match(/^Skills Demo:\s*(.+)$/m);
  const templateMatch = text.match(/^Demo Type:\s*(.+)$/m);
  const projectMatch = text.match(/^Project:\s*(.+)$/m);
  const descMatch = text.match(/\nDescription:\n([\s\S]*?)(?:\nProject URL:|$)/);
  const urlMatch = text.match(/^Project URL:\s*(.+)$/m);

  const templateLabel = templateMatch?.[1]?.trim();
  const template = DEMO_TEMPLATES.find((t) => t.label === templateLabel)?.value ?? "general";

  return {
    template,
    skillName: skillMatch?.[1]?.trim().replace(/^\(skill name\)$/, "") ?? "",
    projectTitle: projectMatch?.[1]?.trim() ?? "",
    description: descMatch?.[1]?.trim() ?? "",
    projectUrl: urlMatch?.[1]?.trim() ?? "",
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SkillsDemoSetup({ state, onStateChange }: Props) {
  // Parse initial values from resumeText (supports round-tripping)
  const initial = deserialize(state.resumeText);

  const [template, setTemplate] = useState<DemoTemplate>(initial.template);
  const [skillName, setSkillName] = useState(initial.skillName);
  const [projectTitle, setProjectTitle] = useState(initial.projectTitle);
  const [description, setDescription] = useState(initial.description);
  const [projectUrl, setProjectUrl] = useState(initial.projectUrl);

  // Sync resumeText whenever fields change
  useEffect(() => {
    const text = serialize(template, skillName, projectTitle, description, projectUrl);
    onStateChange({ resumeText: text });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, skillName, projectTitle, description, projectUrl]);

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* Template selector */}
      <div>
        <Label className="mb-2 block">Demo Type</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {DEMO_TEMPLATES.map((tmpl) => {
            const Icon = tmpl.icon;
            const isSelected = template === tmpl.value;
            return (
              <button
                key={tmpl.value}
                type="button"
                onClick={() => setTemplate(tmpl.value)}
                className={cn(
                  "flex items-start gap-2.5 p-3 rounded-lg border-2 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-accent/50",
                )}
              >
                <div className={cn(
                  "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                  isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{tmpl.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{tmpl.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Skill + Project fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="skill-name" className="mb-1.5 block">Skill Name *</Label>
          <Input
            id="skill-name"
            placeholder="e.g. React, Data Visualization, UX Design"
            value={skillName}
            onChange={(e) => setSkillName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="project-title" className="mb-1.5 block">Project Title</Label>
          <Input
            id="project-title"
            placeholder="e.g. E-commerce Dashboard"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="demo-desc" className="mb-1.5 block">Description</Label>
        <Textarea
          id="demo-desc"
          className="h-24 resize-none text-xs"
          placeholder="Briefly describe what you'll demonstrate — the problem, your approach, and the result…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Project URL */}
      <div>
        <Label htmlFor="project-url" className="mb-1.5 block">GitHub / Portfolio URL (optional)</Label>
        <Input
          id="project-url"
          type="url"
          placeholder="https://github.com/username/project"
          value={projectUrl}
          onChange={(e) => setProjectUrl(e.target.value)}
        />
      </div>
    </div>
  );
}

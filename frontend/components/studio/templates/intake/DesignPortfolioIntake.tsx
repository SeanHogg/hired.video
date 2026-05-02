// Intake for "Design Portfolio" — collects portfolio links, image references,
// and lets the user pull their resume's projects so each becomes a beat in
// the video. Output is serialized into resumeText.

import { useEffect, useState } from "react";
import { Plus, Trash2, ExternalLink, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resumeService } from "@/lib/services/resume-service";
import { studioService } from "@/lib/services/studio-service";
import type { Resume, Project } from "@/types/resume";
import type { IntakeProps } from "../catalog";

interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl: string;
}

interface FormState {
  intro: string;
  items: PortfolioItem[];
}

const HEADER = "Design Portfolio";

function projectToItem(p: Project, idx: number): PortfolioItem {
  return {
    id: p.id ?? `proj-${idx}`,
    title: p.name || "Untitled project",
    description: p.description || (p.highlights ?? []).join(" "),
    url: p.url || "",
    imageUrl: "",
  };
}

function serialize(form: FormState): string {
  const lines = [HEADER];
  if (form.intro.trim()) lines.push(`\n${form.intro.trim()}`);
  if (form.items.length) {
    lines.push("\nProjects:");
    for (const item of form.items) {
      lines.push(`\n• ${item.title || "Untitled"}`);
      if (item.description) lines.push(`  ${item.description}`);
      if (item.url) lines.push(`  Link: ${item.url}`);
      if (item.imageUrl) lines.push(`  Image: ${item.imageUrl}`);
    }
  }
  return lines.join("\n");
}

export default function DesignPortfolioIntake({ state, onStateChange }: IntakeProps) {
  const [form, setForm] = useState<FormState>({ intro: "", items: [] });
  const [resume, setResume] = useState<Resume | null>(null);
  const [loadingResume, setLoadingResume] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
          if (masterId) r = await resumeService.getResumeById(masterId).catch(() => null);
        }
        if (!cancelled) setResume(r);
      } finally {
        if (!cancelled) setLoadingResume(false);
      }
    })();
    return () => { cancelled = true; };
  }, [state.resumeId]);

  useEffect(() => {
    onStateChange({ resumeText: serialize(form) });
  }, [form]);

  function addItem() {
    setForm((s) => ({
      ...s,
      items: [
        ...s.items,
        { id: `item-${Date.now().toString(36)}`, title: "", description: "", url: "", imageUrl: "" },
      ],
    }));
  }

  function updateItem(id: string, patch: Partial<PortfolioItem>) {
    setForm((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
  }

  function removeItem(id: string) {
    setForm((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }));
  }

  function pullFromResume() {
    if (!resume) return;
    const projects = resume.content?.projects ?? [];
    if (!projects.length) return;
    setForm((s) => ({ ...s, items: projects.map((p, i) => projectToItem(p, i)) }));
  }

  async function uploadImage(itemId: string, file: File) {
    setUploadingId(itemId);
    const blobUrl = URL.createObjectURL(file);
    updateItem(itemId, { imageUrl: blobUrl });
    try {
      const res = await studioService.uploadSceneImage(file);
      updateItem(itemId, { imageUrl: res.data.url });
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Keep the blob URL if upload fails — at least the form preview works.
    } finally {
      setUploadingId(null);
    }
  }

  const resumeProjects = resume?.content?.projects ?? [];

  return (
    <div className="flex flex-col gap-5 p-5">
      <div>
        <Label htmlFor="dp-intro" className="mb-1.5 block">Intro / framing</Label>
        <Textarea
          id="dp-intro"
          className="h-20 resize-none text-xs"
          placeholder="Who you are and what kind of work this portfolio shows…"
          value={form.intro}
          onChange={(e) => setForm((s) => ({ ...s, intro: e.target.value }))}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Projects</Label>
        <div className="flex items-center gap-2">
          {!loadingResume && resumeProjects.length > 0 && (
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={pullFromResume}>
              Pull {resumeProjects.length} from resume
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={addItem}>
            <Plus className="w-3 h-3 mr-1" /> Add project
          </Button>
        </div>
      </div>

      {loadingResume && form.items.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking your resume for projects…
        </div>
      )}

      {form.items.length === 0 && !loadingResume ? (
        <p className="text-[11px] text-muted-foreground border border-dashed rounded-md px-3 py-2">
          {resumeProjects.length > 0
            ? "Click \"Pull from resume\" to seed this list with your existing projects."
            : "Click \"Add project\" to add your first portfolio item."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {form.items.map((item) => (
            <li key={item.id} className="border rounded-lg p-3 bg-muted/20">
              <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto]">
                {/* Image */}
                <div className="flex flex-col gap-1.5">
                  {item.imageUrl ? (
                    <div className="relative aspect-video rounded-md border overflow-hidden bg-card">
                      <img src={item.imageUrl} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                      {uploadingId === item.id && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <label className="aspect-video rounded-md border border-dashed flex items-center justify-center cursor-pointer hover:bg-accent transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadImage(item.id, f);
                          e.target.value = "";
                        }}
                      />
                      <ImagePlus className="w-4 h-4 text-muted-foreground" />
                    </label>
                  )}
                </div>
                {/* Fields */}
                <div className="flex flex-col gap-2 min-w-0">
                  <Input
                    placeholder="Project title"
                    value={item.title}
                    onChange={(e) => updateItem(item.id, { title: e.target.value })}
                  />
                  <Input
                    type="url"
                    placeholder="https://link-to-case-study"
                    value={item.url}
                    onChange={(e) => updateItem(item.id, { url: e.target.value })}
                  />
                  <textarea
                    className="w-full h-16 resize-none text-[11px] rounded-md border bg-background px-2 py-1.5"
                    placeholder="Brief — problem, approach, outcome…"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, { description: e.target.value })}
                  />
                </div>
                {/* Actions */}
                <div className="flex flex-col gap-1 items-end">
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-primary"
                      title="Open link"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

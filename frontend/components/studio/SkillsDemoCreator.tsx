"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Code2,
  Palette,
  BarChart3,
  Play,
  StopCircle,
  Globe,
  Lock,
  ExternalLink,
  Sparkles,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  createSkillsDemo,
  updateSkillsDemo,
  getSkillsDemos,
  generateSkillsDemoScript,
} from "@/lib/services/studio-features-service";
import type {
  SkillsDemo,
  SkillsDemoScript,
} from "@/lib/services/studio-features-service";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface SkillsDemoCreatorProps {
  resumeText?: string;
  onRecordingStart?: () => void;
  onDemoCreated?: (demo: { id: string; skillName: string }) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

type TemplateKey = "general" | "code-walkthrough" | "design-portfolio" | "data-analysis";

interface TemplateOption {
  value: TemplateKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TEMPLATES: TemplateOption[] = [
  {
    value: "general",
    label: "General",
    description: "A flexible template for showcasing any skill or project.",
    icon: Sparkles,
  },
  {
    value: "code-walkthrough",
    label: "Code Walkthrough",
    description: "Walk through code, explain architecture and decisions.",
    icon: Code2,
  },
  {
    value: "design-portfolio",
    label: "Design Portfolio",
    description: "Present design work, process, and outcomes.",
    icon: Palette,
  },
  {
    value: "data-analysis",
    label: "Data Analysis",
    description: "Show data insights, methodology, and visualizations.",
    icon: BarChart3,
  },
] as const;

// ─── Sub-components ─────────────────────────────────────────────────────────

function TemplateSelector({
  selected,
  onSelect,
}: {
  selected: TemplateKey;
  onSelect: (template: TemplateKey) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {TEMPLATES.map((tmpl) => {
        const Icon = tmpl.icon;
        const isSelected = selected === tmpl.value;
        return (
          <button
            key={tmpl.value}
            type="button"
            onClick={() => onSelect(tmpl.value)}
            className={cn(
              "flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors",
              isSelected
                ? "border-primary bg-primary/5"
                : "border-muted hover:border-muted-foreground/30 hover:bg-accent/50",
            )}
          >
            <div
              className={cn(
                "flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{tmpl.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tmpl.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ScriptPreview({ script }: { script: SkillsDemoScript }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Generated Script
          </CardTitle>
          <Badge variant="secondary" className="text-xs tabular-nums">
            {Math.ceil(script.total_duration_sec / 60)} min
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm font-medium">{script.title}</p>

        {script.sections.map((section, i) => (
          <div
            key={i}
            className="rounded-lg border p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {i + 1}
                </span>
                {section.heading}
              </h4>
              <span className="text-xs text-muted-foreground tabular-nums">
                {section.duration_sec}s
              </span>
            </div>

            {/* What to say */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                What to say
              </p>
              <p className="text-sm leading-relaxed">
                {section.teleprompter_text}
              </p>
            </div>

            {/* What to show */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                What to show
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {section.screen_instruction}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DemoCard({
  demo,
  onTogglePublic,
  isUpdating,
}: {
  demo: SkillsDemo;
  onTogglePublic: (id: string, isPublic: boolean) => void;
  isUpdating: boolean;
}) {
  const templateInfo = TEMPLATES.find((t) => t.value === demo.template);
  const Icon = templateInfo?.icon ?? Sparkles;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="pt-5 space-y-3">
        {/* Thumbnail / placeholder */}
        {demo.videoUrl ? (
          <div className="aspect-video bg-muted rounded-lg overflow-hidden">
            <video
              src={demo.videoUrl}
              className="w-full h-full object-cover"
              preload="metadata"
            />
          </div>
        ) : (
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
            <Icon className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{demo.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {demo.skillName}
            </p>
          </div>
          <Badge variant="outline" className="text-xs flex-shrink-0 capitalize">
            {templateInfo?.label ?? demo.template}
          </Badge>
        </div>

        {demo.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {demo.description}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {demo.projectUrl && (
              <a
                href={demo.projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                Project
              </a>
            )}
            {demo.durationMs != null && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.ceil(demo.durationMs / 1000)}s
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label
              htmlFor={`demo-pub-${demo.id}`}
              className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer"
            >
              {demo.isPublic ? (
                <Globe className="h-3 w-3" />
              ) : (
                <Lock className="h-3 w-3" />
              )}
              {demo.isPublic ? "Public" : "Private"}
            </Label>
            <Switch
              id={`demo-pub-${demo.id}`}
              checked={demo.isPublic}
              disabled={isUpdating}
              onCheckedChange={(checked) =>
                onTogglePublic(demo.id, checked)
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function SkillsDemoCreator({
  resumeText,
  onRecordingStart,
  onDemoCreated,
}: SkillsDemoCreatorProps) {
  // State: demos list
  const [demos, setDemos] = useState<SkillsDemo[]>([]);
  const [demosLoading, setDemosLoading] = useState(true);
  const [demosError, setDemosError] = useState<string | null>(null);

  // State: creator form
  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateKey>("general");
  const [skillName, setSkillName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectUrl, setProjectUrl] = useState("");

  // State: script generation
  const [script, setScript] = useState<SkillsDemoScript | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // State: recording
  const [isRecording, setIsRecording] = useState(false);
  const [createdDemo, setCreatedDemo] = useState<SkillsDemo | null>(null);

  // State: saving / updating
  const [isSaving, setIsSaving] = useState(false);
  const [updatingDemoId, setUpdatingDemoId] = useState<string | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────

  const fetchDemos = useCallback(async () => {
    setDemosLoading(true);
    setDemosError(null);
    try {
      const data = await getSkillsDemos();
      setDemos(data);
    } catch (err) {
      setDemosError(
        err instanceof Error ? err.message : "Failed to load demos",
      );
    } finally {
      setDemosLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDemos();
  }, [fetchDemos]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleGenerateScript = useCallback(async () => {
    if (!skillName.trim()) return;

    setIsGenerating(true);
    setGenerateError(null);
    setScript(null);
    try {
      const result = await generateSkillsDemoScript({
        skillName: skillName.trim(),
        template: selectedTemplate,
        projectUrl: projectUrl.trim() || undefined,
        projectDescription: description.trim() || undefined,
        resumeText,
      });
      setScript(result);
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate script",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [skillName, selectedTemplate, projectUrl, description, resumeText]);

  const handleStartRecording = useCallback(async () => {
    if (!skillName.trim() || !projectTitle.trim()) return;

    setIsSaving(true);
    try {
      const demo = await createSkillsDemo({
        skillName: skillName.trim(),
        template: selectedTemplate,
        title: projectTitle.trim(),
        description: description.trim() || undefined,
        projectUrl: projectUrl.trim() || undefined,
      });
      setCreatedDemo(demo);
      setIsRecording(true);
      onRecordingStart?.();
      onDemoCreated?.({ id: demo.id, skillName: demo.skillName });
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to create demo",
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    skillName,
    projectTitle,
    selectedTemplate,
    description,
    projectUrl,
    onRecordingStart,
    onDemoCreated,
  ]);

  const handleStopRecording = useCallback(() => {
    setIsRecording(false);
    fetchDemos();
  }, [fetchDemos]);

  const handleTogglePublic = useCallback(
    async (demoId: string, isPublic: boolean) => {
      setUpdatingDemoId(demoId);
      try {
        const updated = await updateSkillsDemo(demoId, { isPublic });
        setDemos((prev) =>
          prev.map((d) => (d.id === updated.id ? updated : d)),
        );
      } catch {
        // silently handle
      } finally {
        setUpdatingDemoId(null);
      }
    },
    [],
  );

  const handleResetForm = useCallback(() => {
    setSkillName("");
    setProjectTitle("");
    setDescription("");
    setProjectUrl("");
    setScript(null);
    setGenerateError(null);
    setCreatedDemo(null);
    setIsRecording(false);
    setSelectedTemplate("general");
  }, []);

  // ── Derived state ───────────────────────────────────────────────────────

  const canGenerate = skillName.trim().length > 0;
  const canRecord =
    skillName.trim().length > 0 && projectTitle.trim().length > 0;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Skills Demo Creator
        </h2>
        <p className="text-muted-foreground mt-1">
          Create professional demo videos to showcase your skills and projects.
        </p>
      </div>

      <Tabs defaultValue="create" className="space-y-4">
        <TabsList>
          <TabsTrigger value="create" className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Create Demo
          </TabsTrigger>
          <TabsTrigger value="demos" className="flex items-center gap-1.5">
            <Play className="h-4 w-4" />
            My Demos
            {demos.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 flex items-center justify-center text-xs"
              >
                {demos.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Create Tab ──────────────────────────────────────────────── */}
        <TabsContent value="create" className="space-y-6">
          {/* Recording mode */}
          {isRecording && createdDemo ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Recording: {createdDemo.title}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetForm}
                >
                  Cancel
                </Button>
              </div>

              {/* Recorder area */}
              <Card>
                <CardContent className="pt-5">
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-red-300 dark:border-red-800">
                    <div className="text-center space-y-3">
                      <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse mx-auto" />
                      <p className="text-sm font-medium text-red-600 dark:text-red-400">
                        Screen + Webcam recording in progress
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Share your screen to walk through your demo
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center mt-4">
                    <Button
                      variant="destructive"
                      onClick={handleStopRecording}
                    >
                      <StopCircle className="h-4 w-4 mr-2" />
                      Stop Recording
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Script teleprompter during recording */}
              {script && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      Teleprompter
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {script.sections.map((section, i) => (
                      <div key={i} className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {section.heading}
                        </p>
                        <p className="text-sm leading-relaxed">
                          {section.teleprompter_text}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <>
              {/* Template selector */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Choose a Template
                </Label>
                <TemplateSelector
                  selected={selectedTemplate}
                  onSelect={setSelectedTemplate}
                />
              </div>

              {/* Form fields */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">
                    Demo Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="skill-name">Skill Name *</Label>
                      <Input
                        id="skill-name"
                        placeholder="e.g. React, Data Visualization, UX Design"
                        value={skillName}
                        onChange={(e) => setSkillName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="project-title">Project Title *</Label>
                      <Input
                        id="project-title"
                        placeholder="e.g. E-commerce Dashboard"
                        value={projectTitle}
                        onChange={(e) => setProjectTitle(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="demo-description">Description</Label>
                    <Textarea
                      id="demo-description"
                      placeholder="Briefly describe what you'll demonstrate..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="project-url">
                      GitHub / Portfolio URL
                    </Label>
                    <Input
                      id="project-url"
                      type="url"
                      placeholder="https://github.com/username/project"
                      value={projectUrl}
                      onChange={(e) => setProjectUrl(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* AI Script Generation */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Script Generator
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Generate a structured script with teleprompter text and
                    screen instructions for each section of your demo.
                  </p>
                  <Button
                    onClick={handleGenerateScript}
                    disabled={!canGenerate || isGenerating}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {isGenerating
                      ? "Generating Script..."
                      : "Generate Script"}
                  </Button>

                  {generateError && (
                    <p className="text-sm text-destructive">
                      {generateError}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Script preview */}
              {script && <ScriptPreview script={script} />}

              {/* Start recording */}
              <Card>
                <CardContent className="pt-5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        Ready to record?
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        This will open screen + webcam recording mode.
                      </p>
                    </div>
                    <Button
                      disabled={!canRecord || isSaving}
                      onClick={handleStartRecording}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {isSaving ? "Creating..." : "Start Recording"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Demos Tab ───────────────────────────────────────────────── */}
        <TabsContent value="demos" className="space-y-4">
          {/* Error */}
          {demosError && (
            <Card className="border-destructive">
              <CardContent className="pt-5">
                <p className="text-sm text-destructive">{demosError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={fetchDemos}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Loading */}
          {demosLoading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-5 space-y-3">
                    <div className="aspect-video bg-muted rounded-lg animate-pulse" />
                    <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                    <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty */}
          {!demosLoading && !demosError && demos.length === 0 && (
            <Card>
              <CardContent className="pt-5 text-center py-12">
                <Code2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No demos yet. Create your first skills demo!
                </p>
              </CardContent>
            </Card>
          )}

          {/* Demos grid */}
          {!demosLoading && !demosError && demos.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {demos.map((demo) => (
                <DemoCard
                  key={demo.id}
                  demo={demo}
                  onTogglePublic={handleTogglePublic}
                  isUpdating={updatingDemoId === demo.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

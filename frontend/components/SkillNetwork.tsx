/**
 * SkillNetwork — interactive proof of "real and qualified". Renders the
 * skill-evidence graph extracted from a resume across four lenses:
 *   • Network   — force-directed: skills ↔ positions/projects/etc
 *   • By Skill  — for each skill, every place the candidate used it
 *   • By Position — for each role/project, every skill demonstrated
 *   • Gaps      — diff against a saved job's required skills
 *
 * Drop-in pattern mirrors `<ResumeTimelines>`: a single `resumeData` prop,
 * no `canX` booleans handed in by consumers. The component reads the
 * canonical evidence array (`content.skillEvidence`) and the section
 * items they reference, computes years/level via the shared
 * `enrichSkillsWithEvidence` helper, and self-gates by returning null
 * when the resume has nothing graphable.
 *
 * Library: `react-force-graph-2d` is loaded via React.lazy + Suspense so
 * the canvas-based renderer never tries to evaluate during the
 * prerender HTML pass — that script only rewrites <head> tags, but
 * keeping the lazy boundary makes the bundle code-split cleanly.
 */

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  ExternalLink,
  Folder,
  GraduationCap,
  Heart,
  Network,
  Sparkles,
  Target,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deriveEvidenceFromText,
  enrichSkillsWithEvidence,
  flattenSkillsForView,
  groupEvidenceBySkill,
  groupEvidenceByItem,
  indexResolvedItems,
  inferLevelFromYears,
  listResolvableItems,
  type ResolvedItem,
} from "@shared/skill-evidence";
import type {
  ResumeData,
  Skill,
  SkillEvidence,
  SkillEvidenceItemType,
  SkillLevel,
} from "@/types/resume";
import { useAuth } from "@/lib/auth";
import { jobService } from "@/lib/services/job-service";
import { resumeService } from "@/lib/services/resume-service";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Maximize2,
  RotateCcw,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

// react-force-graph-2d ships as ESM and pulls in canvas-only deps. Lazy
// import so the bundle stays small for pages that don't render the
// graph, and so any "window is undefined" path inside the lib never
// runs on a non-browser tick.
const ForceGraph2D = lazy(async () => {
  const mod = await import("react-force-graph-2d");
  return { default: mod.default };
});

// ─── Constants ─────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<SkillLevel, string> = {
  Beginner: "#94a3b8", // slate-400
  Intermediate: "#0ea5e9", // sky-500
  Advanced: "#8b5cf6", // violet-500
  Expert: "#f59e0b", // amber-500
};

const ITEM_TYPE_COLORS: Record<SkillEvidenceItemType, string> = {
  work: "#10b981", // emerald
  volunteer: "#ec4899", // pink
  project: "#06b6d4", // cyan
  education: "#6366f1", // indigo
  certificate: "#f59e0b", // amber
  award: "#f43f5e", // rose
  publication: "#f97316", // orange
};

const ITEM_TYPE_ICONS: Record<SkillEvidenceItemType, React.ReactNode> = {
  work: <Briefcase className="h-4 w-4" />,
  volunteer: <Heart className="h-4 w-4" />,
  project: <Folder className="h-4 w-4" />,
  education: <GraduationCap className="h-4 w-4" />,
  certificate: <Award className="h-4 w-4" />,
  award: <Award className="h-4 w-4" />,
  publication: <BookOpen className="h-4 w-4" />,
};

const SKILL_NODE_COLOR_DEFAULT = "#64748b"; // slate-500 for skills without level

// ─── Public surface ────────────────────────────────────────────────────────

interface SkillNetworkProps {
  resumeData: ResumeData | undefined | null;
  /** Heading override — visualizer is reused on resume page and profile
   *  page so the consumer can adjust the title (e.g. "Sean's Skill Network"
   *  on someone else's profile). When omitted, falls back to a generic. */
  title?: string;
  /** Identity (NOT capability) — when both are present and the current
   *  user matches `ownerUserId`, the component reveals owner-only controls
   *  (Rebuild Evidence button + manual binding handles). The component
   *  derives the boolean itself; consumers don't pass `canEdit`. */
  resumeId?: string | null;
  ownerUserId?: string | null;
  /** Called after a successful evidence rebuild so the parent can refetch
   *  the resume. Optional — the component still updates its own state. */
  onResumeUpdated?: () => void;
}

export default function SkillNetwork({
  resumeData,
  title,
  resumeId,
  ownerUserId,
  onResumeUpdated,
}: SkillNetworkProps) {
  const items = useMemo(() => listResolvableItems(resumeData ?? undefined), [resumeData]);
  const itemIndex = useMemo(() => indexResolvedItems(items), [items]);
  // Two views of the skill list:
  //   - enriched : preserves the JSON Resume shape (category rows with
  //                keywords) — what storage uses
  //   - flat     : one row per atomic skill, keywords promoted, parent
  //                level inherited — what the visualizer + By-Skill tab
  //                read so heuristic-bound evidence (which uses keyword
  //                names) finds matching nodes / rows
  const enrichedSkills = useMemo(
    () => enrichSkillsWithEvidence(resumeData ?? undefined),
    [resumeData],
  );
  const flatSkills = useMemo(
    () => flattenSkillsForView(enrichedSkills),
    [enrichedSkills],
  );
  const evidence = useMemo<SkillEvidence[]>(
    () => (resumeData?.skillEvidence ?? []) as SkillEvidence[],
    [resumeData?.skillEvidence],
  );

  // Self-gating: at least 2 skills OR any evidence row to make a graph
  // worth rendering. A single skill with no evidence is a textual fact,
  // not a network — fall back to the SkillsSection card.
  const hasGraphableData = enrichedSkills.length >= 2 || evidence.length > 0;

  // Owner derivation — the component decides for itself whether the
  // "Rebuild Evidence" button is visible. No prop-drilled `canEdit` flag.
  const { user } = useAuth();
  const isOwner =
    !!user?.id && !!ownerUserId && user.id === ownerUserId;

  if (!hasGraphableData) return null;

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              {title ?? "Skill Network"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Where this candidate used each skill, how long for, and what
              jobs they're qualified to take next.
            </p>
          </div>
          {isOwner && resumeId && (
            <RebuildEvidenceButton
              resumeId={resumeId}
              resumeData={resumeData ?? null}
              onResumeUpdated={onResumeUpdated}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="network" className="w-full">
          <div className="w-full overflow-x-auto">
            <TabsList className="inline-flex w-max gap-1 lg:grid lg:w-full lg:grid-cols-4 lg:gap-0">
              <TabsTrigger value="network" className="text-xs">
                <Network className="h-3 w-3 mr-1" />
                Network
              </TabsTrigger>
              <TabsTrigger value="by-skill" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                By Skill
              </TabsTrigger>
              <TabsTrigger value="by-position" className="text-xs">
                <Briefcase className="h-3 w-3 mr-1" />
                By Position
              </TabsTrigger>
              <TabsTrigger value="gaps" className="text-xs">
                <Target className="h-3 w-3 mr-1" />
                Gaps
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="network" className="space-y-4 mt-4">
            <NetworkTab
              skills={flatSkills}
              items={items}
              itemIndex={itemIndex}
              evidence={evidence}
            />
          </TabsContent>

          <TabsContent value="by-skill" className="space-y-4 mt-4">
            <BySkillTab
              skills={flatSkills}
              evidence={evidence}
              itemIndex={itemIndex}
            />
          </TabsContent>

          <TabsContent value="by-position" className="space-y-4 mt-4">
            <ByPositionTab
              evidence={evidence}
              itemIndex={itemIndex}
              skills={flatSkills}
            />
          </TabsContent>

          <TabsContent value="gaps" className="space-y-4 mt-4">
            {/* Gaps compares against jobs by NAME — the flat view exposes
                keywords as their own names, which is exactly what the
                job-required-skills list is matching against. */}
            <GapsTab skills={flatSkills} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Rebuild evidence (owner-only) ─────────────────────────────────────────

/**
 * Owner-only button that scans the resume's text fields (work summaries,
 * project descriptions, etc.) for whole-word skill mentions and writes
 * the resulting `SkillEvidence[]` rows back to `content.skillEvidence`.
 * No LLM call — the heuristic uses the same `deriveEvidenceFromText` the
 * API merge step uses, so the binding rules stay aligned across paths.
 *
 * Self-contained: takes the resume id + content, owns its own busy
 * state, and surfaces a toast with the row count. The parent only needs
 * to refetch via `onResumeUpdated` to see the network repopulate.
 */
function RebuildEvidenceButton({
  resumeId,
  resumeData,
  onResumeUpdated,
}: {
  resumeId: string;
  resumeData: ResumeData | null;
  onResumeUpdated?: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleRebuild = async () => {
    if (!resumeData || busy) return;
    setBusy(true);
    try {
      // Re-fetch fresh to avoid clobbering edits made in another tab.
      const fresh = await resumeService.getResumeById(resumeId);
      const content = fresh.content ?? resumeData;
      const existing = (content.skillEvidence ?? []) as SkillEvidence[];
      const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
      const mintId = () =>
        cryptoRef?.randomUUID?.() ??
        `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      const derived = deriveEvidenceFromText(content, existing, mintId);

      if (derived.length === 0) {
        toast({
          title: "No new bindings found",
          description:
            "Skills already covered by your work / project text — or the text doesn't mention the skill names. Try editing a position to add detail, then rebuild.",
        });
        return;
      }

      const nextEvidence = [...existing, ...derived];
      const nextData = { ...content, skillEvidence: nextEvidence } as any;
      await resumeService.updateResumeData(resumeId, { data: nextData });

      toast({
        title: "Evidence rebuilt",
        description: `Bound ${derived.length} new skill→position link${derived.length === 1 ? "" : "s"} from your existing resume text.`,
      });
      onResumeUpdated?.();
    } catch (err: any) {
      toast({
        title: "Rebuild failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRebuild}
      disabled={busy}
      title="Scan your resume text for skill mentions and bind them to specific positions"
    >
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Rebuilding…
        </>
      ) : (
        <>
          <Wand2 className="h-4 w-4 mr-2" />
          Rebuild Evidence
        </>
      )}
    </Button>
  );
}

// ─── Network tab ───────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  kind: "skill" | "item";
  level?: SkillLevel;
  itemType?: SkillEvidenceItemType;
  color: string;
  size: number;
  meta?: string;
}

interface GraphLink {
  source: string;
  target: string;
}

function buildGraphData(
  skills: Skill[],
  items: ResolvedItem[],
  evidence: SkillEvidence[],
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const seenIds = new Set<string>();

  // Caller passes the *flattened* list (each keyword promoted to a row),
  // so this loop is a simple 1-skill = 1-node mapping. Without flattening
  // upstream, evidence rows that bind to keyword names (which the
  // heuristic emits) would have no matching node and the link would be
  // silently dropped — that was the 2026-05-03 visualizer bug.
  for (const s of skills) {
    const rowName = (s.name ?? "").trim();
    if (!rowName) continue;
    const id = `s::${rowName.toLowerCase()}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const level = (s.level as SkillLevel | undefined) || undefined;
    const yrs = s.yearsOfExperience ?? 0;
    nodes.push({
      id,
      kind: "skill",
      label: rowName,
      level,
      color: level ? LEVEL_COLORS[level] : SKILL_NODE_COLOR_DEFAULT,
      // Size by years — capped so a 25y veteran doesn't drown the canvas.
      size: 4 + Math.min(8, yrs),
      meta: yrs ? `${formatYears(yrs)}${level ? ` · ${level}` : ""}` : level,
    });
  }

  // Only include items that are referenced by at least one evidence row.
  // The graph is about *demonstrated* skill use; an unreferenced job is
  // already on the timeline and adding it here just clutters the canvas.
  const usedItemIds = new Set<string>();
  for (const ev of evidence) {
    if (items.find((it) => it.id === ev.referenceId)) {
      usedItemIds.add(ev.referenceId);
    }
  }
  for (const it of items) {
    if (!usedItemIds.has(it.id)) continue;
    const id = `i::${it.id}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    nodes.push({
      id,
      kind: "item",
      label: it.title,
      itemType: it.itemType,
      color: ITEM_TYPE_COLORS[it.itemType],
      size: 6,
      meta: it.organization,
    });
  }

  // Edges
  for (const ev of evidence) {
    const skillId = `s::${ev.skillName.toLowerCase()}`;
    const itemId = `i::${ev.referenceId}`;
    if (!seenIds.has(skillId) || !seenIds.has(itemId)) continue;
    links.push({ source: skillId, target: itemId });
  }

  return { nodes, links };
}

function NetworkTab({
  skills,
  items,
  evidence,
  height = 560,
}: {
  skills: Skill[];
  items: ResolvedItem[];
  itemIndex: Map<string, ResolvedItem>;
  evidence: SkillEvidence[];
  /** Canvas height in pixels. Overridable so the SkillSubgraphDialog
   *  can render a taller version inside a modal. */
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<any>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: height });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: height });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  const data = useMemo(
    () => buildGraphData(skills, items, evidence),
    [skills, items, evidence],
  );

  const orphanSkills = data.nodes.filter(
    (n) => n.kind === "skill" && !data.links.some((l) => l.source === n.id || l.target === n.id),
  );

  // Auto-fit on first paint and whenever the graph data changes — without
  // this the simulation lands at whatever zoom react-force-graph picked
  // by default, which is usually too far out to read the labels (the
  // user's 2026-05-03 complaint). zoomToFit waits for the simulation to
  // settle a little, so a short delay produces a stable framing.
  useEffect(() => {
    if (!graphRef.current || data.nodes.length === 0) return;
    const t = setTimeout(() => {
      try {
        graphRef.current?.zoomToFit?.(400, 32);
      } catch {
        /* the lib bails before init in some race paths — ignore */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [data]);

  const callOnGraph = (fn: (g: any) => void) => {
    if (!graphRef.current) return;
    try {
      fn(graphRef.current);
    } catch {
      /* defensive — methods are stable in v1 but guard anyway */
    }
  };

  const handleZoomIn = () =>
    callOnGraph((g) => {
      const z = g.zoom?.() ?? 1;
      g.zoom?.(z * 1.4, 200);
    });
  const handleZoomOut = () =>
    callOnGraph((g) => {
      const z = g.zoom?.() ?? 1;
      g.zoom?.(z / 1.4, 200);
    });
  const handleFit = () => callOnGraph((g) => g.zoomToFit?.(400, 32));
  const handleReset = () =>
    callOnGraph((g) => {
      g.centerAt?.(0, 0, 200);
      g.zoom?.(1, 200);
    });

  if (data.nodes.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 text-sm">
        Skills found but no positions to link them to. Add work / project
        items so the network can render.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Legend />
      <div
        ref={containerRef}
        className="rounded-lg border bg-muted/20 overflow-hidden relative"
        style={{ height }}
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Rendering network…
            </div>
          }
        >
          {size.w > 0 && (
            <ForceGraph2D
              ref={graphRef}
              graphData={data}
              width={size.w}
              height={size.h}
              nodeRelSize={4}
              nodeColor={(n: any) => n.color}
              nodeVal={(n: any) => n.size}
              linkColor={() => "#cbd5e1"}
              linkWidth={1}
              cooldownTicks={80}
              minZoom={0.2}
              maxZoom={6}
              nodeCanvasObjectMode={() => "after"}
              nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
                // Lower the label-visibility threshold so labels show as
                // soon as the user zooms in even a little — at the
                // default fit the graph would otherwise be a soup of
                // unlabeled circles.
                if (scale < 0.8) return;
                const label: string = node.label;
                const fontSize = 11 / scale;
                ctx.font = `${fontSize}px sans-serif`;
                ctx.fillStyle = "#0f172a";
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillText(label, node.x, node.y + node.size + 1);
              }}
              linkDirectionalParticles={0}
            />
          )}
        </Suspense>
        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFit={handleFit}
          onReset={handleReset}
        />
      </div>
      {orphanSkills.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {orphanSkills.length} skill{orphanSkills.length === 1 ? "" : "s"}{" "}
          without linked evidence. Click <strong>Rebuild Evidence</strong>{" "}
          to scan your resume text and bind them automatically, or open
          the resume editor to attach a position manually.
        </div>
      )}
    </div>
  );
}

/**
 * Floating zoom toolbar — sits in the top-right corner of the canvas.
 * Self-contained: takes only the four action callbacks. The icons follow
 * the conventional layout (in / out / fit / reset) so the user doesn't
 * have to read a tooltip to find what they need. */
function ZoomControls({
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1 bg-background/90 backdrop-blur rounded-md border p-1 shadow-sm">
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onZoomIn} title="Zoom in">
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onZoomOut} title="Zoom out">
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onFit} title="Fit to view">
        <Maximize2 className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onReset} title="Reset (1×)">
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span className="font-medium text-muted-foreground">Skill level:</span>
      {(Object.entries(LEVEL_COLORS) as [SkillLevel, string][]).map(([level, color]) => (
        <span key={level} className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
          {level}
        </span>
      ))}
      <span className="font-medium text-muted-foreground ml-2">Section:</span>
      {(Object.entries(ITEM_TYPE_COLORS) as [SkillEvidenceItemType, string][]).map(
        ([itemType, color]) => (
          <span key={itemType} className="inline-flex items-center gap-1 capitalize">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
            {itemType}
          </span>
        ),
      )}
    </div>
  );
}

// ─── By Skill tab ──────────────────────────────────────────────────────────

function BySkillTab({
  skills,
  evidence,
  itemIndex,
}: {
  skills: Skill[];
  evidence: SkillEvidence[];
  itemIndex: Map<string, ResolvedItem>;
}) {
  const grouped = useMemo(() => groupEvidenceBySkill(evidence), [evidence]);

  // Order skills by years desc so the strongest signal appears first.
  const ordered = useMemo(
    () =>
      [...skills].sort(
        (a, b) => (b.yearsOfExperience ?? 0) - (a.yearsOfExperience ?? 0),
      ),
    [skills],
  );

  if (ordered.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 text-sm">
        No skills on this resume yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ordered.map((skill) => {
        const evList = grouped.get(skill.name.toLowerCase().trim()) ?? [];
        const level = (skill.level as SkillLevel | undefined) || undefined;
        return (
          <div
            key={skill.name}
            className="border rounded-lg p-3 hover:bg-muted/30 transition-colors"
          >
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-medium">{skill.name}</span>
              {level && (
                <Badge
                  variant="outline"
                  style={{
                    background: `${LEVEL_COLORS[level]}1a`,
                    borderColor: LEVEL_COLORS[level],
                    color: LEVEL_COLORS[level],
                  }}
                >
                  {level}
                </Badge>
              )}
              {skill.yearsOfExperience != null && skill.yearsOfExperience > 0 && (
                <Badge variant="outline" className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatYears(skill.yearsOfExperience)}
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {evList.length} use{evList.length === 1 ? "" : "s"}
              </Badge>
            </div>
            {evList.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No evidence linked. Run the Skill Extractor to bind this
                skill to specific positions.
              </p>
            ) : (
              <ul className="space-y-1">
                {evList.map((ev) => {
                  const item = itemIndex.get(ev.referenceId);
                  if (!item) return null;
                  return (
                    <li
                      key={ev.id}
                      className="text-sm flex items-start gap-2 text-muted-foreground"
                    >
                      <span style={{ color: ITEM_TYPE_COLORS[item.itemType] }}>
                        {ITEM_TYPE_ICONS[item.itemType]}
                      </span>
                      <span>
                        <span className="text-foreground font-medium">{item.title}</span>
                        {item.organization && <> · {item.organization}</>}
                        {item.startDate && (
                          <span className="text-xs"> · {formatDateRange(item.startDate, item.endDate)}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── By Position tab ───────────────────────────────────────────────────────

function ByPositionTab({
  evidence,
  itemIndex,
  skills,
}: {
  evidence: SkillEvidence[];
  itemIndex: Map<string, ResolvedItem>;
  skills: Skill[];
}) {
  const grouped = useMemo(() => groupEvidenceByItem(evidence, itemIndex), [
    evidence,
    itemIndex,
  ]);
  const skillByName = useMemo(() => {
    const m = new Map<string, Skill>();
    for (const s of skills) if (s.name) m.set(s.name.toLowerCase().trim(), s);
    return m;
  }, [skills]);

  if (grouped.size === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 text-sm">
        No evidence rows yet. Use the Skill Extractor on this resume to
        link skills to specific positions.
      </div>
    );
  }

  // Sort items by start date desc.
  const ordered = [...grouped.values()].sort((a, b) => {
    const ad = a.item.startDate ? new Date(a.item.startDate).getTime() : 0;
    const bd = b.item.startDate ? new Date(b.item.startDate).getTime() : 0;
    return bd - ad;
  });

  return (
    <div className="space-y-3">
      {ordered.map(({ item, skills: evRows }) => (
        <div key={item.id} className="border rounded-lg p-3">
          <div className="flex items-start gap-2 mb-2">
            <span style={{ color: ITEM_TYPE_COLORS[item.itemType] }}>
              {ITEM_TYPE_ICONS[item.itemType]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{item.title}</div>
              {item.organization && (
                <div className="text-sm text-muted-foreground">{item.organization}</div>
              )}
              {item.startDate && (
                <div className="text-xs text-muted-foreground">
                  {formatDateRange(item.startDate, item.endDate)}
                </div>
              )}
            </div>
            <Badge variant="secondary" className="text-xs shrink-0 capitalize">
              {item.itemType}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {evRows.map((ev) => {
              const skill = skillByName.get(ev.skillName.toLowerCase().trim());
              const level = (skill?.level as SkillLevel | undefined) || undefined;
              return (
                <Badge
                  key={ev.id}
                  variant="outline"
                  style={
                    level
                      ? {
                          background: `${LEVEL_COLORS[level]}1a`,
                          borderColor: LEVEL_COLORS[level],
                          color: LEVEL_COLORS[level],
                        }
                      : undefined
                  }
                >
                  {ev.skillName}
                </Badge>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Gaps tab (Phase 4) ────────────────────────────────────────────────────

function GapsTab({ skills }: { skills: Skill[] }) {
  const { isAuthenticated } = useAuth();
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  const { data: jobs = [] } = useQuery({
    queryKey: ["user-jobs-for-gaps"],
    queryFn: () => jobService.getUserJobs(),
    enabled: isAuthenticated,
  });

  const selectedJob = useMemo(
    () => jobs.find((j: any) => j.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const candidateSkillNames = useMemo(() => {
    const set = new Set<string>();
    for (const s of skills) {
      if (s.name) set.add(s.name.toLowerCase().trim());
      for (const k of s.keywords ?? []) {
        if (k) set.add(k.toLowerCase().trim());
      }
    }
    return set;
  }, [skills]);

  const requiredSkills = useMemo<string[]>(() => {
    if (!selectedJob) return [];
    const list = (selectedJob as any).skills;
    return Array.isArray(list) ? list.filter((s: unknown): s is string => typeof s === "string") : [];
  }, [selectedJob]);

  const { matched, missing } = useMemo(() => {
    const mat: string[] = [];
    const mis: string[] = [];
    for (const req of requiredSkills) {
      if (candidateSkillNames.has(req.toLowerCase().trim())) mat.push(req);
      else mis.push(req);
    }
    return { matched: mat, missing: mis };
  }, [requiredSkills, candidateSkillNames]);

  if (!isAuthenticated) {
    return (
      <div className="text-center text-muted-foreground py-8 text-sm">
        Sign in to compare this resume against your saved jobs.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-2 block">
          Compare against a saved job
        </label>
        <Select value={selectedJobId} onValueChange={setSelectedJobId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a job to find skill gaps" />
          </SelectTrigger>
          <SelectContent>
            {jobs.map((job: any) => (
              <SelectItem key={job.id} value={job.id}>
                {job.title}
                {job.company ? ` — ${job.company}` : ""}
              </SelectItem>
            ))}
            {jobs.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                You have no saved jobs yet.
              </div>
            )}
          </SelectContent>
        </Select>
      </div>

      {selectedJob && requiredSkills.length === 0 && (
        <div className="text-sm text-muted-foreground">
          This job has no extracted required skills. Run the{" "}
          <a href="/Tools/SkillExtractor" className="underline">Skill Extractor</a>{" "}
          on the job to get a comparable list.
        </div>
      )}

      {selectedJob && requiredSkills.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-emerald-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-emerald-700">
                <Sparkles className="h-4 w-4" />
                Already qualified ({matched.length}/{requiredSkills.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {matched.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No overlap with the job's required skills yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {matched.map((s) => (
                    <Badge key={s} variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-amber-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
                <Target className="h-4 w-4" />
                Skills to learn ({missing.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {missing.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No gaps — every required skill is already on the resume.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {missing.map((s) => (
                      <Badge key={s} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                        {s}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Coaching opportunities — pair with a recommended course
                    or a project to demonstrate each missing skill.
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {selectedJob && (
        <div className="text-xs text-muted-foreground">
          <Button asChild variant="link" className="h-auto p-0 text-xs">
            <a href={`/jobs/${(selectedJob as any).id}`}>
              <ExternalLink className="h-3 w-3 mr-1" />
              Open job
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatYears(n: number): string {
  if (n < 1) return "<1y";
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? `${r}y` : `${r.toFixed(1)}y`;
}

function formatDateRange(start: string | undefined, end: string | undefined): string {
  if (!start && !end) return "";
  const fmt = (s: string | undefined) => {
    if (!s || s.trim() === "") return "Present";
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

// Re-export the inferLevelFromYears helper here to keep the import path
// short for callers who already pull SkillNetwork in. (This is a deliberate
// barrel — the helper itself lives in shared/ so the API uses the same
// thresholds when persisting `level`.)
export { inferLevelFromYears };

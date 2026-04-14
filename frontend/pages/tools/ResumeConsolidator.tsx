import { useState, useCallback, useMemo, useEffect } from "react";
import {
  ArrowLeft,
  GitMerge,
  Loader2,
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  SkipForward,
  Plus,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import AuthOverlay from "@/components/AuthOverlay";
import { useSidebar } from "@/hooks/use-sidebar";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { resumeService } from "@/lib/services/resume-service";
import { extractTextFromFile } from "@/lib/extract-text";
import type {
  MergeAnalysis,
  MergeDecision,
  MergeResult,
} from "@/types/resume";
import MergeAnalysisView from "@/components/merge/MergeAnalysisView";

type Step = "select" | "review";

export default function ResumeConsolidator() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();

  useSEO(location.pathname);

  // Fetch resumes
  const { data: resumes = [], refetch } = useQuery({
    queryKey: ["resumes-owned"],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated,
  });

  // Step state
  const [step, setStep] = useState<Step>("select");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  // Selection
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);

  // Preserve the user's source/target picks and any uploaded filename so
  // they return to the same pre-analysis state after login. File objects
  // themselves can't be serialized; we surface a prompt to re-upload.
  const { restored, snapshot, clear } = usePendingToolInput<{
    sourceId?: string | null;
    targetId?: string | null;
    sourceFileName?: string;
  }>();

  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.sourceId) setSourceId(restored.sourceId);
    if (restored.targetId) setTargetId(restored.targetId);
    if (restored.sourceFileName && !sourceFile) {
      setError(
        `You were merging "${restored.sourceFileName}" before signing in — please re-upload it to continue.`,
      );
    }
  }, [restored, isAuthenticated, sourceFile]);

  // Analysis
  const [analysis, setAnalysis] = useState<MergeAnalysis | null>(null);
  const [sourceContent, setSourceContent] = useState<Record<string, any> | null>(null);
  const [targetContent, setTargetContent] = useState<Record<string, any> | null>(null);

  // Decisions
  const [decisions, setDecisions] = useState<MergeDecision[]>([]);
  const [newItemDecisions, setNewItemDecisions] = useState<Map<string, boolean>>(new Map());
  const [basicDecisions, setBasicDecisions] = useState<Record<string, "source" | "target">>({});

  // Execute options
  const [createNew, setCreateNew] = useState(true);
  const [newTitle, setNewTitle] = useState("");

  const getResumeLabel = useCallback((r: any) => {
    return r.Name || r.name || "Untitled Resume";
  }, []);

  const getResumeId = useCallback((r: any) => {
    return r.Id || r.id || "";
  }, []);

  const filteredResumes = useMemo(
    () => resumes.filter((r) => getResumeId(r)),
    [resumes, getResumeId],
  );

  const handleAnalyze = useCallback(async () => {
    // Soft-gate *first*: an anonymous user can have a source file but no
    // targetId (the saved-resume list is empty until they sign in), so
    // don't require targetId until after we've bounced them through login.
    if (!isAuthenticated) {
      snapshot({
        sourceId,
        targetId,
        sourceFileName: sourceFile?.name,
      });
      setShowAuthOverlay(true);
      return;
    }

    if (!targetId) return;

    setLoading(true);
    setError(null);

    try {
      if (sourceFile) {
        const result = await resumeService.analyzeFileMerge(sourceFile, targetId);
        setAnalysis(result.analysis);
        setSourceContent(result.parsedContent as Record<string, any>);
        const targetResume = filteredResumes.find((r) => getResumeId(r) === targetId);
        setTargetContent((targetResume as any)?.metaResume ?? {});
        setDecisions(buildDecisions(result.analysis));
        setNewItemDecisions(buildNewItemDecisions(result.analysis));
        setNewTitle(`${getResumeLabel(targetResume)} (merged from file)`);
      } else if (sourceId) {
        const result = await resumeService.analyzeMerge(sourceId, targetId);
        setAnalysis(result);
        const sourceResume = filteredResumes.find((r) => getResumeId(r) === sourceId);
        const targetResume = filteredResumes.find((r) => getResumeId(r) === targetId);
        setSourceContent((sourceResume as any)?.metaResume ?? {});
        setTargetContent((targetResume as any)?.metaResume ?? {});
        setDecisions(buildDecisions(result));
        setNewItemDecisions(buildNewItemDecisions(result));
        setNewTitle(`${getResumeLabel(targetResume)} (merged)`);
      }
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [targetId, sourceId, sourceFile, filteredResumes, getResumeId, getResumeLabel, isAuthenticated, snapshot]);

  const handleExecute = useCallback(async () => {
    if (!targetId || !analysis || !sourceId) return;
    setLoading(true);
    setError(null);

    try {
      const allDecisions: MergeDecision[] = [...decisions];
      for (const [key, included] of newItemDecisions) {
        if (!included) continue;
        const [sectionType, sourceIndexStr] = key.split(":");
        allDecisions.push({
          sectionType,
          sourceIndex: parseInt(sourceIndexStr),
          targetIndex: null,
          action: "add",
        });
      }

      const result: MergeResult = await resumeService.executeMerge({
        sourceResumeId: sourceId,
        targetResumeId: targetId,
        decisions: allDecisions,
        basicDecisions,
        createNew,
        newTitle: createNew ? newTitle : undefined,
      });

      toast({
        title: "Merge complete",
        description: `Merged ${result.mergedSections} sections, added ${result.newSections} new items.`,
      });

      // Reset
      setStep("select");
      setAnalysis(null);
      setSourceId(null);
      setTargetId(null);
      setSourceFile(null);
      setDecisions([]);
      clear();
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [targetId, sourceId, analysis, decisions, newItemDecisions, basicDecisions, createNew, newTitle, toast, refetch, clear]);

  // Anonymous users can't pick a target (empty saved-resume list) so
  // let them click Analyze with just a source — the soft-gate will
  // bounce them through login before the API call.
  const canAnalyze = isAuthenticated
    ? !!(targetId && (sourceId || sourceFile) && sourceId !== targetId)
    : !!(sourceId || sourceFile);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

        <div className={`pt-16 p-6 ${showAuthOverlay ? "relative" : ""}`}>
          {showAuthOverlay && (
            <AuthOverlay
              contentType="tool"
              title="Resume Consolidator"
              message="Sign in to merge your resumes — we'll keep the source and target you've picked and pick up where you left off."
            />
          )}
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center">
                  <GitMerge className="h-6 w-6 text-teal-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Resume Consolidator</h1>
                  <p className="text-muted-foreground">
                    Merge multiple resumes into one — combine bullets, deduplicate, and consolidate
                  </p>
                </div>
              </div>
              <Link to="/tools">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Tools
                </Button>
              </Link>
            </div>

            {step === "select" && (
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Target (merge into) */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-800">Target</Badge>
                      Merge Into
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      Select the resume you want to merge content <strong>into</strong>.
                    </p>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {filteredResumes.map((r) => {
                        const rid = getResumeId(r);
                        return (
                          <button
                            key={rid}
                            className={`w-full text-left flex items-center gap-2 p-3 rounded-md text-sm transition-colors ${
                              rid === targetId
                                ? "bg-blue-50 dark:bg-blue-950 border border-blue-300"
                                : "hover:bg-muted border border-transparent"
                            }`}
                            onClick={() => setTargetId(rid)}
                          >
                            {rid === targetId && <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />}
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{getResumeLabel(r)}</span>
                            {(r as any).isMaster && (
                              <Badge variant="outline" className="text-xs ml-auto shrink-0">Master</Badge>
                            )}
                          </button>
                        );
                      })}
                      {filteredResumes.length === 0 && (
                        <p className="text-sm text-muted-foreground p-3 border border-dashed rounded-md">
                          {isAuthenticated
                            ? "No resumes found. Create a resume first."
                            : "Upload a source resume below, then click Analyze — we'll prompt you to sign in and pick a target from your account."}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Source (merge from) */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-800">Source</Badge>
                      Merge From
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="resume">
                      <TabsList className="mb-3">
                        <TabsTrigger value="resume">Existing Resume</TabsTrigger>
                        <TabsTrigger value="file">Upload File</TabsTrigger>
                      </TabsList>

                      <TabsContent value="resume">
                        <p className="text-sm text-muted-foreground mb-3">
                          Select the resume to merge <strong>from</strong>.
                        </p>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {filteredResumes
                            .filter((r) => getResumeId(r) !== targetId)
                            .map((r) => {
                              const rid = getResumeId(r);
                              return (
                                <button
                                  key={rid}
                                  className={`w-full text-left flex items-center gap-2 p-3 rounded-md text-sm transition-colors ${
                                    rid === sourceId
                                      ? "bg-green-50 dark:bg-green-950 border border-green-300"
                                      : "hover:bg-muted border border-transparent"
                                  }`}
                                  onClick={() => { setSourceId(rid); setSourceFile(null); }}
                                >
                                  {rid === sourceId && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <span className="truncate">{getResumeLabel(r)}</span>
                                </button>
                              );
                            })}
                          {!isAuthenticated && (
                            <p className="text-sm text-muted-foreground p-3 border border-dashed rounded-md">
                              Sign in to pick from your saved resumes — or switch to the
                              Upload File tab to merge from a local file.
                            </p>
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="file">
                        <div
                          className="border-2 border-dashed rounded-md p-6 text-center"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files?.[0];
                            if (file) { setSourceFile(file); setSourceId(null); }
                          }}
                        >
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground mb-2">
                            Drag & drop a resume file, or click to browse
                          </p>
                          <p className="text-xs text-muted-foreground mb-3">PDF, Word (.docx), Text, Markdown, JSON</p>
                          <label>
                            <Button variant="outline" size="sm" asChild>
                              <span>Choose File</span>
                            </Button>
                            <input
                              type="file"
                              className="hidden"
                              accept=".pdf,.docx,.txt,.md,.json"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) { setSourceFile(file); setSourceId(null); }
                              }}
                            />
                          </label>
                          {sourceFile && (
                            <p className="text-sm text-green-600 mt-2">{sourceFile.name}</p>
                          )}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                {/* Analyze button */}
                <div className="lg:col-span-2">
                  {sourceId && targetId && sourceId === targetId && (
                    <Alert variant="destructive" className="mb-4">
                      <AlertDescription>Source and target must be different resumes.</AlertDescription>
                    </Alert>
                  )}
                  {error && (
                    <Alert variant="destructive" className="mb-4">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={handleAnalyze}
                    disabled={!canAnalyze || loading}
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing...</>
                    ) : (
                      <><GitMerge className="h-4 w-4 mr-2" />Analyze &amp; Compare</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {step === "review" && analysis && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Review Merge</h2>
                  <Button variant="outline" onClick={() => setStep("select")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                </div>

                {/* Summary stats */}
                <div className="flex flex-wrap gap-3 text-sm">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>{analysis.summary.autoMerge} auto-merge</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span>{analysis.summary.manualReview} review</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <SkipForward className="h-4 w-4 text-gray-400" />
                    <span>{analysis.summary.skip} skip</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Plus className="h-4 w-4 text-blue-600" />
                    <span>{analysis.summary.newItems} new</span>
                  </div>
                </div>

                {/* Merge analysis view */}
                <Card>
                  <CardContent className="p-6">
                    <MergeAnalysisView
                      analysis={analysis}
                      sourceContent={sourceContent ?? {}}
                      targetContent={targetContent ?? {}}
                      decisions={decisions}
                      onDecisionChange={(idx, d) => {
                        setDecisions((prev) => {
                          const next = [...prev];
                          next[idx] = d;
                          return next;
                        });
                      }}
                      newItemDecisions={newItemDecisions}
                      onNewItemToggle={(key) => {
                        setNewItemDecisions((prev) => {
                          const next = new Map(prev);
                          next.set(key, !next.get(key));
                          return next;
                        });
                      }}
                      basicDecisions={basicDecisions}
                      onBasicDecisionChange={(field, choice) => {
                        setBasicDecisions((prev) => ({ ...prev, [field]: choice }));
                      }}
                    />
                  </CardContent>
                </Card>

                {/* Execution options */}
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="create-new" className="text-sm">
                        Create new resume (instead of updating target)
                      </Label>
                      <Switch
                        id="create-new"
                        checked={createNew}
                        onCheckedChange={setCreateNew}
                      />
                    </div>
                    {createNew && (
                      <div>
                        <Label htmlFor="new-title" className="text-xs text-muted-foreground">
                          New resume title
                        </Label>
                        <Input
                          id="new-title"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="Merged Resume"
                          className="mt-1"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleExecute}
                  disabled={loading || !sourceId}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Merging...</>
                  ) : (
                    <><GitMerge className="h-4 w-4 mr-2" />Execute Merge</>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildDecisions(a: MergeAnalysis): MergeDecision[] {
  return a.sectionMatches.map((m) => ({
    sectionType: m.sectionType,
    sourceIndex: m.sourceIndex,
    targetIndex: m.targetIndex,
    action: m.mergeAction === "auto" ? "merge" as const : m.mergeAction === "manual" ? "merge" as const : "skip" as const,
    mergeHighlights: "combine" as const,
  }));
}

function buildNewItemDecisions(a: MergeAnalysis): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const item of a.newSections) {
    map.set(`${item.sectionType}:${item.sourceIndex}`, true);
  }
  return map;
}

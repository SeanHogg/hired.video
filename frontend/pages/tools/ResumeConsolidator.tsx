import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  Eye,
  Code,
  Download,
  Copy,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolShell } from "@/components/tools/ToolShell";
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
  Resume as FrontendResume,
  ResumeData,
} from "@/types/resume";
import MergeAnalysisView from "@/components/merge/MergeAnalysisView";
import ResumeViewer from "@/components/ResumeViewer";
import { mapContentToResumeData } from "@/lib/resume-shape";

type Step = "select" | "review" | "preview" | "result";

export default function ResumeConsolidator() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();

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
        t("errors.reuploadAfterSignIn", { name: restored.sourceFileName }),
      );
    }
  }, [restored, isAuthenticated, sourceFile, t]);

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

  // Merged resume result (rendered in the result step)
  const [mergedResume, setMergedResume] = useState<FrontendResume | null>(null);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);

  // Preview state — populated by /merge/preview, shown in the "preview" step
  const [previewContent, setPreviewContent] = useState<Record<string, any> | null>(null);
  const [previewStats, setPreviewStats] = useState<{ mergedSections: number; skippedSections: number; newSections: number } | null>(null);

  const getResumeLabel = useCallback((r: any) => {
    return r.title || t("labels.untitledResume");
  }, [t]);

  const getResumeId = useCallback((r: any) => {
    return r.id || "";
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
      // Both endpoints now return { analysis, sourceContent, targetContent }
      // in a consistent shape — the backend has already normalised both
      // sides, so the preview can render them directly without a second
      // fetch or reliance on the summary list (which has no metaResume).
      if (sourceFile) {
        const result = await resumeService.analyzeFileMerge(sourceFile, targetId);
        setAnalysis(result.analysis);
        setSourceContent(result.parsedContent as Record<string, any>);
        setTargetContent(result.targetContent as Record<string, any>);
        setDecisions(buildDecisions(result.analysis));
        setNewItemDecisions(buildNewItemDecisions(result.analysis));
        const targetResume = filteredResumes.find((r) => getResumeId(r) === targetId);
        setNewTitle(t("labels.mergedFromFileTitle", { name: getResumeLabel(targetResume) }));
      } else if (sourceId) {
        const result = await resumeService.analyzeMerge(sourceId, targetId);
        setAnalysis(result.analysis);
        setSourceContent(result.sourceContent as Record<string, any>);
        setTargetContent(result.targetContent as Record<string, any>);
        setDecisions(buildDecisions(result.analysis));
        setNewItemDecisions(buildNewItemDecisions(result.analysis));
        const targetResume = filteredResumes.find((r) => getResumeId(r) === targetId);
        setNewTitle(t("labels.mergedTitle", { name: getResumeLabel(targetResume) }));
      }
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.analysisFailed"));
    } finally {
      setLoading(false);
    }
  }, [targetId, sourceId, sourceFile, filteredResumes, getResumeId, getResumeLabel, isAuthenticated, snapshot, t]);

  /** Build the complete decision list (matches + new-item "add"s) the
   *  preview/execute endpoints expect. Shared so preview and save
   *  can't drift. */
  const buildFinalDecisions = useCallback((): MergeDecision[] => {
    const all: MergeDecision[] = [...decisions];
    for (const [key, included] of newItemDecisions) {
      if (!included) continue;
      const [sectionType, sourceIndexStr] = key.split(":");
      all.push({
        sectionType,
        sourceIndex: parseInt(sourceIndexStr),
        targetIndex: null,
        action: "add",
      });
    }
    return all;
  }, [decisions, newItemDecisions]);

  /** Run preview: compute merged content server-side without saving,
   *  then transition to the preview step where the user can inspect
   *  the rendered resume + JSON before committing. */
  const handlePreview = useCallback(async () => {
    if (!targetId || !analysis) return;
    if (!sourceId && !sourceContent) return;
    setLoading(true);
    setError(null);

    try {
      const preview = await resumeService.previewMerge({
        ...(sourceId ? { sourceResumeId: sourceId } : { sourceContent: sourceContent ?? {} }),
        targetResumeId: targetId,
        decisions: buildFinalDecisions(),
        basicDecisions,
        createNew,
        newTitle: createNew ? newTitle : undefined,
      });
      setPreviewContent(preview.mergedContent as Record<string, any>);
      setPreviewStats(preview.stats);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.previewFailed"));
    } finally {
      setLoading(false);
    }
  }, [targetId, sourceId, sourceContent, analysis, basicDecisions, createNew, newTitle, buildFinalDecisions, t]);

  const handleExecute = useCallback(async () => {
    if (!targetId || !analysis) return;
    if (!sourceId && !sourceContent) return;
    setLoading(true);
    setError(null);

    try {
      const result: MergeResult = await resumeService.executeMerge({
        ...(sourceId ? { sourceResumeId: sourceId } : { sourceContent: sourceContent ?? {} }),
        targetResumeId: targetId,
        decisions: buildFinalDecisions(),
        basicDecisions,
        createNew,
        newTitle: createNew ? newTitle : undefined,
      });

      toast({
        title: t("messages.mergeCompleteTitle"),
        description: t("messages.mergeCompleteDesc", {
          merged: result.mergedSections,
          added: result.newSections,
        }),
      });

      try {
        const merged = await resumeService.getResumeById(result.resumeId);
        setMergedResume(merged);
      } catch {
        // Non-fatal — user can still navigate to the resume manually
      }
      setMergeResult(result);
      setStep("result");
      clear();
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.mergeFailed"));
    } finally {
      setLoading(false);
    }
  }, [targetId, sourceId, sourceContent, analysis, basicDecisions, createNew, newTitle, toast, refetch, clear, buildFinalDecisions, t]);

  const handleStartOver = useCallback(() => {
    setStep("select");
    setAnalysis(null);
    setSourceId(null);
    setTargetId(null);
    setSourceFile(null);
    setSourceContent(null);
    setTargetContent(null);
    setDecisions([]);
    setNewItemDecisions(new Map());
    setBasicDecisions({});
    setMergedResume(null);
    setMergeResult(null);
    setPreviewContent(null);
    setPreviewStats(null);
    setError(null);
  }, []);

  // Anonymous users can't pick a target (empty saved-resume list) so
  // let them click Analyze with just a source — the soft-gate will
  // bounce them through login before the API call.
  const canAnalyze = isAuthenticated
    ? !!(targetId && (sourceId || sourceFile) && sourceId !== targetId)
    : !!(sourceId || sourceFile);

  return (
    <ToolShell
      toolId="resume-consolidator"
      header={{
        icon: <GitMerge className="h-6 w-6 text-teal-600" />,
        iconBgClassName: "bg-teal-100 dark:bg-teal-900/30",
        title: t("tools.resumeConsolidator.title"),
        description: t("tools.resumeConsolidator.subtitle"),
      }}
      authOverlay={{
        show: showAuthOverlay,
        message: t("messages.signInToMergeResumes"),
      }}
    >
            {step === "select" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Target (merge into) */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-800">{t("labels.target")}</Badge>
                      {t("labels.mergeInto")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      {t("messages.selectResumeToMergeInto")}
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
                              <Badge variant="outline" className="text-xs ml-auto shrink-0">{t("labels.master")}</Badge>
                            )}
                          </button>
                        );
                      })}
                      {filteredResumes.length === 0 && (
                        <p className="text-sm text-muted-foreground p-3 border border-dashed rounded-md">
                          {isAuthenticated
                            ? t("messages.noResumesFoundCreateFirst")
                            : t("messages.uploadSourceThenSignInForTarget")}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Source (merge from) */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-800">{t("labels.mergeSourceBadge")}</Badge>
                      {t("labels.mergeFrom")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="resume">
                      <TabsList className="mb-3">
                        <TabsTrigger value="resume">{t("labels.existingResume")}</TabsTrigger>
                        <TabsTrigger value="file">{t("labels.uploadFile")}</TabsTrigger>
                      </TabsList>

                      <TabsContent value="resume">
                        <p className="text-sm text-muted-foreground mb-3">
                          {t("messages.selectResumeToMergeFrom")}
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
                              {t("messages.signInOrSwitchToUploadTab")}
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
                            {t("messages.dragDropResumeOrBrowse")}
                          </p>
                          <p className="text-xs text-muted-foreground mb-3">{t("messages.supportedResumeFormats")}</p>
                          <label>
                            <Button variant="outline" size="sm" asChild>
                              <span>{t("actions.chooseFile")}</span>
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
                      <AlertDescription>{t("errors.sourceAndTargetMustDiffer")}</AlertDescription>
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
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("status.analyzing")}</>
                    ) : (
                      <><GitMerge className="h-4 w-4 mr-2" />{t("actions.analyzeAndCompare")}</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {step === "review" && analysis && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">{t("headings.reviewMerge")}</h2>
                  <Button variant="outline" onClick={() => setStep("select")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t("actions.back")}
                  </Button>
                </div>

                {/* Summary stats */}
                <div className="flex flex-wrap gap-3 text-sm">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>{t("labels.mergeAutoMergeCount", { count: analysis.summary.autoMerge })}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span>{t("labels.mergeReviewCount", { count: analysis.summary.manualReview })}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <SkipForward className="h-4 w-4 text-gray-400" />
                    <span>{t("labels.mergeSkipCount", { count: analysis.summary.skip })}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Plus className="h-4 w-4 text-blue-600" />
                    <span>{t("labels.mergeNewCount", { count: analysis.summary.newItems })}</span>
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

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  size="lg"
                  className="w-full"
                  onClick={handlePreview}
                  disabled={loading || (!sourceId && !sourceContent)}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("status.buildingPreview")}</>
                  ) : (
                    <><Eye className="h-4 w-4 mr-2" />{t("headings.previewMergedResume")}</>
                  )}
                </Button>
              </div>
            )}

            {step === "preview" && previewContent && (
              <PreviewStep
                previewContent={previewContent}
                sourceContent={sourceContent ?? {}}
                targetContent={targetContent ?? {}}
                previewStats={previewStats}
                createNew={createNew}
                setCreateNew={setCreateNew}
                newTitle={newTitle}
                setNewTitle={setNewTitle}
                loading={loading}
                error={error}
                onBack={() => setStep("review")}
                onConfirm={handleExecute}
              />
            )}

            {step === "result" && mergeResult && (
              <div className="space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <div>
                      <h2 className="text-xl font-semibold">{t("headings.mergeComplete")}</h2>
                      <p className="text-sm text-muted-foreground">
                        {t("messages.mergedSectionsCount", { count: mergeResult.mergedSections })}
                        {mergeResult.newSections > 0 && t("messages.addedItemsSuffix", { count: mergeResult.newSections })}
                        {mergeResult.skippedSections > 0 && t("messages.skippedSectionsSuffix", { count: mergeResult.skippedSections })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleStartOver}>
                      <GitMerge className="h-4 w-4 mr-2" />
                      {t("actions.mergeAnother")}
                    </Button>
                    <Link to={`/resumes/${mergeResult.resumeId}`}>
                      <Button size="sm">
                        {t("actions.openInResumeBuilder")}
                      </Button>
                    </Link>
                  </div>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {mergeResult.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {mergedResume ? (
                      <ResumeViewer
                        resume={mergedResume}
                        onUpdate={() => {}}
                        canEdit={false}
                        showToolbar={false}
                      />
                    ) : (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">{t("status.loadingMergedResume")}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
    </ToolShell>
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
    // Cross-section conflicts default to NOT included — they're almost
    // always parser misclassifications. User can opt them in.
    map.set(`${item.sectionType}:${item.sourceIndex}`, !item.crossSectionConflict);
  }
  return map;
}

// ── PreviewStep ──────────────────────────────────────────────────────────────
// Shows the merged resume server-computed output via /merge/preview in two
// views: a rendered ResumeViewer and the raw JSON. User confirms here to
// trigger /merge/execute and actually persist the result.

interface PreviewStepProps {
  previewContent: Record<string, any>;
  sourceContent: Record<string, any>;
  targetContent: Record<string, any>;
  previewStats: { mergedSections: number; skippedSections: number; newSections: number } | null;
  createNew: boolean;
  setCreateNew: (v: boolean) => void;
  newTitle: string;
  setNewTitle: (v: string) => void;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}

type PreviewTab = "preview" | "merged" | "source" | "target";

function PreviewStep({
  previewContent,
  sourceContent,
  targetContent,
  previewStats,
  createNew,
  setCreateNew,
  newTitle,
  setNewTitle,
  loading,
  error,
  onBack,
  onConfirm,
}: PreviewStepProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PreviewTab>("preview");
  const [copied, setCopied] = useState<PreviewTab | null>(null);

  // Shape-coerce the lowercase JSON Resume into the PascalCase ResumeData
  // ResumeViewer expects.
  const resumeForViewer: FrontendResume = useMemo(
    () => ({
      id: "preview",
      userId: "",
      title: newTitle || t("labels.mergedResumeFallback"),
      slug: "preview",
      status: "draft",
      privacy: "private",
      isMaster: false,
      isActive: false,
      parentId: null,
      diffPercent: null,
      templateId: null,
      metaResumeId: null,
      sentimentScore: null,
      scores: null,
      viewCount: 0,
      isOwner: false,
      isWatched: false,
      content: mapContentToResumeData(previewContent),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [previewContent, newTitle, t],
  );

  // Pre-stringify each JSON view — memoised so switching tabs doesn't
  // reformat on every render.
  const mergedJson = useMemo(() => JSON.stringify(previewContent, null, 2), [previewContent]);
  const sourceJson = useMemo(() => JSON.stringify(sourceContent, null, 2), [sourceContent]);
  const targetJson = useMemo(() => JSON.stringify(targetContent, null, 2), [targetContent]);

  const handleCopy = useCallback(async (which: PreviewTab, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  }, []);

  const handleDownload = useCallback((filename: string, text: string) => {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename.replace(/[^\w.-]+/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t("headings.previewMergedResume")}</h2>
          {previewStats && (
            <p className="text-sm text-muted-foreground">
              {t("messages.previewStatsMerged", { count: previewStats.mergedSections })}
              {previewStats.newSections > 0 && t("messages.previewStatsAddedSuffix", { count: previewStats.newSections })}
              {previewStats.skippedSections > 0 && t("messages.previewStatsSkippedSuffix", { count: previewStats.skippedSections })}
              {t("messages.previewNothingSavedSuffix")}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onBack} disabled={loading}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("actions.backToReview")}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as PreviewTab)}>
        <TabsList>
          <TabsTrigger value="preview">
            <Eye className="h-4 w-4 mr-2" />
            {t("labels.rendered")}
          </TabsTrigger>
          <TabsTrigger value="merged">
            <Code className="h-4 w-4 mr-2" />
            {t("labels.mergedJson")}
          </TabsTrigger>
          <TabsTrigger value="source">
            <Code className="h-4 w-4 mr-2" />
            {t("labels.sourceJson")}
          </TabsTrigger>
          <TabsTrigger value="target">
            <Code className="h-4 w-4 mr-2" />
            {t("labels.targetJson")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <ResumeViewer
                resume={resumeForViewer}
                onUpdate={() => {}}
                canEdit={false}
                showToolbar={false}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="merged" className="mt-4">
          <JsonPanel
            title={t("labels.jsonPanelMergedTitle")}
            json={mergedJson}
            isCopied={copied === "merged"}
            onCopy={() => handleCopy("merged", mergedJson)}
            onDownload={() => handleDownload(newTitle || "merged-resume", mergedJson)}
          />
        </TabsContent>

        <TabsContent value="source" className="mt-4">
          <JsonPanel
            title={t("labels.jsonPanelSourceTitle")}
            json={sourceJson}
            isCopied={copied === "source"}
            onCopy={() => handleCopy("source", sourceJson)}
            onDownload={() => handleDownload("source-resume", sourceJson)}
          />
        </TabsContent>

        <TabsContent value="target" className="mt-4">
          <JsonPanel
            title={t("labels.jsonPanelTargetTitle")}
            json={targetJson}
            isCopied={copied === "target"}
            onCopy={() => handleCopy("target", targetJson)}
            onDownload={() => handleDownload("target-resume", targetJson)}
          />
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="create-new" className="text-sm">
              {t("labels.saveAsNewResumeLabel")}
            </Label>
            <Switch id="create-new" checked={createNew} onCheckedChange={setCreateNew} />
          </div>
          {createNew && (
            <div>
              <Label htmlFor="new-title" className="text-xs text-muted-foreground">
                {t("fields.newResumeTitle.label")}
              </Label>
              <Input
                id="new-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t("labels.mergedResumeFallback")}
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

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack} disabled={loading}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("actions.back")}
        </Button>
        <Button size="lg" className="flex-1" onClick={onConfirm} disabled={loading}>
          {loading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("status.saving")}</>
          ) : createNew ? (
            <><GitMerge className="h-4 w-4 mr-2" />{t("actions.saveAsNewResume")}</>
          ) : (
            <><GitMerge className="h-4 w-4 mr-2" />{t("actions.updateTargetResume")}</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── JsonPanel ────────────────────────────────────────────────────────────────
// Reusable JSON viewer with copy + download. Used for source, target, and
// merged previews so the three share identical styling and controls.

interface JsonPanelProps {
  title: string;
  json: string;
  isCopied: boolean;
  onCopy: () => void;
  onDownload: () => void;
}

function JsonPanel({ title, json, isCopied, onCopy, onDownload }: JsonPanelProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCopy}>
            {isCopied ? (
              <><CheckCircle2 className="h-4 w-4 mr-2" />{t("labels.copied")}</>
            ) : (
              <><Copy className="h-4 w-4 mr-2" />{t("actions.copy")}</>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download className="h-4 w-4 mr-2" />
            {t("actions.download")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="bg-muted/40 border rounded-md p-4 overflow-auto max-h-[600px] text-xs font-mono whitespace-pre">
          {json}
        </pre>
      </CardContent>
    </Card>
  );
}


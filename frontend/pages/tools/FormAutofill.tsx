import { useState } from "react";
import {
  ClipboardPaste,
  Loader2,
  FileText,
  Copy,
  CheckCircle2,
  Save,
  Link2,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ToolShell } from "@/components/tools/ToolShell";
import ResumeSelectItem from "@/components/tools/ResumeSelectItem";
import { useAuth } from "@/lib/auth";
import { resumeService } from "@/lib/services/resume-service";
import { autofillService } from "@/lib/services/autofill-service";
import { appendDiagnosticReference } from "@/lib/llm-diagnostic";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { FormField, FieldAnswer } from "@shared/autofill";

type InputMode = "url" | "questions";

export default function FormAutofill() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();

  // Input state
  const [inputMode, setInputMode] = useState<InputMode>("questions");
  const [formUrl, setFormUrl] = useState("");
  const [rawQuestions, setRawQuestions] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [customInstructions, setCustomInstructions] = useState("");

  // Process state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  // Results state
  const [fields, setFields] = useState<FormField[]>([]);
  const [answers, setAnswers] = useState<FieldAnswer[]>([]);
  const [editedAnswers, setEditedAnswers] = useState<Record<string, string>>(
    {}
  );
  const [atsProvider, setAtsProvider] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch user's resumes
  const { data: resumes, isLoading: resumesLoading } = useQuery({
    queryKey: ["resumes", user?.id],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated && !!user?.id,
  });

  // Analyze form
  const handleAnalyze = async () => {
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    if (inputMode === "url" && !formUrl.trim()) {
      setError(t("errors.enterFormUrl"));
      return;
    }
    if (inputMode === "questions" && !rawQuestions.trim()) {
      setError(t("errors.pasteApplicationQuestions"));
      return;
    }

    setError(null);
    setIsAnalyzing(true);
    setFields([]);
    setAnswers([]);
    setEditedAnswers({});

    try {
      const data =
        inputMode === "url"
          ? { url: formUrl.trim() }
          : {
              questions: rawQuestions
                .split("\n")
                .map((q) => q.trim())
                .filter(Boolean),
            };

      const result = await autofillService.analyzeForm(data);
      setFields(result.fields || []);
      setAtsProvider(result.atsProvider || null);
      setFormTitle(result.formTitle || null);

      if (!result.fields?.length) {
        setError(t("errors.noFormFieldsDetected"));
      }
    } catch (err: any) {
      setError(appendDiagnosticReference(err?.message || t("errors.analyzeFormFailed"), err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Generate answers
  const handleGenerate = async () => {
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    if (!fields.length) {
      setError(t("errors.analyzeFormFirst"));
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const result = await autofillService.generateAnswers({
        fields,
        jobId: selectedJobId || undefined,
        jobDescription: jobDescription || undefined,
        resumeId: selectedResumeId || undefined,
        customInstructions: customInstructions || undefined,
      });

      setAnswers(result.answers || []);

      // Initialize edited answers map
      const edited: Record<string, string> = {};
      for (const a of result.answers || []) {
        edited[a.fieldId] = a.answer;
      }
      setEditedAnswers(edited);

      if (!result.answers?.length) {
        setError(
          t("errors.noAnswersGenerated")
        );
      }
    } catch (err: any) {
      setError(appendDiagnosticReference(err?.message || t("errors.generateAnswersFailed"), err));
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy all answers
  const handleCopy = async () => {
    const lines = answers.map((a) => {
      const field = fields.find((f) => f.id === a.fieldId);
      const label = field?.label || a.fieldId;
      const answer = editedAnswers[a.fieldId] ?? a.answer;
      return `${label}: ${answer}`;
    });
    await navigator.clipboard.writeText(lines.join("\n\n"));
    setCopied(true);
    toast.success(t("messages.allAnswersCopied"));
    setTimeout(() => setCopied(false), 2000);
  };

  // Save submission
  const handleSave = async () => {
    if (!isAuthenticated) return;

    setIsSaving(true);
    try {
      await autofillService.saveSubmission({
        fields,
        answers: editedAnswers,
        sourceUrl: formUrl || undefined,
        jobId: selectedJobId || undefined,
        atsProvider: atsProvider || undefined,
        jobDescription: jobDescription || undefined,
        status: "submitted",
      });
      toast.success(t("messages.applicationAnswersSaved"));
    } catch (err: any) {
      toast.error(err?.message || t("errors.saveAnswersFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  // Confidence badge color
  const confidenceColor = (c: string) => {
    if (c === "high") return "bg-green-100 text-green-800";
    if (c === "medium") return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  // Source badge
  const sourceLabel = (s: string) => {
    const map: Record<string, string> = {
      profile: t("labels.formAutofillSource.profile"),
      resume: t("labels.formAutofillSource.resume"),
      ai: t("labels.formAutofillSource.ai"),
      cache: t("labels.formAutofillSource.cache"),
    };
    return map[s] || s;
  };

  return (
    <ToolShell
      toolId="form-autofill"
      header={{
        icon: <ClipboardPaste className="h-6 w-6 text-brand-purple" />,
        iconBgClassName: "bg-brand-purple/10",
        title: t("tools.formAutofill.heading"),
        description: t("tools.formAutofill.subtitle"),
      }}
      authOverlay={{
        show: showAuthOverlay,
        title: t("tools.formAutofill.heading"),
        message: t("messages.signInToAutofill"),
      }}
      breadcrumbLabel={t("tools.formAutofill.title")}
    >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Input Section */}
              <div className="space-y-6">
                {/* Input Mode */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {t("headings.applicationForm")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Mode toggle */}
                    <div className="flex gap-2">
                      <Button
                        variant={
                          inputMode === "questions" ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setInputMode("questions")}
                      >
                        {t("actions.pasteQuestions")}
                      </Button>
                      <Button
                        variant={inputMode === "url" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setInputMode("url")}
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        {t("actions.fromUrl")}
                      </Button>
                    </div>

                    {inputMode === "url" ? (
                      <div className="space-y-2">
                        <Label htmlFor="form-url">{t("tools.formAutofill.formUrlLabel")}</Label>
                        <Input
                          id="form-url"
                          type="url"
                          placeholder="https://boards.greenhouse.io/company/jobs/12345"
                          value={formUrl}
                          onChange={(e) => setFormUrl(e.target.value)}
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="raw-questions">
                          {t("tools.formAutofill.questionsLabel")}
                        </Label>
                        <Textarea
                          id="raw-questions"
                          placeholder={t("tools.formAutofill.questionsPlaceholder")}
                          rows={8}
                          value={rawQuestions}
                          onChange={(e) => setRawQuestions(e.target.value)}
                        />
                      </div>
                    )}

                    <Button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className="w-full"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t("status.analyzing")}
                        </>
                      ) : (
                        t("actions.analyzeForm")
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* Job Context (optional) */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {t("headings.jobContextOptional")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="job-desc">{t("tools.formAutofill.jobDescLabel")}</Label>
                      <Textarea
                        id="job-desc"
                        placeholder={t("tools.formAutofill.jobDescPlaceholder")}
                        rows={4}
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                      />
                    </div>

                    {isAuthenticated && (
                      <div className="space-y-2">
                        <Label htmlFor="resume-select">{t("labels.resume")}</Label>
                        <Select
                          value={selectedResumeId}
                          onValueChange={setSelectedResumeId}
                          disabled={resumesLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("tools.formAutofill.useActiveResume")} />
                          </SelectTrigger>
                          <SelectContent>
                            {resumes
                              ?.filter((r) => r.id || r.id)
                              .map((r) => (
                                <ResumeSelectItem
                                  key={(r.id || r.id)!}
                                  resume={r as any}
                                />
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="custom-instructions">
                        {t("tools.formAutofill.customInstructionsLabel")}
                      </Label>
                      <Input
                        id="custom-instructions"
                        placeholder={t("tools.formAutofill.customInstructionsPlaceholder")}
                        value={customInstructions}
                        onChange={(e) => setCustomInstructions(e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right: Results Section */}
              <div className="space-y-6">
                {/* Extracted Fields */}
                {fields.length > 0 && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          {t("headings.detectedFields")}
                          <Badge variant="secondary">{fields.length}</Badge>
                          {atsProvider && (
                            <Badge variant="outline">
                              {atsProvider.charAt(0).toUpperCase() +
                                atsProvider.slice(1)}
                            </Badge>
                          )}
                        </CardTitle>
                        <Button
                          size="sm"
                          onClick={handleGenerate}
                          disabled={isGenerating}
                        >
                          {isGenerating ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              {t("status.generating")}
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-1" />
                              {t("actions.generateAnswers")}
                            </>
                          )}
                        </Button>
                      </div>
                      {formTitle && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {formTitle}
                        </p>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                        {fields.map((field) => {
                          const answer = answers.find(
                            (a) => a.fieldId === field.id
                          );
                          return (
                            <div
                              key={field.id}
                              className="border rounded-lg p-3 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium">
                                  {field.label}
                                  {field.required && (
                                    <span className="text-red-500 ml-1">*</span>
                                  )}
                                </Label>
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-xs">
                                    {field.type}
                                  </Badge>
                                  {field.category && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {field.category}
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {answer ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1 mb-1">
                                    <Badge
                                      className={`text-xs ${confidenceColor(answer.confidence)}`}
                                    >
                                      {answer.confidence}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {sourceLabel(answer.source)}
                                    </Badge>
                                  </div>
                                  {field.type === "textarea" ? (
                                    <Textarea
                                      value={
                                        editedAnswers[field.id] ?? answer.answer
                                      }
                                      onChange={(e) =>
                                        setEditedAnswers((prev) => ({
                                          ...prev,
                                          [field.id]: e.target.value,
                                        }))
                                      }
                                      rows={3}
                                      className="text-sm"
                                    />
                                  ) : field.type === "select" &&
                                    field.options?.length ? (
                                    <Select
                                      value={
                                        editedAnswers[field.id] ?? answer.answer
                                      }
                                      onValueChange={(v) =>
                                        setEditedAnswers((prev) => ({
                                          ...prev,
                                          [field.id]: v,
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="text-sm">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {field.options.map((opt) => (
                                          <SelectItem key={opt} value={opt}>
                                            {opt}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Input
                                      value={
                                        editedAnswers[field.id] ?? answer.answer
                                      }
                                      onChange={(e) =>
                                        setEditedAnswers((prev) => ({
                                          ...prev,
                                          [field.id]: e.target.value,
                                        }))
                                      }
                                      className="text-sm"
                                    />
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground italic">
                                  {field.type === "file"
                                    ? t("messages.fileUploadManualAction")
                                    : t("messages.clickGenerateAnswersToFill")}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Actions */}
                {answers.length > 0 && (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={handleCopy}
                          className="flex-1"
                        >
                          {copied ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              {t("labels.copiedExclaim")}
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4 mr-2" />
                              {t("actions.copyAll")}
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={handleSave}
                          disabled={isSaving}
                          className="flex-1"
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          {t("actions.saveToHistory")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Error */}
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
    </ToolShell>
  );
}

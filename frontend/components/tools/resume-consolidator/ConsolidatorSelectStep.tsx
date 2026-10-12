// /tools/resume-consolidator: pick the target résumé (merge into — the
// master by default) and the source (a saved résumé or a file), then
// continue in the kit workspace, where the merge is reviewed on the page.
// Presentational — state lives in useConsolidatorHandoff.

import { GitMerge, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ResumeSummary } from "@/lib/services/resume-service";
import { ResumePickButton } from "./ResumePickButton";

interface ConsolidatorSelectStepProps {
  isAuthenticated: boolean;
  resumes: ResumeSummary[];
  getResumeLabel: (r: any) => string;
  targetId: string | null;
  onTargetChange: (id: string) => void;
  sourceId: string | null;
  onSourceResumeChange: (id: string) => void;
  sourceFile: File | null;
  onSourceFileChange: (file: File) => void;
  error: string | null;
  canContinue: boolean;
  onContinue: () => void;
}

export function ConsolidatorSelectStep({
  isAuthenticated,
  resumes,
  getResumeLabel,
  targetId,
  onTargetChange,
  sourceId,
  onSourceResumeChange,
  sourceFile,
  onSourceFileChange,
  error,
  canContinue,
  onContinue,
}: ConsolidatorSelectStepProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Target (merge into) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Badge className="bg-accent text-accent-foreground">{t("labels.target")}</Badge>
            {t("labels.mergeInto")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            {t("messages.selectResumeToMergeInto")}
          </p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {resumes.map((r) => {
              const rid = r.id;
              return (
                <ResumePickButton
                  key={rid}
                  tone="target"
                  selected={rid === targetId}
                  label={getResumeLabel(r)}
                  onClick={() => onTargetChange(rid)}
                  trailing={
                    (r as any).isMaster && (
                      <Badge variant="outline" className="text-xs ml-auto shrink-0">{t("labels.master")}</Badge>
                    )
                  }
                />
              );
            })}
            {resumes.length === 0 && (
              <p className="text-sm text-muted-foreground p-3 border border-dashed border-border rounded-xl">
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
            <Badge className="bg-brand-green/15 text-brand-green-text">{t("labels.mergeSourceBadge")}</Badge>
            {t("labels.mergeFrom")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="resume">
            <TabsList className="mb-3 h-auto">
              <TabsTrigger value="resume" className="min-h-11">{t("labels.existingResume")}</TabsTrigger>
              <TabsTrigger value="file" className="min-h-11">{t("labels.uploadFile")}</TabsTrigger>
            </TabsList>

            <TabsContent value="resume">
              <p className="text-sm text-muted-foreground mb-3">
                {t("messages.selectResumeToMergeFrom")}
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {resumes
                  .filter((r) => r.id !== targetId)
                  .map((r) => {
                    const rid = r.id;
                    return (
                      <ResumePickButton
                        key={rid}
                        tone="source"
                        selected={rid === sourceId}
                        label={getResumeLabel(r)}
                        onClick={() => onSourceResumeChange(rid)}
                      />
                    );
                  })}
                {!isAuthenticated && (
                  <p className="text-sm text-muted-foreground p-3 border border-dashed border-border rounded-xl">
                    {t("messages.signInOrSwitchToUploadTab")}
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="file">
              <div
                className="border-2 border-dashed border-border bg-muted/40 rounded-xl p-6 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) onSourceFileChange(file);
                }}
              >
                <Upload aria-hidden="true" className="h-8 w-8 mx-auto text-primary mb-2" />
                <p className="text-sm text-muted-foreground mb-2">
                  {t("messages.dragDropResumeOrBrowse")}
                </p>
                <p className="text-xs text-muted-foreground mb-3">{t("messages.supportedResumeFormats")}</p>
                <label>
                  <Button variant="outline" size="sm" className="min-h-11 cursor-pointer" asChild>
                    <span>{t("actions.chooseFile")}</span>
                  </Button>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.txt,.md,.json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onSourceFileChange(file);
                    }}
                  />
                </label>
                {sourceFile && (
                  <p className="text-sm text-brand-green-text mt-2">{sourceFile.name}</p>
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
        <Button size="lg" className="w-full" onClick={onContinue} disabled={!canContinue}>
          <GitMerge aria-hidden="true" className="h-4 w-4 mr-2" />
          {t("review.handoff.reviewMerge")}
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">{t("review.handoff.mergeHint")}</p>
      </div>
    </div>
  );
}

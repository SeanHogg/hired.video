// /tools/resume-tailor — an entry point into the kit workspace: pick the job (paste,
// a text file, or a tracked job) and the résumé to start from (★ master by
// default), then tailor it — or create a new version for the job — in the
// builder, where every change is reviewed on the page before anything is
// saved. State: components/tools/resume-tailor/useTailorHandoff.

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Briefcase, FileText, Sparkles, Upload, Wand2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import ResumeSelectItem from "@/components/tools/ResumeSelectItem";
import { ToolShell } from "@/components/tools/ToolShell";
import { useTailorHandoff, type JobSource } from "@/components/tools/resume-tailor/useTailorHandoff";

export default function ResumeTailor() {
  const { t } = useTranslation();
  const h = useTailorHandoff();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <ToolShell
      toolId="resume-tailor"
      header={{
        icon: <Sparkles className="h-6 w-6" />,
        title: t("tools.resumeTailor.headerTitle"),
        description: t("tools.resumeTailor.headerDescription"),
      }}
      authOverlay={{ show: h.showAuthOverlay, message: t("tools.resumeTailor.authMessage") }}
    >
      <Card className="mx-auto w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" aria-hidden="true" />
            {t("headings.jobDescription")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="resume-select">{t("labels.selectYourResume")}</Label>
            {h.isAuthenticated ? (
              <Select value={h.selectedResumeId} onValueChange={h.setSelectedResumeId} disabled={h.resumesLoading}>
                <SelectTrigger id="resume-select">
                  <SelectValue placeholder={t("tools.resumeTailor.selectResumePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {h.resumes
                    .filter((r) => r.id)
                    .map((r) => (
                      <ResumeSelectItem key={r.id as string} resume={r as never} />
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{t("tools.resumeTailor.pasteSignInHint")}</p>
            )}
          </div>

          <Tabs value={h.jobSource} onValueChange={(v) => h.setJobSource(v as JobSource)}>
            <TabsList className="grid h-auto w-full grid-cols-3">
              <TabsTrigger value="paste" className="min-h-11">
                <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("tools.resumeTailor.tabPaste")}
              </TabsTrigger>
              <TabsTrigger value="upload" className="min-h-11">
                <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("tools.resumeTailor.tabUpload")}
              </TabsTrigger>
              <TabsTrigger value="saved" className="min-h-11" disabled={!h.isAuthenticated}>
                <Briefcase className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("tools.resumeTailor.tabSaved")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="paste" className="mt-4 space-y-2">
              <Label htmlFor="job-description">{t("tools.resumeTailor.pasteLabel")}</Label>
              <Textarea
                id="job-description"
                placeholder={t("tools.resumeTailor.pastePlaceholder")}
                value={h.jobDescription}
                onChange={(e) => h.setJobDescription(e.target.value)}
                rows={12}
                className="resize-none"
              />
            </TabsContent>

            <TabsContent value="upload" className="mt-4 space-y-2">
              <Label>{t("tools.resumeTailor.uploadLabel")}</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.html,.htm,.json,text/plain,text/markdown,text/html,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void h.readFile(f);
                  e.target.value = "";
                }}
              />
              <div className="space-y-3 rounded-md border border-dashed p-6 text-center">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
                <div className="text-sm text-muted-foreground">{t("messages.dropTextFileOrClick")}</div>
                <Button variant="outline" size="sm" className="min-h-11" onClick={() => fileInputRef.current?.click()}>
                  {t("actions.chooseFile")}
                </Button>
                {h.uploadedFileName && (
                  <div className="text-xs text-brand-green-text">
                    {t("tools.resumeTailor.loadedPrefix")} <span className="font-mono">{h.uploadedFileName}</span>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="saved" className="mt-4 space-y-2">
              <Label htmlFor="saved-job-select">{t("tools.resumeTailor.pickTrackedJob")}</Label>
              <Select value={h.selectedJobId} onValueChange={h.setSelectedJobId} disabled={h.savedJobsLoading}>
                <SelectTrigger id="saved-job-select">
                  <SelectValue
                    placeholder={
                      h.savedJobsLoading
                        ? t("tools.resumeTailor.loadingJobs")
                        : h.savedJobs.length > 0
                          ? t("tools.resumeTailor.selectSavedJob")
                          : t("tools.resumeTailor.noSavedJobs")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {h.savedJobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.title}
                      {job.company ? ` — ${job.company}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TabsContent>
          </Tabs>

          {h.error && (
            <Alert variant="destructive">
              <AlertDescription>{h.error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="min-h-11 flex-1" onClick={() => h.handOff(false)} disabled={!h.canContinue}>
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("review.handoff.tailor")}
            </Button>
            <Button variant="outline" className="min-h-11 flex-1" onClick={() => h.handOff(true)} disabled={!h.canContinue}>
              <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("review.handoff.create")}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">{t("review.handoff.tailorHint")}</p>
        </CardContent>
      </Card>
    </ToolShell>
  );
}

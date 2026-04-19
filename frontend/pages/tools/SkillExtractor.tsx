import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Briefcase, FileText, Loader2, Sparkles, Upload } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Footer from "@/components/Footer";
import ToolFooterSEO from "@/components/ToolFooterSEO";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import AuthOverlay from "@/components/AuthOverlay";
import { ToolTierBadge } from "@/components/ToolTierBadge";
import {
  SkillExtractionResults,
  type SkillExtractionResult,
  type SkillSourceType,
} from "@/components/SkillExtractionResults";
import { useSidebar } from "@/hooks/use-sidebar";
import { usePendingToolInput } from "@/hooks/use-pending-tool-input";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import { extractTextFromFile } from "@/lib/extract-text";
import { resumeService } from "@/lib/services/resume-service";
import { jobService } from "@/lib/services/job-service";

export default function SkillExtractor() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated } = useAuth();

  useSEO(location.pathname);
  useBreadcrumbs([
    { name: "Tools", url: "/tools" },
    { name: "Skill Extractor", url: "/tools/skill-extractor" },
  ]);

  const [sourceType, setSourceType] = useState<SkillSourceType>("job");
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [savedSearch, setSavedSearch] = useState("");
  const [result, setResult] = useState<SkillExtractionResult | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  const { restored, snapshot, clear } = usePendingToolInput<{
    sourceType?: SkillSourceType;
    pastedText?: string;
    selectedResumeId?: string;
    selectedJobId?: string;
  }>();

  useEffect(() => {
    if (!restored || !isAuthenticated) return;
    if (restored.sourceType) setSourceType(restored.sourceType);
    if (restored.pastedText) setPastedText(restored.pastedText);
    if (restored.selectedResumeId) setSelectedResumeId(restored.selectedResumeId);
    if (restored.selectedJobId) setSelectedJobId(restored.selectedJobId);
  }, [restored, isAuthenticated]);

  // Saved items — fetched lazily per source type so we only hit the endpoint
  // the user actually needs.
  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated && sourceType === "resume",
  });
  const { data: userJobs = [] } = useQuery({
    queryKey: ["user-jobs"],
    queryFn: () => jobService.getUserJobs(),
    enabled: isAuthenticated && sourceType === "job",
  });

  // Filter the saved list by the user's search query. The dropdown stays
  // usable when a user has hundreds of resumes or jobs.
  const filteredResumes = useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    const list = resumes.filter((r) => (r.Id || r.id));
    if (!q) return list;
    return list.filter((r) => {
      const name = String(r.Name || r.name || "").toLowerCase();
      return name.includes(q);
    });
  }, [resumes, savedSearch]);

  const filteredJobs = useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    if (!q) return userJobs;
    return userJobs.filter((j) => {
      const haystack = `${j.title ?? ""} ${j.company ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [userJobs, savedSearch]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "application/json",
      "application/ld+json",
    ];
    if (!allowedTypes.includes(selected.type)) {
      setError("Please upload a PDF, Word, Markdown, JSON, or text file.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB.");
      return;
    }
    setFile(selected);
    setError(null);
    setResult(null);
  };

  const runExtraction = async (content: string) => {
    if (!content.trim()) {
      throw new Error("No content to analyze.");
    }
    const response = await apiClient.post<SkillExtractionResult>(
      "/api/skillextractor/extract",
      { content, sourceType },
    );
    return response.data;
  };

  const handleTextExtraction = async () => {
    if (!pastedText.trim()) {
      setError(`Please paste ${sourceType === "job" ? "a job description" : "your resume"}.`);
      return;
    }

    if (!isAuthenticated) {
      snapshot({ sourceType, pastedText });
      setShowAuthOverlay(true);
      return;
    }

    setIsExtracting(true);
    setError(null);
    setResult(null);

    try {
      const extracted = await runExtraction(pastedText);
      setResult(extracted);
      clear();
    } catch (err: any) {
      setError(err?.message || "Failed to extract skills. Please try again.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileExtraction = async () => {
    if (!file) return;

    if (!isAuthenticated) {
      snapshot({ sourceType });
      setShowAuthOverlay(true);
      return;
    }

    setIsExtracting(true);
    setError(null);
    setResult(null);

    try {
      const text = await extractTextFromFile(file);
      if (!text.trim()) {
        setError("Could not extract text from this file.");
        return;
      }
      const extracted = await runExtraction(text);
      setResult(extracted);
      clear();
    } catch (err: any) {
      setError(err?.message || "Failed to extract skills from file. Please try again.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSavedExtraction = async () => {
    const targetId = sourceType === "resume" ? selectedResumeId : selectedJobId;
    if (!targetId) return;

    if (!isAuthenticated) {
      snapshot({
        sourceType,
        selectedResumeId,
        selectedJobId,
      });
      setShowAuthOverlay(true);
      return;
    }

    setIsExtracting(true);
    setError(null);
    setResult(null);

    try {
      let content = "";
      if (sourceType === "resume") {
        const resume = await resumeService.getResumeById(targetId);
        content = resume.data ? JSON.stringify(resume.data) : "";
      } else {
        const job = await jobService.getJobById(targetId);
        content =
          (job?.description && String(job.description)) ||
          [job?.title, job?.company, job?.location]
            .filter(Boolean)
            .join("\n") ||
          JSON.stringify(job ?? {});
      }
      if (!content.trim()) {
        throw new Error(
          `Selected ${sourceType === "resume" ? "resume" : "job"} has no content to analyze.`,
        );
      }
      const extracted = await runExtraction(content);
      setResult(extracted);
      clear();
    } catch (err: any) {
      setError(err?.message || "Failed to extract skills. Please try again.");
    } finally {
      setIsExtracting(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setResult(null);
  };

  const reset = () => {
    setFile(null);
    setPastedText("");
    setSelectedResumeId("");
    setSelectedJobId("");
    setSavedSearch("");
    setError(null);
    setResult(null);
  };

  // Reset saved-item selection when toggling between job and resume so a
  // leftover resumeId doesn't linger when the user switches to jobs.
  const handleSourceTypeChange = (next: SkillSourceType) => {
    setSourceType(next);
    setSelectedResumeId("");
    setSelectedJobId("");
    setSavedSearch("");
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className={`pt-16 ${showAuthOverlay ? "relative" : ""}`}>
          {showAuthOverlay && (
            <AuthOverlay
              contentType="tool"
              title="Skill Extractor"
              message="Sign in to run this tool — we'll keep the inputs you've entered and resume automatically."
            />
          )}

          <div className="max-w-6xl mx-auto p-6">
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-4">
                <Link to="/tools">
                  <Button variant="outline" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Tools
                  </Button>
                </Link>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-brand-purple/10 rounded-lg flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-brand-purple" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold flex items-center gap-2">
                    Skill Extractor
                    <ToolTierBadge toolId="skill-extractor" tier="free" />
                  </h1>
                  <p className="text-muted-foreground">
                    Upload a job description or resume and instantly pull out
                    every skill it mentions — grouped, deduplicated, and
                    categorized.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Left — input */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Source
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        What are you analyzing?
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={sourceType === "job" ? "default" : "outline"}
                          onClick={() => handleSourceTypeChange("job")}
                          className="justify-start"
                        >
                          <Briefcase className="h-4 w-4 mr-2" />
                          Job Description
                        </Button>
                        <Button
                          type="button"
                          variant={sourceType === "resume" ? "default" : "outline"}
                          onClick={() => handleSourceTypeChange("resume")}
                          className="justify-start"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Resume
                        </Button>
                      </div>
                    </div>

                    <Tabs
                      defaultValue={isAuthenticated ? "saved" : "text"}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="saved" disabled={!isAuthenticated}>
                          {sourceType === "job" ? "My Jobs" : "My Resumes"}
                          {!isAuthenticated && " (Login)"}
                        </TabsTrigger>
                        <TabsTrigger value="text">Paste Text</TabsTrigger>
                        <TabsTrigger value="upload">Upload File</TabsTrigger>
                      </TabsList>

                      <TabsContent value="saved" className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Search your saved{" "}
                            {sourceType === "job" ? "jobs" : "resumes"}
                          </label>
                          <Input
                            placeholder={
                              sourceType === "job"
                                ? "Search by title or company..."
                                : "Search by name..."
                            }
                            value={savedSearch}
                            onChange={(e) => setSavedSearch(e.target.value)}
                            className="mb-3"
                          />
                          <Select
                            value={
                              sourceType === "job"
                                ? selectedJobId
                                : selectedResumeId
                            }
                            onValueChange={(value) => {
                              if (sourceType === "job") setSelectedJobId(value);
                              else setSelectedResumeId(value);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={
                                  sourceType === "job"
                                    ? "Choose a job to analyze"
                                    : "Choose a resume to analyze"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {sourceType === "job"
                                ? filteredJobs.map((job) => (
                                    <SelectItem key={job.id} value={job.id}>
                                      {job.title}
                                      {job.company ? ` — ${job.company}` : ""}
                                    </SelectItem>
                                  ))
                                : filteredResumes.map((resume) => (
                                    <SelectItem
                                      key={(resume.Id || resume.id)!}
                                      value={(resume.Id || resume.id)!}
                                    >
                                      {resume.Name ||
                                        resume.name ||
                                        "Untitled Resume"}
                                    </SelectItem>
                                  ))}
                              {((sourceType === "job" &&
                                filteredJobs.length === 0) ||
                                (sourceType === "resume" &&
                                  filteredResumes.length === 0)) && (
                                <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                                  {savedSearch
                                    ? "No matches."
                                    : `You don't have any saved ${sourceType === "job" ? "jobs" : "resumes"} yet.`}
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          onClick={handleSavedExtraction}
                          disabled={
                            isExtracting ||
                            (sourceType === "job"
                              ? !selectedJobId
                              : !selectedResumeId)
                          }
                          className="w-full"
                        >
                          {isExtracting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Extracting…
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Extract Skills
                            </>
                          )}
                        </Button>
                      </TabsContent>

                      <TabsContent value="text" className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            {sourceType === "job" ? "Job Description" : "Resume Text"}
                          </label>
                          <Textarea
                            placeholder={
                              sourceType === "job"
                                ? "Paste the full job description here..."
                                : "Paste your resume text here..."
                            }
                            value={pastedText}
                            onChange={(e) => setPastedText(e.target.value)}
                            className="min-h-[220px]"
                          />
                        </div>
                        <Button
                          onClick={handleTextExtraction}
                          disabled={isExtracting || !pastedText.trim()}
                          className="w-full"
                        >
                          {isExtracting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Extracting…
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Extract Skills
                            </>
                          )}
                        </Button>
                      </TabsContent>

                      <TabsContent value="upload" className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Upload {sourceType === "job" ? "Job Description" : "Resume"} File
                          </label>
                          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                            <input
                              type="file"
                              onChange={handleFileChange}
                              accept=".pdf,.doc,.docx,.txt,.md,.json"
                              className="hidden"
                              id="skill-extract-upload"
                            />
                            <label
                              htmlFor="skill-extract-upload"
                              className="cursor-pointer"
                            >
                              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground">
                                Click to upload or drag and drop
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                PDF, Word, Markdown, JSON, or Text (max 10MB)
                              </p>
                            </label>
                          </div>
                        </div>

                        {file && (
                          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              <span className="text-sm font-medium">
                                {file.name}
                              </span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={removeFile}>
                              Remove
                            </Button>
                          </div>
                        )}

                        <Button
                          onClick={handleFileExtraction}
                          disabled={isExtracting || !file}
                          className="w-full"
                        >
                          {isExtracting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Extracting…
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Extract Skills
                            </>
                          )}
                        </Button>
                      </TabsContent>
                    </Tabs>

                    {error && (
                      <Alert>
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        FREE
                      </Badge>
                      <span className="font-medium text-foreground">
                        No Pro required
                      </span>
                    </div>
                    <p>
                      Skill Extractor is free for every signed-in user. Each run
                      uses a small amount of your monthly token budget.
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Right — results */}
              <div className="space-y-6">
                {result ? (
                  <>
                    <SkillExtractionResults result={result} />
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={reset}>
                        Extract Another
                      </Button>
                    </div>
                  </>
                ) : (
                  !isExtracting && (
                    <Card>
                      <CardContent className="p-8 text-center">
                        <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="font-semibold mb-2">Ready to Extract</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Choose Job Description or Resume, then paste text or
                          upload a file to get a categorized list of skills.
                        </p>

                        <div className="text-left bg-muted rounded-lg p-4 mt-4">
                          <h4 className="font-medium mb-2">What you'll get:</h4>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• Skills grouped by category</li>
                            <li>• Deduplicated and canonical names</li>
                            <li>
                              • Importance tags (required / preferred) for job
                              posts
                            </li>
                            <li>• Copyable list for your applications</li>
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  )
                )}
              </div>
            </div>
          </div>
          <ToolFooterSEO />
          <Footer />
        </div>
      </div>
    </div>
  );
}

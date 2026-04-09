import { useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Upload,
  Zap,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import AuthOverlay from "@/components/AuthOverlay";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { resumeService } from "@/lib/services/resume-service";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { extractTextFromFile } from "@/lib/extract-text";

interface OptimizationResult {
  overallScore: number;
  atsScore: number;
  keywordScore: number;
  formatScore: number;
  contentScore: number;
  suggestions: OptimizationSuggestion[];
  optimizedContent?: string;
}

interface OptimizationSuggestion {
  type: "critical" | "important" | "minor";
  category: "ats" | "keywords" | "format" | "content";
  title: string;
  description: string;
  impact: string;
}

export default function ResumeOptimizer() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated } = useAuth();

  // SEO for resume optimizer page
  useSEO(location.pathname);

  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [optimizationResult, setOptimizationResult] =
    useState<OptimizationResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

  // Fetch user's resumes if authenticated
  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated,
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "application/json",
        "application/ld+json",
      ];

      if (!allowedTypes.includes(selectedFile.type)) {
        setError("Please upload a PDF, Word, Markdown, JSON, or text file.");
        return;
      }

      // Validate file size (10MB limit)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError("File size must be less than 10MB.");
        return;
      }

      setFile(selectedFile);
      setError(null);
      setOptimizationResult(null);
    }
  };

  const optimizeResume = async (content: string): Promise<OptimizationResult> => {
    // Validate content before making API call
    if (!content || !content.trim()) {
      throw new Error("Resume content is required for optimization.");
    }

    const response = await apiClient.post("/api/ResumeOptimizer/optimize", {
      resumeText: content,
      jobDescription: jobDescription || undefined
    });

    const data: any = response.data;

    // Check for API error response
    if (data.success === false && data.error) {
      throw new Error(data.error.message || "Optimization failed");
    }

    // Parse the result
    const parsedResult = typeof data.result === 'string'
      ? JSON.parse(data.result)
      : data.result || data;
    return parsedResult;
  };

  const handleTextOptimization = async () => {
    if (!resumeText.trim()) {
      setError("Please enter resume text to optimize.");
      return;
    }

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsOptimizing(true);
    setError(null);
    setOptimizationResult(null);

    try {
      const result = await optimizeResume(resumeText);
      setOptimizationResult(result);
    } catch (err: any) {
      console.error("Optimization failed:", err);
      const errorMessage = err?.message || "Failed to optimize resume. Please try again.";
      setError(errorMessage);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleFileOptimization = async () => {
    if (!file) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsOptimizing(true);
    setError(null);
    setOptimizationResult(null);

    try {
      // Extract text client-side (pdfjs-dist for PDF, jszip for DOCX)
      const extractedText = await extractTextFromFile(file);
      if (!extractedText.trim()) {
        setError("Could not extract text from this file.");
        setIsOptimizing(false);
        return;
      }

      // Parse extracted text into structured JSON via AI
      const { data: parseResult } = await apiClient.requestRaw<any>(
        "/api/resume/parse",
        {
          method: "POST",
          body: JSON.stringify({ content: extractedText }),
          headers: { "Content-Type": "application/json" },
        },
      );
      const resumeContent = parseResult.result || parseResult;

      // Now optimize the parsed content
      const result = await optimizeResume(resumeContent);
      setOptimizationResult(result);
    } catch (err: any) {
      console.error("File optimization failed:", err);
      const errorMessage = err?.message || "Failed to optimize resume file. Please try again.";
      setError(errorMessage);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleResumeOptimization = async () => {
    if (!selectedResumeId) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsOptimizing(true);
    setError(null);
    setOptimizationResult(null);

    try {
      const resume = await resumeService.getResumeById(selectedResumeId);
      // Convert resume data to a readable format for the AI
      const resumeContent = resume.data ? JSON.stringify(resume.data) : "";
      if (!resumeContent) {
        throw new Error("Selected resume has no content to optimize.");
      }
      const result = await optimizeResume(resumeContent);
      setOptimizationResult(result);
    } catch (err: any) {
      console.error("Resume optimization failed:", err);
      const errorMessage = err?.message || "Failed to optimize resume. Please try again.";
      setError(errorMessage);
    } finally {
      setIsOptimizing(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setOptimizationResult(null);
  };

  const resetOptimization = () => {
    setFile(null);
    setResumeText("");
    setSelectedResumeId("");
    setJobDescription("");
    setError(null);
    setOptimizationResult(null);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBackground = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case "critical":
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case "important":
        return <TrendingUp className="h-4 w-4 text-yellow-600" />;
      default:
        return <CheckCircle2 className="h-4 w-4 text-blue-600" />;
    }
  };

  const getSuggestionBadgeColor = (type: string) => {
    switch (type) {
      case "critical":
        return "bg-red-100 text-red-800";
      case "important":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type.includes("pdf")) return "📄";
    if (file.type.includes("word")) return "📝";
    if (file.type.includes("text")) return "📄";
    return "📄";
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
              contentType="resume"
              title="Resume Optimizer Tool"
              message="Sign in to access our AI-powered resume optimization tool and get detailed ATS compatibility analysis."
            />
          )}

          <div className="max-w-6xl mx-auto p-6">
            {/* Header */}
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
                <div className="w-12 h-12 bg-brand-blue/10 rounded-lg flex items-center justify-center">
                  <Zap className="h-6 w-6 text-brand-blue" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Resume Optimizer</h1>
                  <p className="text-muted-foreground">
                    Optimize your resume for ATS systems and improve your job
                    search success
                  </p>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Left Column - Optimization Tool */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Optimize Resume
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs
                      defaultValue={isAuthenticated ? "existing" : "text"}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="text">Paste Text</TabsTrigger>
                        <TabsTrigger value="upload">Upload File</TabsTrigger>
                        <TabsTrigger
                          value="existing"
                          disabled={!isAuthenticated}
                        >
                          My Resumes {!isAuthenticated && "(Login Required)"}
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="text" className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Resume Text
                          </label>
                          <Textarea
                            placeholder="Paste your resume text here..."
                            value={resumeText}
                            onChange={(e) => setResumeText(e.target.value)}
                            className="min-h-[150px]"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Job Description (Optional)
                          </label>
                          <Textarea
                            placeholder="Paste the job description to get targeted optimization suggestions..."
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            className="min-h-[100px]"
                          />
                        </div>
                        <Button
                          onClick={handleTextOptimization}
                          disabled={isOptimizing || !resumeText.trim()}
                          className="w-full"
                        >
                          {isOptimizing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Optimizing...
                            </>
                          ) : (
                            <>
                              <Zap className="h-4 w-4 mr-2" />
                              Optimize Resume
                            </>
                          )}
                        </Button>
                      </TabsContent>

                      <TabsContent value="upload" className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Upload Resume File
                          </label>
                          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                            <input
                              type="file"
                              onChange={handleFileChange}
                              accept=".pdf,.doc,.docx,.txt,.md,.json"
                              className="hidden"
                              id="resume-upload"
                            />
                            <label
                              htmlFor="resume-upload"
                              className="cursor-pointer"
                            >
                              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground">
                                Click to upload or drag and drop
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                PDF, Word, Markdown, JSON, or Text files (max 10MB)
                              </p>
                            </label>
                          </div>
                        </div>

                        {file && (
                          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {getFileIcon(file)}
                              </span>
                              <span className="text-sm font-medium">
                                {file.name}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={removeFile}
                            >
                              Remove
                            </Button>
                          </div>
                        )}

                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Job Description (Optional)
                          </label>
                          <Textarea
                            placeholder="Paste the job description to get targeted optimization suggestions..."
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            className="min-h-[100px]"
                          />
                        </div>

                        <Button
                          onClick={handleFileOptimization}
                          disabled={isOptimizing || !file}
                          className="w-full"
                        >
                          {isOptimizing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Optimizing...
                            </>
                          ) : (
                            <>
                              <Zap className="h-4 w-4 mr-2" />
                              Optimize Resume
                            </>
                          )}
                        </Button>
                      </TabsContent>

                      <TabsContent value="existing" className="space-y-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Select Resume
                          </label>
                          <Select
                            value={selectedResumeId}
                            onValueChange={setSelectedResumeId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a resume to optimize" />
                            </SelectTrigger>
                            <SelectContent>
                              {resumes?.filter((resume) => resume.Id || resume.id).map((resume) => (
                                <SelectItem
                                  key={(resume.Id || resume.id)!}
                                  value={(resume.Id || resume.id)!}
                                >
                                  {resume.Name || resume.name || "Untitled Resume"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            Job Description (Optional)
                          </label>
                          <Textarea
                            placeholder="Paste the job description to get targeted optimization suggestions..."
                            value={jobDescription}
                            onChange={(e) => setJobDescription(e.target.value)}
                            className="min-h-[100px]"
                          />
                        </div>

                        <Button
                          onClick={handleResumeOptimization}
                          disabled={isOptimizing || !selectedResumeId}
                          className="w-full"
                        >
                          {isOptimizing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Optimizing...
                            </>
                          ) : (
                            <>
                              <Zap className="h-4 w-4 mr-2" />
                              Optimize Resume
                            </>
                          )}
                        </Button>
                      </TabsContent>
                    </Tabs>

                    {error && (
                      <Alert className="mt-4">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Results */}
              <div className="space-y-6">
                {optimizationResult && (
                  <>
                    {/* Scores Overview */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" />
                          Optimization Scores
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* Overall Score */}
                          <div className="text-center p-4 bg-muted rounded-lg">
                            <div
                              className={`text-3xl font-bold ${getScoreColor(optimizationResult.overallScore)}`}
                            >
                              {optimizationResult.overallScore}%
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Overall Score
                            </p>
                          </div>

                          {/* Individual Scores */}
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>ATS Compatibility</span>
                                <span
                                  className={getScoreColor(
                                    optimizationResult.atsScore,
                                  )}
                                >
                                  {optimizationResult.atsScore}%
                                </span>
                              </div>
                              <Progress
                                value={optimizationResult.atsScore}
                                className="h-2"
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>Keywords</span>
                                <span
                                  className={getScoreColor(
                                    optimizationResult.keywordScore,
                                  )}
                                >
                                  {optimizationResult.keywordScore}%
                                </span>
                              </div>
                              <Progress
                                value={optimizationResult.keywordScore}
                                className="h-2"
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>Format</span>
                                <span
                                  className={getScoreColor(
                                    optimizationResult.formatScore,
                                  )}
                                >
                                  {optimizationResult.formatScore}%
                                </span>
                              </div>
                              <Progress
                                value={optimizationResult.formatScore}
                                className="h-2"
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>Content Quality</span>
                                <span
                                  className={getScoreColor(
                                    optimizationResult.contentScore,
                                  )}
                                >
                                  {optimizationResult.contentScore}%
                                </span>
                              </div>
                              <Progress
                                value={optimizationResult.contentScore}
                                className="h-2"
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Suggestions */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5" />
                          Optimization Suggestions
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {optimizationResult.suggestions.map(
                            (suggestion, index) => (
                              <div
                                key={index}
                                className="border rounded-lg p-4"
                              >
                                <div className="flex items-start gap-3">
                                  {getSuggestionIcon(suggestion.type)}
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <h4 className="font-semibold">
                                        {suggestion.title}
                                      </h4>
                                      <Badge
                                        variant="secondary"
                                        className={getSuggestionBadgeColor(
                                          suggestion.type,
                                        )}
                                      >
                                        {suggestion.type}
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-2">
                                      {suggestion.description}
                                    </p>
                                    <p className="text-xs text-green-600 font-medium">
                                      💡 {suggestion.impact}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ),
                          )}
                        </div>

                        <div className="flex gap-2 mt-6">
                          <Button variant="outline" onClick={resetOptimization}>
                            Optimize Another
                          </Button>
                          <Button
                            onClick={() => {
                              const report = `Resume Optimization Report\n\nOverall Score: ${optimizationResult.overallScore}%\nATS Score: ${optimizationResult.atsScore}%\nKeyword Score: ${optimizationResult.keywordScore}%\nFormat Score: ${optimizationResult.formatScore}%\nContent Score: ${optimizationResult.contentScore}%\n\nSuggestions:\n${optimizationResult.suggestions.map((s) => `- ${s.title}: ${s.description}`).join("\n")}`;
                              navigator.clipboard.writeText(report);
                            }}
                            variant="outline"
                          >
                            Copy Report
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}

                {!optimizationResult && !isOptimizing && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-semibold mb-2">Ready to Optimize</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Upload a resume file, paste text, or select from your
                        saved resumes to get optimization suggestions.
                      </p>

                      <div className="text-left bg-muted rounded-lg p-4 mt-4">
                        <h4 className="font-medium mb-2">What you'll get:</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• ATS compatibility analysis</li>
                          <li>• Keyword optimization suggestions</li>
                          <li>• Format improvement recommendations</li>
                          <li>• Content quality assessment</li>
                          <li>• Actionable improvement tips</li>
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}

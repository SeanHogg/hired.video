import { useState } from "react";
import {
  ArrowLeft,
  Brain,
  Loader2,
  Upload,
  Star,
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

interface ResumeScore {
  overallScore: number;
  atsCompatibility: number;
  contentQuality: number;
  keywordScore: number;
  formatScore: number;
  impactScore: number;
  grade: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: ScoreRecommendation[];
}

interface ScoreRecommendation {
  category: "critical" | "important" | "minor";
  title: string;
  description: string;
  impact: number;
}

export default function AIResumeScorer() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  // SEO for AI resume scorer page
  useSEO(location.pathname);

  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [scoreResult, setScoreResult] = useState<ResumeScore | null>(null);
  const [isScoring, setIsScoring] = useState(false);
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
      ];

      if (!allowedTypes.includes(selectedFile.type)) {
        setError("Please upload a PDF, Word document, or text file.");
        return;
      }

      // Validate file size (10MB limit)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError("File size must be less than 10MB.");
        return;
      }

      setFile(selectedFile);
      setError(null);
      setScoreResult(null);
    }
  };

  const scoreResume = async (content: string): Promise<ResumeScore> => {
    // Validate content before making API call
    if (!content || !content.trim()) {
      throw new Error("Resume content is required for scoring.");
    }

    const response = await apiClient.post("/api/ResumeScorer/score", {
      resumeText: content
    });

    const data: any = response.data;

    // Check for API error response
    if (data.success === false && data.error) {
      throw new Error(data.error.message || "Scoring failed");
    }

    // Parse the result
    const parsedResult = typeof data.result === 'string'
      ? JSON.parse(data.result)
      : data.result || data;
    return parsedResult;
  };

  const handleTextScoring = async () => {
    if (!resumeText.trim()) {
      setError("Please enter resume text to score.");
      return;
    }

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsScoring(true);
    setError(null);
    setScoreResult(null);

    try {
      const result = await scoreResume(resumeText);
      setScoreResult(result);
    } catch (err: any) {
      console.error("Scoring failed:", err);
      const errorMessage = err?.message || "Failed to score resume. Please try again.";
      setError(errorMessage);
    } finally {
      setIsScoring(false);
    }
  };

  const handleFileScoring = async () => {
    if (!file) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsScoring(true);
    setError(null);
    setScoreResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // First parse the file to text
      const { data: parseResult } = await apiClient.requestRaw<any>(
        "/api/resume/parse",
        { method: "POST", body: formData },
      );
      const resumeContent = parseResult.result || parseResult;

      // Now score the parsed content
      const result = await scoreResume(resumeContent);
      setScoreResult(result);
    } catch (err: any) {
      console.error("File scoring failed:", err);
      const errorMessage = err?.message || "Failed to score resume file. Please try again.";
      setError(errorMessage);
    } finally {
      setIsScoring(false);
    }
  };

  const handleResumeScoring = async () => {
    if (!selectedResumeId) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsScoring(true);
    setError(null);
    setScoreResult(null);

    try {
      const resume = await resumeService.getResumeById(selectedResumeId);
      // Convert resume data to a readable format for the AI
      const resumeContent = resume.data ? JSON.stringify(resume.data) : "";
      if (!resumeContent) {
        throw new Error("Selected resume has no content to score.");
      }
      const result = await scoreResume(resumeContent);
      setScoreResult(result);
    } catch (err: any) {
      console.error("Resume scoring failed:", err);
      const errorMessage = err?.message || "Failed to score resume. Please try again.";
      setError(errorMessage);
    } finally {
      setIsScoring(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setScoreResult(null);
  };

  const resetScoring = () => {
    setFile(null);
    setResumeText("");
    setSelectedResumeId("");
    setError(null);
    setScoreResult(null);
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-green-600";
    if (score >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith("A")) return "text-green-600 bg-green-100";
    if (grade.startsWith("B")) return "text-blue-600 bg-blue-100";
    if (grade.startsWith("C")) return "text-yellow-600 bg-yellow-100";
    return "text-red-600 bg-red-100";
  };

  const getRecommendationIcon = (category: string) => {
    switch (category) {
      case "critical":
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case "important":
        return <TrendingUp className="h-4 w-4 text-yellow-600" />;
      default:
        return <CheckCircle2 className="h-4 w-4 text-blue-600" />;
    }
  };

  const getRecommendationBadgeColor = (category: string) => {
    switch (category) {
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
              title="AI Resume Scorer Tool"
              message="Sign in to access our AI-powered resume scoring tool and get detailed feedback on your resume's effectiveness."
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
                <div className="w-12 h-12 bg-brand-purple/10 rounded-lg flex items-center justify-center">
                  <Brain className="h-6 w-6 text-brand-purple" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">AI Resume Scorer</h1>
                  <p className="text-muted-foreground">
                    Get instant AI-powered feedback and scoring for your resume
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-yellow-100 text-yellow-800"
                >
                  Hot
                </Badge>
              </div>

              {/* Info Card */}
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Star className="h-4 w-4 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-purple-900 mb-1">
                        How it works
                      </h3>
                      <p className="text-sm text-purple-800">
                        Our AI analyzes your resume across multiple dimensions
                        including ATS compatibility, content quality, keyword
                        optimization, and formatting to provide a comprehensive
                        score and actionable feedback.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content */}
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Left Column - Scoring Tool */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Score Your Resume
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
                            className="min-h-[200px]"
                          />
                        </div>
                        <Button
                          onClick={handleTextScoring}
                          disabled={isScoring || !resumeText.trim()}
                          className="w-full"
                        >
                          {isScoring ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Scoring Resume...
                            </>
                          ) : (
                            <>
                              <Brain className="h-4 w-4 mr-2" />
                              Score My Resume
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
                              accept=".pdf,.doc,.docx,.txt"
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
                                PDF, Word, or Text files (max 10MB)
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

                        <Button
                          onClick={handleFileScoring}
                          disabled={isScoring || !file}
                          className="w-full"
                        >
                          {isScoring ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Scoring Resume...
                            </>
                          ) : (
                            <>
                              <Brain className="h-4 w-4 mr-2" />
                              Score My Resume
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
                              <SelectValue placeholder="Choose a resume to score" />
                            </SelectTrigger>
                            <SelectContent>
                              {resumes?.map((resume) => (
                                <SelectItem
                                  key={resume.id}
                                  value={resume.id || ""}
                                >
                                  {resume.name || "Untitled Resume"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <Button
                          onClick={handleResumeScoring}
                          disabled={isScoring || !selectedResumeId}
                          className="w-full"
                        >
                          {isScoring ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Scoring Resume...
                            </>
                          ) : (
                            <>
                              <Brain className="h-4 w-4 mr-2" />
                              Score My Resume
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
                {scoreResult && (
                  <>
                    {/* Overall Score */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Star className="h-5 w-5" />
                          Your Resume Score
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-center p-6 bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 rounded-lg mb-4">
                          <div
                            className={`text-5xl font-bold mb-2 ${getScoreColor(scoreResult.overallScore)}`}
                          >
                            {scoreResult.overallScore}
                          </div>
                          <div
                            className={`inline-flex items-center px-3 py-1 rounded-full text-lg font-semibold ${getGradeColor(scoreResult.grade)}`}
                          >
                            {scoreResult.grade}
                          </div>
                          <p className="text-sm text-muted-foreground mt-2">
                            Overall Resume Score
                          </p>
                        </div>

                        {/* Detailed Scores */}
                        <div className="space-y-3">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>ATS Compatibility</span>
                              <span
                                className={getScoreColor(
                                  scoreResult.atsCompatibility,
                                )}
                              >
                                {scoreResult.atsCompatibility}%
                              </span>
                            </div>
                            <Progress
                              value={scoreResult.atsCompatibility}
                              className="h-2"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Content Quality</span>
                              <span
                                className={getScoreColor(
                                  scoreResult.contentQuality,
                                )}
                              >
                                {scoreResult.contentQuality}%
                              </span>
                            </div>
                            <Progress
                              value={scoreResult.contentQuality}
                              className="h-2"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Keywords</span>
                              <span
                                className={getScoreColor(
                                  scoreResult.keywordScore,
                                )}
                              >
                                {scoreResult.keywordScore}%
                              </span>
                            </div>
                            <Progress
                              value={scoreResult.keywordScore}
                              className="h-2"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Format</span>
                              <span
                                className={getScoreColor(
                                  scoreResult.formatScore,
                                )}
                              >
                                {scoreResult.formatScore}%
                              </span>
                            </div>
                            <Progress
                              value={scoreResult.formatScore}
                              className="h-2"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Impact</span>
                              <span
                                className={getScoreColor(
                                  scoreResult.impactScore,
                                )}
                              >
                                {scoreResult.impactScore}%
                              </span>
                            </div>
                            <Progress
                              value={scoreResult.impactScore}
                              className="h-2"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Strengths & Weaknesses */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" />
                          Analysis Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-semibold text-green-600 mb-2 flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4" />
                              Strengths
                            </h4>
                            <ul className="space-y-1">
                              {scoreResult.strengths.map((strength, index) => (
                                <li
                                  key={index}
                                  className="text-sm text-muted-foreground flex items-start gap-2"
                                >
                                  <span className="text-green-600 mt-1">•</span>
                                  {strength}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <h4 className="font-semibold text-red-600 mb-2 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" />
                              Areas for Improvement
                            </h4>
                            <ul className="space-y-1">
                              {scoreResult.weaknesses.map((weakness, index) => (
                                <li
                                  key={index}
                                  className="text-sm text-muted-foreground flex items-start gap-2"
                                >
                                  <span className="text-red-600 mt-1">•</span>
                                  {weakness}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Recommendations */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5" />
                          Recommendations
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {scoreResult.recommendations.map((rec, index) => (
                            <div key={index} className="border rounded-lg p-4">
                              <div className="flex items-start gap-3">
                                {getRecommendationIcon(rec.category)}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h4 className="font-semibold">
                                      {rec.title}
                                    </h4>
                                    <Badge
                                      variant="secondary"
                                      className={getRecommendationBadgeColor(
                                        rec.category,
                                      )}
                                    >
                                      {rec.category}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      Impact: {rec.impact}/10
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {rec.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2 mt-6">
                          <Button variant="outline" onClick={resetScoring}>
                            Score Another Resume
                          </Button>
                          <Button
                            onClick={() => {
                              const report = `Resume Score Report\n\nOverall Score: ${scoreResult.overallScore}% (${scoreResult.grade})\n\nDetailed Scores:\n- ATS Compatibility: ${scoreResult.atsCompatibility}%\n- Content Quality: ${scoreResult.contentQuality}%\n- Keywords: ${scoreResult.keywordScore}%\n- Format: ${scoreResult.formatScore}%\n- Impact: ${scoreResult.impactScore}%\n\nStrengths:\n${scoreResult.strengths.map((s) => `- ${s}`).join("\n")}\n\nAreas for Improvement:\n${scoreResult.weaknesses.map((w) => `- ${w}`).join("\n")}\n\nGenerated by hired.video AI Resume Scorer`;
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

                {!scoreResult && !isScoring && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-semibold mb-2">Ready to Score</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Upload a resume file, paste text, or select from your
                        saved resumes to get instant AI-powered scoring.
                      </p>

                      <div className="text-left bg-muted rounded-lg p-4 mt-4">
                        <h4 className="font-medium mb-2">What you'll get:</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• Overall resume score and letter grade</li>
                          <li>• ATS compatibility analysis</li>
                          <li>• Content quality assessment</li>
                          <li>• Keyword optimization score</li>
                          <li>• Format and impact evaluation</li>
                          <li>• Personalized improvement recommendations</li>
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

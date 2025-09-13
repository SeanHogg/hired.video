import { useState } from "react";
import { ArrowLeft, FileText, Loader2, Upload, Sparkles } from "lucide-react";
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
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import AuthOverlay from "@/components/AuthOverlay";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { resumeService } from "@/lib/services/resume-service";
import { useQuery } from "@tanstack/react-query";

export default function SummarizeResume() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  // SEO for summarize resume page
  useSEO(location.pathname);

  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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
      setSummary(null);
    }
  };

  const handleTextSummarization = async () => {
    if (!resumeText.trim()) {
      setError("Please enter resume text to summarize.");
      return;
    }

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setSummary(null);

    try {
      // Call the summarization API
      const response = await fetch("/prompt/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resumeText),
      });

      if (!response.ok) {
        throw new Error("Failed to summarize resume");
      }

      const result = await response.json();
      setSummary(result.result || result);
    } catch (err) {
      console.error("Summarization failed:", err);
      setError("Failed to summarize resume. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileSummarization = async () => {
    if (!file) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setSummary(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // First parse the file to text, then summarize
      const parseResponse = await fetch("/api/resume/parse", {
        method: "POST",
        body: formData,
      });

      if (!parseResponse.ok) {
        throw new Error("Failed to parse resume file");
      }

      const parseResult = await parseResponse.json();
      const resumeContent = parseResult.result || parseResult;

      // Now summarize the parsed content
      const summaryResponse = await fetch("/prompt/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resumeContent),
      });

      if (!summaryResponse.ok) {
        throw new Error("Failed to summarize resume");
      }

      const summaryResult = await summaryResponse.json();
      setSummary(summaryResult.result || summaryResult);
    } catch (err) {
      console.error("File summarization failed:", err);
      setError("Failed to summarize resume file. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleResumeSummarization = async () => {
    if (!selectedResumeId) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setSummary(null);

    try {
      const resume = await resumeService.getResumeById(selectedResumeId);

      const response = await fetch("/prompt/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resume.data || {}),
      });

      if (!response.ok) {
        throw new Error("Failed to summarize resume");
      }

      const result = await response.json();
      setSummary(result.result || result);
    } catch (err) {
      console.error("Resume summarization failed:", err);
      setError("Failed to summarize resume. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setSummary(null);
  };

  const resetAnalysis = () => {
    setFile(null);
    setResumeText("");
    setSelectedResumeId("");
    setError(null);
    setSummary(null);
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
              title="Resume Summarization Tool"
              message="Sign in to access our AI-powered resume summarization tool and get instant professional summaries."
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
                <div className="w-12 h-12 bg-brand-green/10 rounded-lg flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-brand-green" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Resume Summarization</h1>
                  <p className="text-muted-foreground">
                    Get AI-powered professional summaries of your resume
                  </p>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Left Column - Summarization Tool */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Summarize Resume
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
                          onClick={handleTextSummarization}
                          disabled={isAnalyzing || !resumeText.trim()}
                          className="w-full"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Summarizing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Summarize Resume
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
                          onClick={handleFileSummarization}
                          disabled={isAnalyzing || !file}
                          className="w-full"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Summarizing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Summarize Resume
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
                              <SelectValue placeholder="Choose a resume to summarize" />
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
                          onClick={handleResumeSummarization}
                          disabled={isAnalyzing || !selectedResumeId}
                          className="w-full"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Summarizing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Summarize Resume
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
                {summary && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Resume Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {summary}
                        </div>
                      </div>

                      <div className="flex gap-2 mt-6">
                        <Button variant="outline" onClick={resetAnalysis}>
                          Summarize Another
                        </Button>
                        <Button
                          onClick={() => navigator.clipboard.writeText(summary)}
                          variant="outline"
                        >
                          Copy Summary
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!summary && !isAnalyzing && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-semibold mb-2">Ready to Summarize</h3>
                      <p className="text-sm text-muted-foreground">
                        Upload a resume file, paste text, or select from your
                        saved resumes to get started.
                      </p>
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

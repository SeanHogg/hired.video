import { useState, useCallback, useMemo } from "react";
import {
  Upload,
  Loader2,
  X,
  AlertTriangle,
  Heart,
  FileText,
  ArrowLeft,
  Lightbulb,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import AuthOverlay from "@/components/AuthOverlay";
import SentimentScoreDisplay from "@/components/tools/SentimentScoreDisplay";
import SentimentRecommendations from "@/components/tools/SentimentRecommendations";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { sentimentService } from "@/lib/services/sentiment-service";
import { resumeService } from "@/lib/services/resume-service";
import { useQuery } from "@tanstack/react-query";

export default function SentimentAnalysis() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  // SEO for sentiment analysis page
  useSEO(location.pathname);

  // State for file upload
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const [sentimentScore, setSentimentScore] = useState<number | null>(null);

  // State for existing resume selection
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");

  // Fetch user's resumes if authenticated
  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => resumeService.getUserResumes(),
    enabled: isAuthenticated,
  });

  const allowedTypes = useMemo(
    () => [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "application/json",
      "application/ld+json",
    ],
    [],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setError(null);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && allowedTypes.includes(droppedFile.type)) {
        setFile(droppedFile);
      } else {
        setError("Please upload a PDF, Word, Markdown, JSON, or text file.");
      }
    },
    [allowedTypes],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setError(null);

    if (selectedFile && allowedTypes.includes(selectedFile.type)) {
      setFile(selectedFile);
    } else {
      setError("Please upload a PDF, Word, Markdown, JSON, or text file.");
    }
  };

  const handleFileAnalysis = async () => {
    if (!file) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setSentimentScore(null);

    try {
      const score = await sentimentService.analyzeFileSentiment(file);
      setSentimentScore(score);
    } catch (err) {
      console.error("Sentiment analysis failed:", err);
      setError("Failed to analyze sentiment. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleResumeAnalysis = async () => {
    if (!selectedResumeId) return;

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setSentimentScore(null);

    try {
      const score =
        await sentimentService.analyzeResumeSentiment(selectedResumeId);
      setSentimentScore(score);
    } catch (err) {
      console.error("Resume sentiment analysis failed:", err);
      setError("Failed to analyze resume sentiment. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    setSentimentScore(null);
  };

  const resetAnalysis = () => {
    setFile(null);
    setSelectedResumeId("");
    setError(null);
    setSentimentScore(null);
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

        <div className={`pt-16 p-6 ${showAuthOverlay ? "relative" : ""}`}>
          {showAuthOverlay && (
            <AuthOverlay
              contentType="resume"
              title="Sentiment Analysis Tool"
              message="Sign in to access our AI-powered sentiment analysis tool and discover how positive your resume sounds to employers."
            />
          )}
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-purple/10 rounded-lg flex items-center justify-center">
                  <Heart className="h-6 w-6 text-brand-purple" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">
                    Resume Sentiment Analysis
                  </h1>
                  <p className="text-muted-foreground">
                    Discover how positive and engaging your resume sounds to
                    employers
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

            {/* Main Content */}
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Left Column - Analysis Tool */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Analyze Resume Sentiment
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs
                      defaultValue={isAuthenticated ? "existing" : "upload"}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="upload">Upload File</TabsTrigger>
                        <TabsTrigger
                          value="existing"
                          disabled={!isAuthenticated}
                        >
                          My Resumes {!isAuthenticated && "(Login Required)"}
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="upload" className="space-y-4">
                        {!file ? (
                          <div
                            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                              isDragging
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            }`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                          >
                            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                            <p className="text-lg font-medium mb-2">
                              Drop your resume here, or click to browse
                            </p>
                            <p className="text-sm text-muted-foreground mb-4">
                              Supports PDF, Word (.doc, .docx), Markdown, JSON, and text files
                            </p>
                            <Input
                              type="file"
                              accept=".pdf,.doc,.docx,.txt,.md,.json"
                              onChange={handleFileSelect}
                              className="hidden"
                              id="file-upload"
                            />
                            <Button variant="outline" asChild>
                              <label
                                htmlFor="file-upload"
                                className="cursor-pointer"
                              >
                                Choose File
                              </label>
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="border rounded-lg p-4 bg-muted/30">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl">
                                    {getFileIcon(file)}
                                  </span>
                                  <div>
                                    <p className="font-medium">{file.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={removeFile}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <Button
                              onClick={handleFileAnalysis}
                              disabled={isAnalyzing}
                              className="w-full"
                            >
                              {isAnalyzing ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Analyzing...
                                </>
                              ) : (
                                <>
                                  <Heart className="mr-2 h-4 w-4" />
                                  Analyze Sentiment
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="existing" className="space-y-4">
                        {isAuthenticated ? (
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="resume-select">
                                Select Resume
                              </Label>
                              <Select
                                value={selectedResumeId}
                                onValueChange={setSelectedResumeId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose a resume to analyze" />
                                </SelectTrigger>
                                <SelectContent>
                                  {resumes.filter((resume) => resume.Id || resume.id).map((resume) => (
                                    <SelectItem
                                      key={(resume.Id || resume.id)!}
                                      value={(resume.Id || resume.id)!}
                                    >
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4" />
                                        {resume.Name || resume.name || "Untitled Resume"}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              onClick={handleResumeAnalysis}
                              disabled={!selectedResumeId || isAnalyzing}
                              className="w-full"
                            >
                              {isAnalyzing ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Analyzing...
                                </>
                              ) : (
                                <>
                                  <Heart className="mr-2 h-4 w-4" />
                                  Analyze Sentiment
                                </>
                              )}
                            </Button>
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-muted-foreground mb-4">
                              Please log in to analyze your existing resumes
                            </p>
                            <Link to="/login">
                              <Button>Log In</Button>
                            </Link>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>

                    {/* Error Display */}
                    {error && (
                      <Alert variant="destructive" className="mt-4">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Results */}
              <div className="space-y-6">
                {sentimentScore !== null ? (
                  <>
                    <SentimentScoreDisplay score={sentimentScore} />
                    <SentimentRecommendations score={sentimentScore} />
                    <div className="flex gap-3">
                      <Button
                        onClick={resetAnalysis}
                        variant="outline"
                        className="flex-1"
                      >
                        Analyze Another
                      </Button>
                      {isAuthenticated && (
                        <Link to="/resumes" className="flex-1">
                          <Button className="w-full">View My Resumes</Button>
                        </Link>
                      )}
                    </div>
                  </>
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        Ready to Analyze
                      </h3>
                      <p className="text-muted-foreground">
                        Upload a resume file or select from your existing
                        resumes to get started.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* SEO Content Section */}
            <div className="max-w-4xl mx-auto space-y-12 mt-16">
              {/* What is Resume Sentiment Analysis */}
              <section className="space-y-6">
                <h2 className="text-3xl font-bold text-center">
                  What is Resume Sentiment Analysis?
                </h2>
                <div className="prose prose-lg max-w-none text-muted-foreground">
                  <p className="text-center text-xl leading-relaxed">
                    Resume sentiment analysis uses advanced AI to evaluate the
                    emotional tone and positivity of your resume content,
                    helping you understand how your resume might be perceived by
                    hiring managers and recruiters.
                  </p>
                </div>

                <div className="grid md:grid-cols-3 gap-6 mt-8">
                  <Card className="text-center">
                    <CardContent className="p-6">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Heart className="h-6 w-6 text-blue-600" />
                      </div>
                      <h3 className="font-semibold mb-2">
                        AI-Powered Analysis
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Our machine learning model analyzes your resume's
                        language patterns to determine overall sentiment
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="text-center">
                    <CardContent className="p-6">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <FileText className="h-6 w-6 text-green-600" />
                      </div>
                      <h3 className="font-semibold mb-2">Instant Results</h3>
                      <p className="text-sm text-muted-foreground">
                        Get immediate feedback on your resume's tone with a
                        detailed sentiment score from 0-100
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="text-center">
                    <CardContent className="p-6">
                      <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Lightbulb className="h-6 w-6 text-purple-600" />
                      </div>
                      <h3 className="font-semibold mb-2">
                        Actionable Insights
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Receive personalized recommendations to improve your
                        resume's appeal to employers
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Why Resume Sentiment Matters */}
              <section className="space-y-6">
                <h2 className="text-3xl font-bold text-center">
                  Why Resume Sentiment Matters
                </h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold">
                      First Impressions Count
                    </h3>
                    <p className="text-muted-foreground">
                      Recruiters spend an average of 6-7 seconds scanning a
                      resume. The emotional tone of your content can make the
                      difference between moving forward or being passed over. A
                      positive sentiment creates an immediate favorable
                      impression.
                    </p>

                    <h3 className="text-xl font-semibold">
                      Stand Out from Competition
                    </h3>
                    <p className="text-muted-foreground">
                      With hundreds of applications for each position, resumes
                      with positive sentiment are more likely to capture
                      attention and create memorable impressions that lead to
                      interview invitations.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold">
                      Psychological Impact
                    </h3>
                    <p className="text-muted-foreground">
                      Positive language triggers favorable psychological
                      responses in readers. Hiring managers are more likely to
                      associate positive sentiment with confident, capable
                      candidates who will contribute positively to their
                      organization.
                    </p>

                    <h3 className="text-xl font-semibold">ATS Optimization</h3>
                    <p className="text-muted-foreground">
                      Modern Applicant Tracking Systems increasingly use
                      sentiment analysis as a ranking factor. Resumes with
                      positive sentiment scores may receive higher rankings in
                      automated screening processes.
                    </p>
                  </div>
                </div>
              </section>

              {/* How It Works */}
              <section className="space-y-6">
                <h2 className="text-3xl font-bold text-center">
                  How Our Sentiment Analysis Works
                </h2>
                <div className="grid md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl font-bold text-primary">1</span>
                    </div>
                    <h3 className="font-semibold mb-2">Upload Resume</h3>
                    <p className="text-sm text-muted-foreground">
                      Upload your resume in PDF, Word, or text format
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl font-bold text-primary">2</span>
                    </div>
                    <h3 className="font-semibold mb-2">AI Processing</h3>
                    <p className="text-sm text-muted-foreground">
                      Our ML model analyzes language patterns and emotional
                      indicators
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl font-bold text-primary">3</span>
                    </div>
                    <h3 className="font-semibold mb-2">Score Generation</h3>
                    <p className="text-sm text-muted-foreground">
                      Receive a detailed sentiment score from 0-100 with
                      interpretation
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl font-bold text-primary">4</span>
                    </div>
                    <h3 className="font-semibold mb-2">Get Recommendations</h3>
                    <p className="text-sm text-muted-foreground">
                      Receive personalized tips to improve your resume's
                      sentiment
                    </p>
                  </div>
                </div>
              </section>

              {/* Benefits Section */}
              <section className="space-y-6">
                <h2 className="text-3xl font-bold text-center">
                  Benefits of Resume Sentiment Analysis
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3 text-green-600">
                        Increase Interview Chances
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Resumes with positive sentiment are 40% more likely to
                        receive interview invitations according to recruitment
                        studies.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3 text-blue-600">
                        Improve ATS Rankings
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Modern ATS systems factor sentiment into ranking
                        algorithms, giving positive resumes higher visibility.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3 text-purple-600">
                        Build Confidence
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Understanding your resume's sentiment helps you approach
                        job applications with greater confidence and clarity.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3 text-orange-600">
                        Save Time
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Get instant feedback instead of waiting for application
                        responses to gauge your resume's effectiveness.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3 text-red-600">
                        Competitive Advantage
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Stand out from other candidates by ensuring your resume
                        creates the most positive first impression possible.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3 text-teal-600">
                        Data-Driven Insights
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Make resume improvements based on objective AI analysis
                        rather than guesswork or subjective opinions.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* FAQ Section */}
              <section className="space-y-6">
                <h2 className="text-3xl font-bold text-center">
                  Frequently Asked Questions
                </h2>
                <div className="space-y-4">
                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-2">
                        What is a good sentiment score for a resume?
                      </h3>
                      <p className="text-muted-foreground">
                        A sentiment score above 60 is considered positive and
                        will create a favorable impression. Scores between 31-60
                        are neutral and have room for improvement, while scores
                        below 30 indicate negative sentiment that should be
                        addressed immediately.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-2">
                        How accurate is the sentiment analysis?
                      </h3>
                      <p className="text-muted-foreground">
                        Our AI model has been trained on thousands of resumes
                        and achieves over 85% accuracy in sentiment
                        classification. The analysis considers context,
                        industry-specific language, and professional terminology
                        for precise results.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-2">
                        Can I analyze multiple resumes?
                      </h3>
                      <p className="text-muted-foreground">
                        Yes! Registered users can analyze all their saved
                        resumes and compare sentiment scores to identify their
                        strongest applications. You can also upload new files
                        for analysis at any time.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-2">
                        What file formats are supported?
                      </h3>
                      <p className="text-muted-foreground">
                        We support PDF, Microsoft Word (.doc, .docx), and plain
                        text (.txt) files. Most modern resume formats are
                        compatible with our text extraction and analysis system.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-2">
                        Is my resume data secure?
                      </h3>
                      <p className="text-muted-foreground">
                        Absolutely. We use enterprise-grade encryption and never
                        store your resume content permanently. Analysis is
                        performed in real-time and data is immediately discarded
                        after processing, ensuring complete privacy and
                        security.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Call to Action */}
              <section className="text-center space-y-6 bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
                <h2 className="text-3xl font-bold">
                  Ready to Optimize Your Resume?
                </h2>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                  Join thousands of job seekers who have improved their
                  interview chances with our AI-powered sentiment analysis.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button
                    size="lg"
                    onClick={() =>
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }
                  >
                    <Heart className="mr-2 h-5 w-5" />
                    Analyze My Resume Now
                  </Button>
                  <Link to="/signup">
                    <Button size="lg" variant="outline">
                      Create Free Account
                    </Button>
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}

import { useState, useCallback, useMemo } from "react";
import { Upload, Link as LinkIcon, FileText, X, AlertTriangle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { jobService, type JobSummary } from "@/lib/services/job-service";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";

interface JobInputStepProps {
  onJobSelected: (jobData: {
    jobId?: string;
    jobContent?: string;
    source: 'url' | 'paste' | 'file' | 'existing';
  }) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function JobInputStep({ onJobSelected, isLoading = false, error }: JobInputStepProps) {
  const { isAuthenticated } = useAuth();
  
  // State for different input methods
  const [jobUrl, setJobUrl] = useState("");
  const [jobContent, setJobContent] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [showIframe, setShowIframe] = useState(false);

  // Fetch user's jobs if authenticated
  const { data: userJobs = [] } = useQuery({
    queryKey: ["user-jobs"],
    queryFn: () => jobService.getUserJobs(),
    enabled: isAuthenticated,
  });

  const allowedTypes = useMemo(
    () => [
      "application/pdf",
      "application/msword", 
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
    []
  );

  // URL handling
  const handleUrlLoad = async () => {
    if (!jobUrl.trim()) return;

    setIsLoadingUrl(true);
    setUrlError(null);

    try {
      // Try to extract job from URL
      const job = await jobService.extractJobFromUrl(jobUrl);
      onJobSelected({
        jobContent: job.description || JSON.stringify(job),
        source: 'url'
      });
    } catch (err) {
      console.error("Failed to extract job from URL:", err);
      setUrlError("Could not extract job content from URL. Please try copy/paste method instead.");
    } finally {
      setIsLoadingUrl(false);
    }
  };

  const handlePreviewUrl = () => {
    if (!jobUrl.trim()) return;
    setShowIframe(true);
    setUrlError(null);
  };

  const handleUseIframeContent = () => {
    // For iframe content, we'll still use the URL extraction API
    // since we can't directly access iframe content due to CORS
    handleUrlLoad();
  };

  // File handling
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

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && allowedTypes.includes(droppedFile.type)) {
        setFile(droppedFile);
      }
    },
    [allowedTypes]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && allowedTypes.includes(selectedFile.type)) {
      setFile(selectedFile);
    }
  };

  const handleFileUpload = async () => {
    if (!file) return;
    
    try {
      const job = await jobService.createJobFromFile(file);
      onJobSelected({
        jobContent: job.description || JSON.stringify(job),
        source: 'file'
      });
    } catch (err) {
      console.error("Failed to process job file:", err);
    }
  };

  // Content handling
  const handleContentSubmit = () => {
    if (!jobContent.trim()) return;
    
    onJobSelected({
      jobContent: jobContent.trim(),
      source: 'paste'
    });
  };

  // Existing job handling
  const handleExistingJobSelect = () => {
    if (!selectedJobId) return;
    
    onJobSelected({
      jobId: selectedJobId,
      source: 'existing'
    });
  };

  const removeFile = () => {
    setFile(null);
  };

  const getFileIcon = (file: File) => {
    if (file.type.includes("pdf")) return "📄";
    if (file.type.includes("word")) return "📝";
    if (file.type.includes("text")) return "📄";
    return "📄";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Step 1: Select Job
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="url" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="url">Job URL</TabsTrigger>
            <TabsTrigger value="paste">Copy & Paste</TabsTrigger>
            <TabsTrigger value="upload">Upload File</TabsTrigger>
            <TabsTrigger value="existing" disabled={!isAuthenticated}>
              My Jobs {!isAuthenticated && "(Login Required)"}
            </TabsTrigger>
          </TabsList>
          
          {/* URL Tab */}
          <TabsContent value="url" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="job-url">Job Posting URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="job-url"
                    type="url"
                    placeholder="https://example.com/job-posting"
                    value={jobUrl}
                    onChange={(e) => {
                      setJobUrl(e.target.value);
                      setShowIframe(false);
                    }}
                    disabled={isLoading || isLoadingUrl}
                  />
                  <Button
                    onClick={handlePreviewUrl}
                    disabled={!jobUrl.trim() || isLoading || isLoadingUrl}
                    variant="outline"
                  >
                    Preview
                  </Button>
                  <Button
                    onClick={handleUrlLoad}
                    disabled={!jobUrl.trim() || isLoading || isLoadingUrl}
                  >
                    {isLoadingUrl ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LinkIcon className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter a job posting URL. Use Preview to see the page, then Extract to analyze.
                </p>
              </div>

              {/* Iframe Preview */}
              {showIframe && jobUrl && (
                <div className="space-y-4">
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted p-3 flex items-center justify-between">
                      <span className="text-sm font-medium">Job Posting Preview</span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleUseIframeContent}
                          disabled={isLoading || isLoadingUrl}
                        >
                          {isLoadingUrl ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : null}
                          Extract Job Details
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowIframe(false)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <iframe
                      src={jobUrl}
                      className="w-full h-96 border-0"
                      title="Job Posting Preview"
                      sandbox="allow-same-origin allow-scripts"
                    />
                  </div>
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      If the job posting doesn't load properly in the preview, click "Extract Job Details"
                      to automatically extract the content, or use the copy/paste method instead.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {urlError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{urlError}</AlertDescription>
                </Alert>
              )}
            </div>
          </TabsContent>

          {/* Copy & Paste Tab */}
          <TabsContent value="paste" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="job-content">Job Description</Label>
                <Textarea
                  id="job-content"
                  placeholder="Paste the job description here..."
                  value={jobContent}
                  onChange={(e) => setJobContent(e.target.value)}
                  rows={8}
                  disabled={isLoading}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Copy and paste the complete job description from the job posting
                </p>
              </div>
              <Button 
                onClick={handleContentSubmit}
                disabled={!jobContent.trim() || isLoading}
                className="w-full"
              >
                Use This Job Description
              </Button>
            </div>
          </TabsContent>

          {/* File Upload Tab */}
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
                  Drop job description file here, or click to browse
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Supports PDF, Word (.doc, .docx), and text files
                </p>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="job-file-upload"
                  disabled={isLoading}
                />
                <Button variant="outline" asChild>
                  <label htmlFor="job-file-upload" className="cursor-pointer">
                    Choose File
                  </label>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{getFileIcon(file)}</span>
                      <div>
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={removeFile} disabled={isLoading}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button 
                  onClick={handleFileUpload} 
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Use This Job File
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Existing Jobs Tab */}
          <TabsContent value="existing" className="space-y-4">
            {isAuthenticated ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="job-select">Select Job</Label>
                  <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a job from your saved jobs" />
                    </SelectTrigger>
                    <SelectContent>
                      {userJobs.map((job) => (
                        <SelectItem key={job.id} value={job.id || ""}>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            {job.title || "Untitled Job"} - {job.company}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={handleExistingJobSelect} 
                  disabled={!selectedJobId || isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Use Selected Job
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  Please log in to select from your saved jobs
                </p>
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
  );
}

import { useState, useCallback, useMemo } from "react";
import {
  Upload,
  FileText,
  X,
  AlertTriangle,
  Loader2,
  User,
} from "lucide-react";
import { extractTextFromFile } from "@/lib/extract-text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resumeService, type Resume } from "@/lib/services/resume-service";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";

interface ResumeSelectionStepProps {
  onResumeSelected: (resumeData: {
    resumeId?: string;
    resumeContent?: string;
    source: "existing" | "paste" | "file";
  }) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function ResumeSelectionStep({
  onResumeSelected,
  isLoading = false,
  error,
}: ResumeSelectionStepProps) {
  const { isAuthenticated } = useAuth();

  // State for different input methods
  const [resumeContent, setResumeContent] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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
    [allowedTypes],
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
      const text = await extractTextFromFile(file);
      onResumeSelected({
        resumeContent: text,
        source: "file",
      });
    } catch (err) {
      console.error("Failed to process resume file:", err);
    }
  };

  // Content handling
  const handleContentSubmit = () => {
    if (!resumeContent.trim()) return;

    onResumeSelected({
      resumeContent: resumeContent.trim(),
      source: "paste",
    });
  };

  // Existing resume handling
  const handleExistingResumeSelect = () => {
    if (!selectedResumeId) return;

    onResumeSelected({
      resumeId: selectedResumeId,
      source: "existing",
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
          <User className="h-5 w-5" />
          Step 2: Select Resume
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs
          defaultValue={isAuthenticated ? "existing" : "paste"}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="existing" disabled={!isAuthenticated}>
              My Resumes {!isAuthenticated && "(Login Required)"}
            </TabsTrigger>
            <TabsTrigger value="paste">Copy & Paste</TabsTrigger>
            <TabsTrigger value="upload">Upload File</TabsTrigger>
          </TabsList>

          {/* Existing Resumes Tab */}
          <TabsContent value="existing" className="space-y-4">
            {isAuthenticated ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="resume-select">Select Resume</Label>
                  <Select
                    value={selectedResumeId}
                    onValueChange={setSelectedResumeId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a resume to analyze" />
                    </SelectTrigger>
                    <SelectContent>
                      {resumes.map((resume) => (
                        <SelectItem key={resume.id} value={resume.id || ""}>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <div className="flex flex-col">
                              <span>{resume.name || "Untitled Resume"}</span>
                              {resume.description && (
                                <span className="text-xs text-muted-foreground">
                                  {resume.description}
                                </span>
                              )}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {resumes.length === 0 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      No resumes found. Create a resume first or use the other
                      options.
                    </p>
                  )}
                </div>
                <Button
                  onClick={handleExistingResumeSelect}
                  disabled={!selectedResumeId || isLoading}
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
                      Use Selected Resume
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  Please log in to select from your saved resumes
                </p>
              </div>
            )}
          </TabsContent>

          {/* Copy & Paste Tab */}
          <TabsContent value="paste" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="resume-content">Resume Content</Label>
                <Textarea
                  id="resume-content"
                  placeholder="Paste your resume content here..."
                  value={resumeContent}
                  onChange={(e) => setResumeContent(e.target.value)}
                  rows={10}
                  disabled={isLoading}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Copy and paste your complete resume content (text format works
                  best)
                </p>
              </div>
              <Button
                onClick={handleContentSubmit}
                disabled={!resumeContent.trim() || isLoading}
                className="w-full"
              >
                Use This Resume Content
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
                  id="resume-file-upload"
                  disabled={isLoading}
                />
                <Button variant="outline" asChild>
                  <label
                    htmlFor="resume-file-upload"
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
                      <span className="text-2xl">{getFileIcon(file)}</span>
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
                      disabled={isLoading}
                    >
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
                      Use This Resume File
                    </>
                  )}
                </Button>
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

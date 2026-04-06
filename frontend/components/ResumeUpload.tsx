import { Upload, Loader2, X, AlertTriangle } from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { extractTextFromFile } from "@/lib/extract-text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resumeService, type Resume } from "@/lib/services/resume-service";
import type {
  ResumePrivacy,
  ResumeUploadResponse,
  ResumeData,
} from "@/types/resume";

interface ResumeUploadProps {
  onUploadSuccess: (response: ResumeUploadResponse) => void;
  onCancel: () => void;
  /** When true, renders without the Card wrapper (for use inside sheets/modals) */
  compact?: boolean;
}

// Helper function to create empty resume data
const getEmptyResumeData = (): ResumeData => ({
  Basics: {
    Name: "",
    Label: "",
    Image: "",
    Email: "",
    Phone: "",
    Url: "",
    Summary: "",
    Location: null,
  },
  Work: [],
  Volunteer: [],
  Education: [],
  Awards: [],
  Certificates: [],
  Publications: [],
  Skills: [],
  Languages: [],
  Interests: [],
  References: [],
  Projects: [],
});

export default function ResumeUpload({
  onUploadSuccess,
  onCancel,
  compact = false,
}: ResumeUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [privacy, setPrivacy] = useState<ResumePrivacy>("private");
  const [isMaster, setIsMaster] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const allowedTypes = useMemo(
    () => [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
      "text/x-markdown",
      "application/json",
      "application/ld+json",
    ],
    [],
  );

  const allowedExtensions = [".pdf", ".doc", ".docx", ".txt", ".md", ".markdown", ".json"];

  function isFileAllowed(file: File): boolean {
    if (allowedTypes.includes(file.type)) return true;
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    return allowedExtensions.includes(ext);
  }

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
      if (droppedFile && isFileAllowed(droppedFile)) {
        setFile(droppedFile);
        if (!name) {
          setName(droppedFile.name.replace(/\.[^/.]+$/, ""));
        }
      } else {
        setError("Please upload a PDF, Word document, Markdown, JSON, or text file.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setError(null);

    if (selectedFile && isFileAllowed(selectedFile)) {
      setFile(selectedFile);
      if (!name) {
        setName(selectedFile.name.replace(/\.[^/.]+$/, ""));
      }
    } else {
      setError("Please upload a PDF, Word document, Markdown, JSON, or text file.");
    }
  };

  // Convert API MetaResume (camelCase) to UI ResumeData (PascalCase keys)
  const mapMetaResumeToResumeData = (
    meta: NonNullable<Resume["metaResume"]>,
  ): ResumeData => {
    const basics = meta?.basics || {};
    const location = basics?.location || null;
    return {
      Basics: {
        Name: basics.name || "",
        Label: basics.label || "",
        Image: basics.image || "",
        Email: basics.email || "",
        Phone: basics.phone || "",
        Url: basics.url || "",
        Summary: basics.summary || "",
        Location: location
          ? {
              Address: location.address || "",
              PostalCode: location.postalCode || "",
              City: location.city || "",
              CountryCode: location.countryCode || "",
              Region: location.region || "",
            }
          : null,
      },
      Work: (meta?.work || []).map((w) => ({
        Name: w.name || "",
        Position: w.position || "",
        Summary: w.summary || "",
        StartDate: w.startDate || "",
        EndDate: w.endDate || "",
        Highlights: Array.isArray(w.highlights) ? w.highlights : [],
        Url: w.url || "",
      })),
      Volunteer: (meta?.volunteer || []).map((v) => ({
        Organization: v.organization || "",
        Position: v.position || "",
        Summary: v.summary || "",
        StartDate: v.startDate || "",
        EndDate: v.endDate || "",
        Highlights: Array.isArray(v.highlights) ? v.highlights : null,
        Url: v.url || "",
      })),
      Education: (meta?.education || []).map((e) => ({
        Institution: e.institution || "",
        Area: e.area || "",
        StudyType: e.studyType || "",
        StartDate: e.startDate || "",
        EndDate: e.endDate || "",
        Score: e.score || "",
        Courses: Array.isArray(e.courses) ? e.courses : null,
        Url: e.url || "",
      })),
      Awards: [], // Not available in current schema
      Certificates: [], // Not available in current schema
      Publications: [], // Not available in current schema
      Skills: (meta?.skills || []).map((s) => ({
        Name: s.name || "",
        Level: s.level || "",
        Keywords: Array.isArray(s.keywords) ? s.keywords : [],
      })),
      Languages: [], // Not available in current schema
      Interests: [], // Not available in current schema
      References: [], // Not available in current schema
      Projects: [], // Not available in current schema

      Meta: undefined,
    };
  };

  const handleUpload = async () => {
    if (!file || !name.trim()) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // Extract text client-side (pdfjs-dist for PDFs, jszip for docx, etc.)
      const rawText = await extractTextFromFile(file);

      // Single API call: sends rawText → API parses with LLM + creates resume
      const savedResume = await resumeService.createResume({
        name: name.trim(),
        rawText,
        privacy,
        isMaster,
      });

      // Map the returned metaResume back to UI format for the success callback
      const meta = savedResume.metaResume;
      const uploadedData: ResumeData = meta
        ? mapMetaResumeToResumeData(meta)
        : getEmptyResumeData();

      const response: ResumeUploadResponse = {
        id: savedResume.id ?? "",
        data: uploadedData,
        message: name.trim(),
        confidence: 0.8,
      };

      onUploadSuccess(response);
    } catch (err) {
      console.error("Resume upload failed:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to upload resume. Please try again.";
      setError(errorMessage);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
  };

  const getFileIcon = (file: File) => {
    if (file.type.includes("pdf")) return "📄";
    if (file.type.includes("word")) return "📝";
    return "📄";
  };

  const content = (
    <div className="space-y-6">
        {/* File Upload Area */}
        <div className="space-y-4">
          <Label>Resume File</Label>
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
                Supports PDF, Word (.doc, .docx), markdown, JSON, and text files
              </p>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,.json"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <Button variant="outline" asChild>
                <label htmlFor="file-upload" className="cursor-pointer">
                  Choose File
                </label>
              </Button>
            </div>
          ) : (
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
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Resume Settings */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="resume-name">Resume Name</Label>
            <Input
              id="resume-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Software Engineer Resume"
              disabled={isUploading}
            />
          </div>

          <div className="space-y-2">
            <Label>Privacy Setting</Label>
            <Select
              value={privacy}
              onValueChange={(value: ResumePrivacy) => setPrivacy(value)}
              disabled={isUploading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">
                  Private - Only visible to you
                </SelectItem>
                <SelectItem value="recruiter_only">
                  Recruiter Only - Visible to verified recruiters
                </SelectItem>
                <SelectItem value="public">
                  Public - Searchable by anyone
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="master-resume"
              checked={isMaster}
              onCheckedChange={(checked) => setIsMaster(checked === true)}
              disabled={isUploading}
            />
            <Label htmlFor="master-resume" className="text-sm">
              Mark as Master Resume
            </Label>
          </div>
          {isMaster && (
            <p className="text-xs text-muted-foreground ml-6">
              Master resumes can be used as templates to create targeted
              variations.
            </p>
          )}
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Processing resume...</span>
              <span className="text-sm text-muted-foreground">
                {uploadProgress}%
              </span>
            </div>
            <Progress value={uploadProgress} className="w-full" />
          </div>
        )}

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleUpload}
            disabled={!file || !name.trim() || isUploading}
            className="flex-1"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Resume
              </>
            )}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isUploading}>
            Cancel
          </Button>
        </div>
    </div>
  );

  if (compact) return content;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload Resume
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

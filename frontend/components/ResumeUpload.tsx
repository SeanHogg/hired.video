import { Upload, Loader2, X, AlertTriangle } from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { extractTextFromFile, parseJsonResumeFile } from "@/lib/extract-text";
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
  basics: {
    name: "",
    label: "",
    image: "",
    email: "",
    phone: "",
    url: "",
    summary: "",
    location: null,
  },
  work: [],
  volunteer: [],
  education: [],
  awards: [],
  certificates: [],
  publications: [],
  skills: [],
  languages: [],
  interests: [],
  references: [],
  projects: [],
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

  // Map canonical `Resume["content"]` → UI `ResumeData`. The shapes are
  // the same (both JSON-Resume camelCase), so this is mostly pass-through
  // with field-level "?? default" fallbacks for missing values. Renamed
  // from the legacy `mapMetaResumeToResumeData(meta: Resume["metaResume"])`
  // when the legacy shape was deleted on 2026-04-20.
  const mapMetaResumeToResumeData = (
    meta: NonNullable<Resume["content"]>,
  ): ResumeData => {
    const basics = meta?.basics ?? ({} as NonNullable<NonNullable<Resume["content"]>["basics"]>);
    const location = basics?.location ?? null;
    return {
  basics: {
        name: basics.name || "",
        label: basics.label || "",
        image: basics.image || "",
        email: basics.email || "",
        phone: basics.phone || "",
        url: basics.url || "",
        summary: basics.summary || "",
        location: location
          ? {
              address: location.address || "",
              postalCode: location.postalCode || "",
              city: location.city || "",
              countryCode: location.countryCode || "",
              region: location.region || "",
            }
          : null,
      },
      work: (meta?.work || []).map((w) => ({
        name: w.name || "",
        position: w.position || "",
        summary: w.summary || "",
        startDate: w.startDate || "",
        endDate: w.endDate || "",
        highlights: Array.isArray(w.highlights) ? w.highlights : [],
        url: w.url || "",
      })),
      volunteer: (meta?.volunteer || []).map((v) => ({
        organization: v.organization || "",
        position: v.position || "",
        summary: v.summary || "",
        startDate: v.startDate || "",
        endDate: v.endDate || "",
        highlights: Array.isArray(v.highlights) ? v.highlights : null,
        url: v.url || "",
      })),
      education: (meta?.education || []).map((e) => ({
        institution: e.institution || "",
        area: e.area || "",
        studyType: e.studyType || "",
        startDate: e.startDate || "",
        endDate: e.endDate || "",
        score: e.score || "",
        courses: Array.isArray(e.courses) ? e.courses : null,
        url: e.url || "",
      })),
      awards: (meta?.awards || []).map((a) => ({
        title: a.title || "",
        date: a.date || "",
        awarder: a.awarder || "",
        summary: a.summary || "",
      })),
      certificates: (meta?.certificates || []).map((c) => ({
        name: c.name || "",
        date: c.date || "",
        issuer: c.issuer || "",
        url: c.url || "",
      })),
      publications: (meta?.publications || []).map((p) => ({
        name: p.name || "",
        publisher: p.publisher || "",
        releaseDate: p.releaseDate || "",
        url: p.url || "",
        summary: p.summary || "",
      })),
      skills: (meta?.skills || []).map((s) => ({
        name: s.name || "",
        level: s.level || "",
        keywords: Array.isArray(s.keywords) ? s.keywords : [],
      })),
      languages: (meta?.languages || []).map((l) => ({
        language: l.language || "",
        fluency: l.fluency || "",
      })),
      interests: (meta?.interests || []).map((i) => ({
        name: i.name || "",
        keywords: Array.isArray(i.keywords) ? i.keywords : [],
      })),
      references: (meta?.references || []).map((r) => ({
        name: r.name || "",
        reference: r.reference || "",
      })),
      projects: (meta?.projects || []).map((p) => ({
        name: p.name || "",
        description: p.description || "",
        highlights: Array.isArray(p.highlights) ? p.highlights : [],
        keywords: Array.isArray(p.keywords) ? p.keywords : [],
        startDate: p.startDate || "",
        endDate: p.endDate || "",
        url: p.url || "",
        roles: Array.isArray(p.roles) ? p.roles : [],
        entity: p.entity || "",
        type: p.type || "",
      })),

      meta: undefined,
    };
  };

  const handleUpload = async () => {
    if (!file || !name.trim()) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // If it's a JSON Resume export, parse structure client-side and
      // send as `parsedContent` — preserves dates + highlights exactly
      // as authored, skipping the lossy text->AI roundtrip.
      const jsonResume = await parseJsonResumeFile(file);

      const savedResume = jsonResume
        ? await resumeService.createResume({
            title: name.trim(),
            parsedContent: jsonResume,
            privacy,
            isMaster,
          })
        : await resumeService.createResume({
            title: name.trim(),
            rawText: await extractTextFromFile(file),
            privacy,
            isMaster,
          });

      // Canonical Resume shape post-2026-04-20 refactor: `content` IS the
      // JSON-Resume document directly (no `metaResume` envelope). Map the
      // content if present, else fall back to empty. `mapMetaResumeToResumeData`
      // tolerantly handles either legacy `metaResume` OR canonical `content`.
      const payload =
        (savedResume as any).content ??
        (savedResume as any).metaResume ??
        null;
      const uploadedData: ResumeData = payload
        ? mapMetaResumeToResumeData(payload)
        : getEmptyResumeData();

      const response: ResumeUploadResponse = {
        id: savedResume.id ?? "",
        content: uploadedData,
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

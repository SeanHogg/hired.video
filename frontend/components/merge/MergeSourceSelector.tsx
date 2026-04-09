import React, { useState, useCallback } from "react";
import { FileText, Upload, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ResumeWithOwnership } from "@/lib/services/resume-service";

interface MergeSourceSelectorProps {
  resumes: ResumeWithOwnership[];
  targetResumeId: string | null;
  onSelectSource: (sourceId: string) => void;
  onSelectTarget: (targetId: string) => void;
  onFileSelect: (file: File) => void;
  selectedSourceId: string | null;
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "application/json",
];

export default function MergeSourceSelector({
  resumes,
  targetResumeId,
  onSelectSource,
  onSelectTarget,
  onFileSelect,
  selectedSourceId,
}: MergeSourceSelectorProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect],
  );

  const ownedResumes = resumes.filter((r) => r.id !== targetResumeId);

  return (
    <div className="space-y-4">
      {/* Target selection */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Merge Into (Target)</h4>
        <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
          {resumes.map((r) => (
            <button
              key={r.id}
              className={cn(
                "w-full text-left flex items-center gap-2 p-2 rounded-md text-sm transition-colors",
                r.id === targetResumeId
                  ? "bg-blue-50 dark:bg-blue-950 border border-blue-300"
                  : "hover:bg-muted",
              )}
              onClick={() => onSelectTarget(r.id!)}
            >
              {r.id === targetResumeId && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{r.name || "Untitled"}</span>
              {r.isMaster && (
                <Badge variant="outline" className="text-xs ml-auto shrink-0">
                  Master
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Source selection */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Merge From (Source)</h4>
        <Tabs defaultValue="resume">
          <TabsList className="mb-2">
            <TabsTrigger value="resume">Existing Resume</TabsTrigger>
            <TabsTrigger value="file">Upload File</TabsTrigger>
          </TabsList>

          <TabsContent value="resume">
            <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2">
              {ownedResumes.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">No other resumes available</p>
              ) : (
                ownedResumes.map((r) => (
                  <button
                    key={r.id}
                    className={cn(
                      "w-full text-left flex items-center gap-2 p-2 rounded-md text-sm transition-colors",
                      r.id === selectedSourceId
                        ? "bg-green-50 dark:bg-green-950 border border-green-300"
                        : "hover:bg-muted",
                    )}
                    onClick={() => onSelectSource(r.id!)}
                  >
                    {r.id === selectedSourceId && (
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                    )}
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{r.name || "Untitled"}</span>
                    {r.isMaster && (
                      <Badge variant="outline" className="text-xs ml-auto shrink-0">
                        Master
                      </Badge>
                    )}
                    {r.parentId && (
                      <Badge variant="outline" className="text-xs ml-auto shrink-0">
                        Variant
                      </Badge>
                    )}
                  </button>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="file">
            <div
              className={cn(
                "border-2 border-dashed rounded-md p-6 text-center transition-colors",
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag & drop a resume file, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mb-3">PDF, Word (.docx), Text, Markdown, JSON</p>
              <label>
                <Button variant="outline" size="sm" asChild>
                  <span>Choose File</span>
                </Button>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt,.md,.json"
                  onChange={handleFileInput}
                />
              </label>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, X, Camera } from "lucide-react";
import { initialsFromWords } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { alertDialog } from "@/lib/dialogs";

interface ProfileAvatarEditorProps {
  currentAvatarUrl?: string;
  userName?: string;
  onAvatarSelect: (file: File) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

/**
 * Reusable component for selecting and previewing profile avatar
 * Used in video generation wizard and other profile editing contexts
 */
export function ProfileAvatarEditor({
  currentAvatarUrl,
  userName = "User",
  onAvatarSelect,
  isLoading = false,
  disabled = false,
}: ProfileAvatarEditorProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(
    currentAvatarUrl,
  );
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      await alertDialog({ title: t("dialogs.avatar.invalidFileTitle"), description: t("dialogs.avatar.invalidFileType") });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      await alertDialog({ title: t("dialogs.avatar.invalidFileTitle"), description: t("dialogs.avatar.invalidFileSize") });
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Notify parent
    onAvatarSelect(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleClear = () => {
    setPreviewUrl(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const initials = initialsFromWords(userName);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Profile Avatar
        </CardTitle>
        <CardDescription>
          Select a profile picture to include in your video
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Avatar Preview */}
        <div className="flex justify-center">
          <Avatar className="h-24 w-24">
            <AvatarImage src={previewUrl} alt={userName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </div>

        {/* Upload Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && !isLoading && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              if (!disabled && !isLoading) {
                fileInputRef.current?.click();
              }
            }
          }}
          role="button"
          tabIndex={disabled || isLoading ? -1 : 0}
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          } ${disabled || isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleInputChange}
            disabled={disabled || isLoading}
            className="hidden"
          />

          <div className="space-y-2">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="text-sm font-medium">
              Drag and drop your image here
            </div>
            <div className="text-xs text-muted-foreground">
              or click to browse (PNG, JPG, GIF up to 5MB)
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isLoading}
            className="flex-1"
            variant="outline"
          >
            <Upload className="h-4 w-4 mr-2" />
            Choose Image
          </Button>
          {previewUrl && (
            <Button
              onClick={handleClear}
              disabled={disabled || isLoading}
              variant="ghost"
              size="icon"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Info Text */}
        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
          Your profile picture will be displayed in the video to personalize it
          and make it more engaging to viewers.
        </div>
      </CardContent>
    </Card>
  );
}

export default ProfileAvatarEditor;


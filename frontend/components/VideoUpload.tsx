import React, { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload,
  Play,
  Pause,
  RotateCcw,
  X,
  Video,
  FileVideo,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadVideo } from "@/lib/services/upload-service";

interface VideoUploadProps {
  onVideoUploaded: (videoData: VideoUploadResult) => void;
  onCancel?: () => void;
  maxSizeBytes?: number;
  acceptedFormats?: string[];
  className?: string;
  /** If true, automatically upload to server after processing. Default: false */
  autoUpload?: boolean;
}

interface VideoUploadResult {
  file: File;
  /** Local blob URL or server URL depending on autoUpload setting */
  url: string;
  /** Server URL if uploaded to server */
  serverUrl?: string;
  duration: number;
  thumbnail?: string;
  metadata: {
    size: number;
    format: string;
    resolution?: string;
    bitrate?: number;
  };
}

const DEFAULT_ACCEPTED_FORMATS = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_DURATION = 300; // 5 minutes

export function VideoUpload({
  onVideoUploaded,
  onCancel,
  maxSizeBytes = MAX_FILE_SIZE,
  acceptedFormats = DEFAULT_ACCEPTED_FORMATS,
  className,
  autoUpload = false,
}: VideoUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{
    duration?: number;
    width?: number;
    height?: number;
    size?: number;
    format?: string;
    resolution?: string;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const validateFile = (file: File): string | null => {
    if (!acceptedFormats.includes(file.type)) {
      return `Unsupported format. Please use: ${acceptedFormats.map((f) => f.split("/")[1]).join(", ")}`;
    }

    if (file.size > maxSizeBytes) {
      return `File too large. Maximum size: ${Math.round(maxSizeBytes / (1024 * 1024))}MB`;
    }

    return null;
  };

  const generateThumbnail = (video: HTMLVideoElement): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.drawImage(video, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    });
  };

  const extractVideoMetadata = (
    video: HTMLVideoElement,
    file: File,
  ): {
    duration: number;
    width: number;
    height: number;
    size: number;
    format: string;
    resolution: string;
  } => {
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      size: file.size,
      format: file.type,
      resolution: `${video.videoWidth}x${video.videoHeight}`,
    };
  };

  const processVideo = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setUploadComplete(false);

    try {
      const localUrl = URL.createObjectURL(file);
      setPreviewUrl(localUrl);

      // Create video element for metadata extraction
      const video = document.createElement("video");
      video.src = localUrl;

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
      });

      // Validate duration
      if (video.duration > MAX_DURATION) {
        throw new Error(
          `Video too long. Maximum duration: ${MAX_DURATION / 60} minutes`,
        );
      }

      const metadata = extractVideoMetadata(video, file);
      setVideoMetadata(metadata);

      // Generate thumbnail
      video.currentTime = Math.min(2, video.duration / 2); // 2 seconds or middle
      await new Promise((resolve) => {
        video.onseeked = resolve;
      });

      if (videoRef.current) {
        videoRef.current.src = localUrl;
      }

      const thumbnail = await generateThumbnail(video);

      // Upload to server if autoUpload is enabled
      let serverUrl: string | undefined;
      if (autoUpload) {
        setIsProcessing(false);
        setIsUploading(true);
        setUploadProgress(0);

        try {
          const uploadResponse = await uploadVideo(file, (progress) => {
            setUploadProgress(progress);
          });
          serverUrl = uploadResponse.url;
          setUploadComplete(true);
        } catch (uploadErr) {
          throw new Error(
            uploadErr instanceof Error
              ? uploadErr.message
              : "Failed to upload video to server"
          );
        } finally {
          setIsUploading(false);
        }
      }

      const result: VideoUploadResult = {
        file,
        url: serverUrl || localUrl,
        serverUrl,
        duration: video.duration,
        thumbnail,
        metadata: {
          size: file.size,
          format: file.type,
          resolution: metadata.resolution,
          bitrate: Math.round((file.size * 8) / video.duration / 1000), // Rough estimate
        },
      };

      onVideoUploaded(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process video");
    } finally {
      setIsProcessing(false);
      setIsUploading(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    await processVideo(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const togglePlayback = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const resetUpload = () => {
    setPreviewUrl(null);
    setVideoMetadata(null);
    setError(null);
    setUploadProgress(0);
    setIsProcessing(false);
    setIsUploading(false);
    setUploadComplete(false);
    setIsPlaying(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Card className={cn("w-full max-w-2xl mx-auto", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Upload Video Resume
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <X className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!previewUrl ? (
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25",
              "hover:border-primary/50 hover:bg-primary/5",
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <FileVideo className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">
              Upload Your Video Resume
            </h3>
            <p className="text-muted-foreground mb-4">
              Drag and drop your video file here, or click to browse
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Supported formats: MP4, WebM, MOV, AVI • Max size:{" "}
              {Math.round(maxSizeBytes / (1024 * 1024))}MB • Max duration:{" "}
              {MAX_DURATION / 60} minutes
            </p>

            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="mb-2"
            >
              <Upload className="h-4 w-4 mr-2" />
              Choose Video File
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept={acceptedFormats.join(",")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Video Preview */}
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                controls={false}
              />

              {/* Custom Controls */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={togglePlayback}
                  className="bg-black/50 hover:bg-black/70"
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>

                <div className="flex-1 text-white text-sm">
                  {videoMetadata && (
                    <span>
                      {Math.round(videoMetadata.duration)}s •{" "}
                      {videoMetadata.resolution}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Video Info */}
            {videoMetadata && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Duration:</span>{" "}
                  {Math.round(videoMetadata.duration)}s
                </div>
                <div>
                  <span className="font-medium">Size:</span>{" "}
                  {Math.round(videoMetadata.size / (1024 * 1024))}MB
                </div>
                <div>
                  <span className="font-medium">Resolution:</span>{" "}
                  {videoMetadata.resolution}
                </div>
                <div>
                  <span className="font-medium">Format:</span>{" "}
                  {videoMetadata.format.split("/")[1].toUpperCase()}
                </div>
              </div>
            )}

            {/* Processing Progress */}
            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing video...
                  </span>
                </div>
              </div>
            )}

            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading to server...
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            {/* Upload Complete */}
            {uploadComplete && (
              <Alert>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-600">
                  Video uploaded successfully!
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={resetUpload}
                variant="outline"
                disabled={isProcessing || isUploading}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Choose Different Video
              </Button>
              {onCancel && (
                <Button
                  onClick={onCancel}
                  variant="outline"
                  disabled={isProcessing || isUploading}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Hidden canvas for thumbnail generation */}
        <canvas ref={canvasRef} className="hidden" />
      </CardContent>
    </Card>
  );
}

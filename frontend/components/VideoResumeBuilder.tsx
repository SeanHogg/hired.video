import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Video, Wand2, Save, Eye, Plus, X, Info } from "lucide-react";
import { VideoUpload } from "./VideoUpload";
import { ResumeData } from "@/types/resume";

interface VideoResumeBuilderProps {
  resumeData?: ResumeData;
  onSave: (videoResume: VideoResumeData) => void;
  onCancel: () => void;
}

interface VideoResumeData {
  id?: string;
  title: string;
  description: string;
  videoFile?: File;
  videoUrl?: string;
  thumbnail?: string;
  duration?: number;
  tags: string[];
  visibility: "public" | "private" | "unlisted";
  resumeData?: ResumeData;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    version: string;
  };
}

interface VideoUploadResult {
  file: File;
  url: string;
  duration: number;
  thumbnail?: string;
  metadata: {
    size: number;
    format: string;
    resolution?: string;
    bitrate?: number;
  };
}

export function VideoResumeBuilder({
  resumeData,
  onSave,
  onCancel,
}: VideoResumeBuilderProps) {
  const [activeTab, setActiveTab] = useState("upload");
  const [videoResume, setVideoResume] = useState<VideoResumeData>({
    title: resumeData?.basics?.name
      ? `${resumeData.basics.name} - Video Resume`
      : "My Video Resume",
    description: "",
    tags: [],
    visibility: "private",
    resumeData,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: "1.0",
    },
  });

  const [newTag, setNewTag] = useState("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [uploadedVideo, setUploadedVideo] = useState<VideoUploadResult | null>(
    null,
  );

  const handleVideoUploaded = (videoData: VideoUploadResult) => {
    setUploadedVideo(videoData);
    setVideoResume((prev) => ({
      ...prev,
      videoFile: videoData.file,
      videoUrl: videoData.url,
      thumbnail: videoData.thumbnail,
      duration: videoData.duration,
      metadata: {
        ...prev.metadata,
        updatedAt: new Date(),
      },
    }));
    setActiveTab("details");
  };

  const handleAddTag = () => {
    if (newTag.trim() && !videoResume.tags.includes(newTag.trim())) {
      setVideoResume((prev) => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()],
      }));
      setNewTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setVideoResume((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  };

  const handleGenerateAIVideo = async () => {
    setIsGeneratingAI(true);
    try {
      // TODO: Implement AI video generation
      // This would call an API to generate a video from resume data
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Simulate API call

      // Mock generated video
      const mockVideo = {
        file: new File([""], "ai-generated-video.mp4", { type: "video/mp4" }),
        url: "/mock-ai-video.mp4",
        duration: 120,
        thumbnail: "/mock-thumbnail.jpg",
        metadata: {
          size: 15 * 1024 * 1024, // 15MB
          format: "video/mp4",
          resolution: "1920x1080",
          bitrate: 1000,
        },
      };

      handleVideoUploaded(mockVideo);
    } catch (error) {
      console.error("Failed to generate AI video:", error);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleSave = () => {
    if (!uploadedVideo) {
      alert("Please upload or generate a video first");
      return;
    }

    onSave(videoResume);
  };

  const canSave = uploadedVideo && videoResume.title.trim();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Video className="h-8 w-8" />
            Create Video Resume
          </h1>
          <p className="text-muted-foreground mt-1">
            Upload your own video or let AI generate one from your resume
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Video Resume
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload">Upload Video</TabsTrigger>
          <TabsTrigger value="ai-generate">AI Generate</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <VideoUpload
            onVideoUploaded={handleVideoUploaded}
            onCancel={onCancel}
          />
        </TabsContent>

        <TabsContent value="ai-generate" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5" />
                AI Video Generation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Our AI will create a professional video resume using your
                  resume data, including voice narration and visual elements.
                </AlertDescription>
              </Alert>

              {resumeData ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <h3 className="font-semibold mb-2">Resume Data Preview</h3>
                    <div className="text-sm space-y-1">
                      <p>
                        <strong>name:</strong>{" "}
                        {resumeData.basics?.name || "Not provided"}
                      </p>
                      <p>
                        <strong>title:</strong>{" "}
                        {resumeData.basics?.label || "Not provided"}
                      </p>
                      <p>
                        <strong>summary:</strong>{" "}
                        {resumeData.basics?.summary?.substring(0, 100) ||
                          "Not provided"}
                        ...
                      </p>
                      <p>
                        <strong>Experience:</strong>{" "}
                        {resumeData.work?.length || 0} positions
                      </p>
                      <p>
                        <strong>Education:</strong>{" "}
                        {resumeData.education?.length || 0} entries
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={handleGenerateAIVideo}
                    disabled={isGeneratingAI}
                    className="w-full"
                    size="lg"
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    {isGeneratingAI
                      ? "Generating Video..."
                      : "Generate AI Video Resume"}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    No resume data available. Please create or upload a resume
                    first.
                  </p>
                  <Button variant="outline">Go to Resume Builder</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Video Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={videoResume.title}
                  onChange={(e) =>
                    setVideoResume((prev) => ({
                      ...prev,
                      title: e.target.value,
                    }))
                  }
                  placeholder="Enter video resume title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={videoResume.description}
                  onChange={(e) =>
                    setVideoResume((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Describe your video resume..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Add a tag"
                    onKeyPress={(e) => e.key === "Enter" && handleAddTag()}
                  />
                  <Button onClick={handleAddTag} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {videoResume.tags.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {tag}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => handleRemoveTag(tag)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="visibility">Visibility</Label>
                <select
                  id="visibility"
                  value={videoResume.visibility}
                  onChange={(e) =>
                    setVideoResume((prev) => ({
                      ...prev,
                      visibility: e.target.value as
                        | "public"
                        | "private"
                        | "unlisted",
                    }))
                  }
                  className="w-full p-2 border rounded-md"
                >
                  <option value="private">Private - Only you can see</option>
                  <option value="unlisted">
                    Unlisted - Anyone with link can see
                  </option>
                  <option value="public">Public - Visible to everyone</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {uploadedVideo ? (
                <div className="space-y-4">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden">
                    <video
                      src={uploadedVideo.url}
                      controls
                      className="w-full h-full object-contain"
                      poster={uploadedVideo.thumbnail}
                    />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">
                      {videoResume.title}
                    </h3>
                    {videoResume.description && (
                      <p className="text-muted-foreground">
                        {videoResume.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>
                        Duration: {Math.round(uploadedVideo.duration)}s
                      </span>
                      <span>
                        Size:{" "}
                        {Math.round(
                          uploadedVideo.metadata.size / (1024 * 1024),
                        )}
                        MB
                      </span>
                      <span>
                        Resolution: {uploadedVideo.metadata.resolution}
                      </span>
                    </div>

                    {videoResume.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {videoResume.tags.map((tag, index) => (
                          <Badge key={index} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No video uploaded yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

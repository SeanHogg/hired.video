import React, { useState, useCallback } from "react";
import {
  X,
  Image,
  Link,
  Globe,
  Lock,
  Users,
  Upload,
  Loader2,
  AlertCircle,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

import { createFeedPost, getLinkPreview } from "@/lib/services/feed-service";
import { useAuth } from "@/lib/auth";
import type {
  CreateFeedPostRequest,
  LinkPreviewResponse,
  CreateFeedPostMediaRequest,
} from "@/types/feed";

interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
  onPostCreated: () => void;
}

export default function CreatePostModal({
  open,
  onClose,
  onPostCreated,
}: CreatePostModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [content, setContent] = useState("");
  const [privacy, setPrivacy] = useState<'Public' | 'Private' | 'Connections'>('Public');
  const [linkUrl, setLinkUrl] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);

  // Link preview state
  const [linkPreview, setLinkPreview] = useState<LinkPreviewResponse | null>(null);
  const [linkPreviewLoading, setLinkPreviewLoading] = useState(false);

  // Handle content change with hashtag/mention extraction
  const handleContentChange = useCallback((value: string) => {
    setContent(value);
  }, []);

  // Handle link URL change and preview generation
  const handleLinkUrlChange = useCallback(async (url: string) => {
    setLinkUrl(url);

    if (!url.trim()) {
      setLinkPreview(null);
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
      setLinkPreviewLoading(true);
      try {
        const preview = await getLinkPreview({ url });
        setLinkPreview(preview);
      } catch (error) {
        console.warn('Failed to get link preview:', error);
        setLinkPreview(null);
      } finally {
        setLinkPreviewLoading(false);
      }
    } catch {
      // Invalid URL, clear preview
      setLinkPreview(null);
    }
  }, []);

  // Handle media file selection
  const handleMediaSelect = useCallback((files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files);
    // Limit to 4 files total
    const totalFiles = [...mediaFiles, ...newFiles].slice(0, 4);
    setMediaFiles(totalFiles);
  }, [mediaFiles]);

  // Remove media file
  const removeMediaFile = useCallback((index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!content.trim() && mediaFiles.length === 0 && !linkUrl.trim()) {
      setError("Please add some content, media, or a link to your post");
      return;
    }

    if (!user) {
      setError("You must be logged in to create a post");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Prepare media data (in a real app, you'd upload files first)
      const media: CreateFeedPostMediaRequest[] = mediaFiles.map((file, index) => ({
        mediaType: file.type.startsWith('image/') ? 'Image' : 'Video',
        mediaUrl: URL.createObjectURL(file), // Temporary URL for demo
        thumbnailUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        altText: `Uploaded ${file.type.startsWith('image/') ? 'image' : 'video'}`,
        displayOrder: index,
      }));

      const request: CreateFeedPostRequest = {
        content: content.trim(),
        privacy,
        linkUrl: linkUrl.trim() || undefined,
        media,
      };

      await createFeedPost(request);

      // Reset form
      setContent("");
      setPrivacy('Public');
      setLinkUrl("");
      setMediaFiles([]);
      setLinkPreview(null);

      onPostCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setLoading(false);
    }
  }, [content, privacy, linkUrl, mediaFiles, user, onPostCreated, onClose]);

  // Handle modal close
  const handleClose = useCallback(() => {
    if (!loading) {
      setContent("");
      setPrivacy('Public');
      setLinkUrl("");
      setMediaFiles([]);
      setLinkPreview(null);
      setError(null);
      onClose();
    }
  }, [loading, onClose]);

  // Extract hashtags and mentions for preview
  const extractTags = useCallback((text: string) => {
    const hashtags = text.match(/(?<!\w)#(\w+)/g) || [];
    const mentions = text.match(/(?<!\w)@(\w+)/g) || [];
    return { hashtags, mentions };
  }, []);

  const { hashtags, mentions } = extractTags(content);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Create Post
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Content */}
          <div>
            <Label htmlFor="content">What's on your mind?</Label>
            <Textarea
              id="content"
              placeholder="Share your thoughts, achievements, or questions..."
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              className="min-h-[120px] mt-2"
              disabled={loading}
            />
            {(hashtags.length > 0 || mentions.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1">
                {hashtags.map((tag, index) => (
                  <Badge key={`hashtag-${index}`} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {mentions.map((mention, index) => (
                  <Badge key={`mention-${index}`} variant="outline" className="text-xs">
                    {mention}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Link URL */}
          <div>
            <Label htmlFor="linkUrl">Link (optional)</Label>
            <div className="relative mt-2">
              <Link className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                id="linkUrl"
                type="url"
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => handleLinkUrlChange(e.target.value)}
                className="pl-10"
                disabled={loading}
              />
              {linkPreviewLoading && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin" />
              )}
            </div>

            {/* Link Preview */}
            {linkPreview && (
              <div className="mt-3 p-3 border rounded-lg bg-muted/50">
                <div className="flex items-start gap-3">
                  {linkPreview.imageUrl && (
                    <img
                      src={linkPreview.imageUrl}
                      alt={linkPreview.title}
                      className="w-16 h-16 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm line-clamp-2">
                      {linkPreview.title}
                    </h4>
                    {linkPreview.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {linkPreview.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {linkPreview.siteName || new URL(linkPreview.url).hostname}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Media Upload */}
          <div>
            <Label>Media (optional)</Label>
            <div className="mt-2">
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(e) => handleMediaSelect(e.target.files)}
                className="hidden"
                id="media-upload"
                disabled={loading || mediaFiles.length >= 4}
              />
              <Label
                htmlFor="media-upload"
                className={`flex items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  mediaFiles.length >= 4
                    ? 'border-muted-foreground/50 cursor-not-allowed'
                    : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                }`}
              >
                <div className="text-center">
                  <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {mediaFiles.length >= 4
                      ? 'Maximum 4 files reached'
                      : 'Click to upload images or videos'
                    }
                  </p>
                </div>
              </Label>
            </div>

            {/* Media Preview */}
            {mediaFiles.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {mediaFiles.map((file, index) => (
                  <div key={index} className="relative group">
                    {file.type.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Upload ${index + 1}`}
                        className="w-full h-20 object-cover rounded"
                      />
                    ) : (
                      <video
                        src={URL.createObjectURL(file)}
                        className="w-full h-20 object-cover rounded"
                      />
                    )}
                    <button
                      onClick={() => removeMediaFile(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      disabled={loading}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Privacy Settings */}
          <div>
            <Label>Privacy</Label>
            <Select
              value={privacy}
              onValueChange={(value: 'Public' | 'Private' | 'Connections') => setPrivacy(value)}
              disabled={loading}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Public">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Public
                  </div>
                </SelectItem>
                <SelectItem value="Connections">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Connections only
                  </div>
                </SelectItem>
                <SelectItem value="Private">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Private
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || (!content.trim() && mediaFiles.length === 0 && !linkUrl.trim())}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Post"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
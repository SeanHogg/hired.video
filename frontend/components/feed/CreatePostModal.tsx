import React, { useState, useCallback } from "react";
import { ZodError } from "zod";
import {
  X,
  Globe,
  Lock,
  Users,
  Briefcase,
  Loader2,
  AlertCircle,
  Video,
  Image,
  FileText,
  Smile,
  Calendar,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

import { createFeedPost } from "@/lib/services/feed-service";
import { useAuth } from "@/lib/auth";
import type {
  CreateFeedPostRequest,
  CreateFeedPostMediaRequest,
} from "@/types/feed";
import MediaPicker from "@/components/shared/MediaPicker";
import { LinkPreviewCard } from "@/components/feed/LinkPreviewCard";
import { firstUrlIn, useComposerLinkPreview } from "@/components/feed/useComposerLinkPreview";

interface PostMediaItem {
  url: string;
  mediaType: "image" | "video";
}

type PostMode = "text" | "video" | "photo" | "article";
type Privacy = "Public" | "recruiter" | "Connections" | "Private";

interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
  onPostCreated: () => void;
  initialMode?: PostMode;
}

const PRIVACY_OPTIONS: { value: Privacy; label: string; icon: React.ReactNode }[] = [
  { value: "Public", label: "Anyone", icon: <Globe className="h-3.5 w-3.5" /> },
  { value: "recruiter", label: "Recruiters only", icon: <Briefcase className="h-3.5 w-3.5" /> },
  { value: "Connections", label: "Connections", icon: <Users className="h-3.5 w-3.5" /> },
  { value: "Private", label: "Only me", icon: <Lock className="h-3.5 w-3.5" /> },
];

export default function CreatePostModal({
  open,
  onClose,
  onPostCreated,
  initialMode = "text",
}: CreatePostModalProps) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<PostMode>(initialMode);
  const [content, setContent] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("Public");
  const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
  const [mediaItems, setMediaItems] = useState<PostMediaItem[]>([]);
  // OpenGraph card for the first URL in the text (#1968) — clears itself
  // when the text loses the URL (incl. the post/close resets below).
  const { preview: linkPreview, loading: linkPreviewLoading } = useComposerLinkPreview(content);

  const initials = (user?.name || user?.email || "?")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const avatar = (user as any)?.avatar ?? "";

  const addMediaItem = useCallback((item: PostMediaItem) => {
    setMediaItems((prev) => [...prev, item].slice(0, 4));
  }, []);

  const removeMediaItem = useCallback((index: number) => {
    setMediaItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const currentPrivacy = PRIVACY_OPTIONS.find((p) => p.value === privacy)!;

  const handleSubmit = useCallback(async () => {
    if (!content.trim() && mediaItems.length === 0) {
      setError("Add some content before posting");
      return;
    }
    if (!user) {
      setError("You must be logged in to post");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const media: CreateFeedPostMediaRequest[] = mediaItems.map((item, index) => ({
        mediaType: item.mediaType === "image" ? "Image" : "Video",
        mediaUrl: item.url,
        thumbnailUrl: item.mediaType === "image" ? item.url : undefined,
        altText: `Uploaded ${item.mediaType}`,
        displayOrder: index,
      }));

      // Persist the composer mode as the post kind (gap #1828): "article"
      // posts render long-form; a video attachment makes it a "video" post;
      // everything else is "text" (photo posts are text + image media).
      const kind = mode === "article" ? "article" : mode === "video" ? "video" : "text";
      // Only the previewed URL is sent — the server re-resolves the card
      // through its cached unfurl rather than trusting client metadata.
      const linkUrl = linkPreview?.url ?? firstUrlIn(content) ?? undefined;
      const request: CreateFeedPostRequest = {
        content: content.trim(),
        kind,
        ...(linkUrl ? { linkUrl } : {}),
        privacy,
        media,
      };

      await createFeedPost(request);

      setContent("");
      setPrivacy("Public");
      setMediaItems([]);
      setMode("text");

      onPostCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ZodError ? err.issues[0].message : err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setLoading(false);
    }
  }, [content, privacy, mediaItems, mode, user, linkPreview, onPostCreated, onClose]);

  const handleClose = useCallback(() => {
    if (!loading) {
      setContent("");
      setPrivacy("Public");
      setMediaItems([]);
      setError(null);
      setMode("text");
      onClose();
    }
  }, [loading, onClose]);

  const extractTags = (text: string) => ({
    hashtags: text.match(/(?<!\w)#(\w+)/g) || [],
    mentions: text.match(/(?<!\w)@(\w+)/g) || [],
  });

  const { hashtags, mentions } = extractTags(content);
  const canPost = !loading && (content.trim().length > 0 || mediaItems.length > 0);
  const mediaFull = mediaItems.length >= 4;

  const placeholder =
    mode === "article"
      ? "Write your article here..."
      : mode === "video"
        ? "Add a caption for your video..."
        : "What do you want to talk about?";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-lg p-0 gap-0 overflow-hidden [&>button.absolute]:hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b">
          <div className="flex items-center gap-3">
            <Avatar className="w-11 h-11">
              <AvatarImage src={avatar} alt={user?.name ?? ""} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm leading-tight">{user?.name ?? user?.email}</p>
              {/* Privacy picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPrivacyMenu((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground border rounded-full px-2 py-0.5 mt-1 hover:bg-muted transition-colors"
                >
                  {currentPrivacy.icon}
                  Post to {currentPrivacy.label}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showPrivacyMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 py-1 min-w-[160px]">
                    {PRIVACY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setPrivacy(opt.value); setShowPrivacyMenu(false); }}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors ${privacy === opt.value ? "text-primary font-medium" : ""}`}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1.5 hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 min-h-[200px]">
          {error && (
            <Alert variant="destructive" className="mb-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Textarea
            placeholder={placeholder}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="border-0 resize-none p-0 text-base placeholder:text-muted-foreground/60 focus-visible:ring-0 min-h-[140px]"
            disabled={loading}
            autoFocus
          />

          {/* Tags preview */}
          {(hashtags.length > 0 || mentions.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {hashtags.map((tag, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
              {mentions.map((m, i) => (
                <Badge key={i} variant="outline" className="text-xs">{m}</Badge>
              ))}
            </div>
          )}

          {/* Link Preview */}
          <LinkPreviewCard preview={linkPreview} loading={linkPreviewLoading} />

          {/* Media preview grid */}
          {mediaItems.length > 0 && (
            <div className={`mt-3 grid gap-1.5 ${mediaItems.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {mediaItems.map((item, i) => (
                <div key={i} className="relative group rounded-lg overflow-hidden">
                  {item.mediaType === "image" ? (
                    <img src={item.url} alt="" className="w-full h-40 object-cover" />
                  ) : (
                    <video src={item.url} className="w-full h-40 object-cover" />
                  )}
                  <button
                    onClick={() => removeMediaItem(i)}
                    className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom toolbar */}
        <div className="px-5 py-3 border-t flex items-center justify-between">
          {/* Left tools */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Add emoji"
              className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
            >
              <Smile className="h-5 w-5" />
            </button>

            {/* Photo — Upload / Stock / AI Image */}
            <MediaPicker
              accept="image"
              title="Add photo to post"
              disabled={mediaFull}
              onPick={(asset) => {
                setMode("photo");
                addMediaItem({ url: asset.url, mediaType: "image" });
              }}
              trigger={
                <button
                  type="button"
                  title={mediaFull ? "Up to 4 attachments" : "Add photo"}
                  className={`p-2 rounded-full hover:bg-muted transition-colors disabled:opacity-50 ${mode === "photo" ? "text-primary" : "text-muted-foreground"}`}
                >
                  <Image className="h-5 w-5" />
                </button>
              }
            />

            {/* Video — Upload / Stock */}
            <MediaPicker
              accept="video"
              title="Add video to post"
              disabled={mediaFull}
              onPick={(asset) => {
                setMode("video");
                addMediaItem({ url: asset.url, mediaType: "video" });
              }}
              trigger={
                <button
                  type="button"
                  title={mediaFull ? "Up to 4 attachments" : "Add video"}
                  className={`p-2 rounded-full hover:bg-muted transition-colors disabled:opacity-50 ${mode === "video" ? "text-primary" : "text-muted-foreground"}`}
                >
                  <Video className="h-5 w-5" />
                </button>
              }
            />

            {/* Article */}
            <button
              type="button"
              title="Write article"
              onClick={() => setMode("article")}
              className={`p-2 rounded-full hover:bg-muted transition-colors ${mode === "article" ? "text-primary" : "text-muted-foreground"}`}
            >
              <FileText className="h-5 w-5" />
            </button>

            {/* Event */}
            <button
              type="button"
              title="Add event"
              className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
            >
              <Calendar className="h-5 w-5" />
            </button>

            <button
              type="button"
              className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>

          {/* Post button */}
          <Button
            onClick={handleSubmit}
            disabled={!canPost}
            className="rounded-full px-5 font-semibold"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

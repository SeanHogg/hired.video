// LinkedInPostModal.tsx — generates a LinkedIn post package via LLM and lets
// the user copy the caption or open the LinkedIn share intent.

import { useState, useEffect } from "react";
import { X, Copy, ExternalLink, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { z } from "zod";

interface Props {
  videoId: string;
  videoTitle?: string;
  onClose: () => void;
}

const LinkedInPostSchema = z.object({
  hook: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  fullPost: z.string(),
});

type LinkedInPost = z.infer<typeof LinkedInPostSchema>;

export default function LinkedInPostModal({ videoId, videoTitle, onClose }: Props) {
  const [post, setPost] = useState<LinkedInPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const publicUrl = `https://hired.video/v/${videoId}`;

  useEffect(() => {
    async function generate() {
      try {
        const res = await apiClient.post(
          "/api/studio/linkedin-post",
          { videoId, videoTitle },
          LinkedInPostSchema,
        );
        if (res.data) setPost(res.data);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    generate();
  }, [videoId, videoTitle]);

  async function handleCopy() {
    const text = post?.fullPost ?? "";
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleShare() {
    const summary = encodeURIComponent(post?.hook ?? videoTitle ?? "My video resume");
    const url = encodeURIComponent(publicUrl);
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${url}&summary=${summary}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">Generate LinkedIn Post</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          {loading && (
            <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Writing your post…</span>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {post && (
            <>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Hook</p>
                <p className="text-sm font-medium leading-snug">{post.hook}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Full Post (editable)</p>
                <Textarea
                  className="text-sm h-52 resize-none"
                  value={post.fullPost}
                  onChange={(e) => setPost({ ...post, fullPost: e.target.value })}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {post.hashtags.map((tag) => (
                  <span key={tag} className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
                    #{tag}
                  </span>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Sharing: <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="underline">{publicUrl}</a>
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleCopy}
            disabled={!post}
          >
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copied!" : "Copy Caption"}
          </Button>
          <Button
            className="flex-1"
            onClick={handleShare}
            disabled={!post}
          >
            <ExternalLink className="w-4 h-4 mr-2" /> Post to LinkedIn
          </Button>
        </div>
      </div>
    </div>
  );
}

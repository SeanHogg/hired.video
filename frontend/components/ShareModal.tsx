import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Copy, Send, MessageSquare } from "lucide-react";
import SocialShareRow from "@/components/SocialShareRow";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl: string;
  title?: string;
  message?: string;
  /** Headline text used when generating share intents (LinkedIn/X/etc.). */
  shareText?: string;
}

export default function ShareModal({
  open,
  onOpenChange,
  shareUrl,
  title = "Share",
  message = "Pick a platform — link and preview will be filled in for you.",
  shareText,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const text = shareText ?? "Check out my profile on hired.video!";

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Failed to copy link", e);
    }
  };

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(text);

  // Less-prominent secondary platforms; primaries live in SocialShareRow.
  const moreLinks = [
    {
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      Icon: Send,
    },
    {
      label: "Reddit",
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`,
      Icon: MessageSquare,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input value={shareUrl} readOnly className="flex-1" />
          <Button variant="outline" onClick={copyToClipboard} title="Copy link">
            <Copy className="h-4 w-4 mr-1" />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <div className="mt-2">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Share to</p>
          <SocialShareRow url={shareUrl} title={text} size="md" />
        </div>

        <div className="flex gap-2 mt-2">
          {moreLinks.map(({ label, href, Icon }) => (
            <Button key={label} variant="outline" size="sm" asChild>
              <a href={href} target="_blank" rel="noopener noreferrer">
                <Icon className="h-4 w-4 mr-1.5" />
                {label}
              </a>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

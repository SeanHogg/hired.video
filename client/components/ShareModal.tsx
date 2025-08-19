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
import { Copy } from "lucide-react";

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl: string;
  title?: string;
  message?: string;
}

export default function ShareModal({ open, onOpenChange, shareUrl, title = "Share Options", message = "Please share by using an option below." }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

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
  const defaultText = encodeURIComponent("Check out my profile on MyVideoResume!");

  const links = [
    { label: "Share on Twitter", href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${defaultText}` },
    { label: "Share on Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { label: "Share on LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
    { label: "Share by Email", href: `mailto:?subject=${encodeURIComponent("MyVideoResume Profile")}&body=${defaultText}%20${encodedUrl}` },
    { label: "Share on WhatsApp", href: `https://wa.me/?text=${defaultText}%20${encodedUrl}` },
    { label: "Share on Telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${defaultText}` },
    { label: "Share on Reddit", href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${defaultText}` },
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

        <div className="grid sm:grid-cols-2 gap-2 mt-2">
          {links.map((item) => (
            <Button key={item.label} variant="outline" asChild>
              <a href={item.href} target="_blank" rel="noopener noreferrer">{item.label}</a>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}


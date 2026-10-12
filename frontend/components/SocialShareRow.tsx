// SocialShareRow — compact row of one-click social share icons.
// Drop-in next to any "Copy link" button. Each button opens the platform's
// share intent in a new tab pre-filled with the URL + content title.

import { Linkedin, Twitter, Facebook, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SocialShareRowProps {
  url: string;
  title?: string;
  className?: string;
  size?: "sm" | "md";
}

export default function SocialShareRow({
  url,
  title = "Check out my profile on hired.video!",
  className,
  size = "sm",
}: SocialShareRowProps) {
  if (!url) return null;

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(title);
  const iconCls = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const btnCls = size === "sm" ? "h-8 w-8" : "h-10 w-10";

  const targets = [
    {
      label: "Share on LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      Icon: Linkedin,
      hover: "hover:bg-[#0A66C2]/10 hover:text-[#0A66C2]",
    },
    {
      label: "Share on X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
      Icon: Twitter,
      hover: "hover:bg-foreground/10",
    },
    {
      label: "Share on Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      Icon: Facebook,
      hover: "hover:bg-[#1877F2]/10 hover:text-[#1877F2]",
    },
    {
      label: "Share on WhatsApp",
      href: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      Icon: MessageCircle,
      hover: "hover:bg-[#25D366]/10 hover:text-[#25D366]",
    },
    {
      label: "Share by Email",
      href: `mailto:?subject=${encodedText}&body=${encodedText}%20${encodedUrl}`,
      Icon: Mail,
      hover: "hover:bg-muted",
    },
  ];

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {targets.map(({ label, href, Icon, hover }) => (
        <Button
          key={label}
          asChild
          variant="ghost"
          size="icon"
          className={cn(btnCls, "rounded-full transition-colors", hover)}
          title={label}
        >
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
            <Icon className={iconCls} />
          </a>
        </Button>
      ))}
    </div>
  );
}

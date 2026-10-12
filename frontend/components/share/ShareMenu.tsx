/**
 * ShareMenu — the ONE reusable "Share" affordance for every card and detail
 * surface (feed posts, articles, resumes, templates, jobs, companies, …).
 *
 * It self-contains ALL the sharing logic so consumers never re-implement
 * `window.open("https://twitter.com/intent…")`, clipboard copy, or the
 * native share sheet:
 *   • Repost to feed   — only when `onRepost` is provided (feed posts).
 *   • Share on LinkedIn / X / Facebook / WhatsApp / Email — web-intents
 *     built from the shared SSoT (shared/social-share.ts).
 *   • Copy link        — clipboard + toast.
 *   • More… (native)   — the OS share sheet via navigator.share, when available.
 *
 * Two entry points, ONE item set (DRY):
 *   - <ShareMenu>        — a standalone dropdown with its own trigger button.
 *                          Use on cards / action bars that want a dedicated
 *                          Share control.
 *   - <ShareMenuItems>   — just the menu items, to drop INTO an existing
 *                          DropdownMenuContent (e.g. a card's "⋯" menu).
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Share2,
  Repeat2,
  Linkedin,
  Twitter,
  Facebook,
  MessageCircle,
  Mail,
  Link2,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SHARE_NETWORKS, type SharePayload } from "@shared/social-share";

// Network id → brand icon. Kept on the frontend (icons are framework
// components); the SSoT stays pure. Adding a network in social-share.ts
// falls back to the generic Share2 glyph until an icon is mapped here.
const NETWORK_ICON: Record<string, LucideIcon> = {
  linkedin: Linkedin,
  x: Twitter,
  facebook: Facebook,
  whatsapp: MessageCircle,
  email: Mail,
};

export interface ShareMenuProps extends SharePayload {
  /** Repost-to-feed handler. When provided, a "Repost" item leads the menu
   *  (feed posts). Omit on non-feed entities. */
  onRepost?: () => void;
}

/** The shared item set. Drop into any <DropdownMenuContent>. */
export function ShareMenuItems({ url, title, text, onRepost }: ShareMenuProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const payload: SharePayload = { url, title, text };

  const openIntent = useCallback((href: string) => {
    window.open(href, "_blank", "noopener,noreferrer");
  }, []);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t("share.copied"), description: t("share.linkCopiedDesc") });
    } catch {
      toast({ title: t("share.copyFailed"), variant: "destructive" });
    }
  }, [url, t, toast]);

  const nativeShare = useCallback(async () => {
    try {
      await navigator.share({ url, title, text });
    } catch {
      /* user cancelled or unsupported — no-op */
    }
  }, [url, title, text]);

  // navigator.share is only present in secure contexts / supporting browsers.
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <>
      {onRepost && (
        <>
          <DropdownMenuItem onClick={onRepost}>
            <Repeat2 className="w-4 h-4 mr-2" />
            {t("share.repost")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}

      {SHARE_NETWORKS.map((n) => {
        const Icon = NETWORK_ICON[n.id] ?? Share2;
        return (
          <DropdownMenuItem key={n.id} onClick={() => openIntent(n.buildUrl(payload))}>
            <Icon className="w-4 h-4 mr-2" />
            {t("share.shareOn", { network: t(n.labelKey) })}
          </DropdownMenuItem>
        );
      })}

      <DropdownMenuSeparator />

      <DropdownMenuItem onClick={copyLink}>
        <Link2 className="w-4 h-4 mr-2" />
        {t("share.copyLink")}
      </DropdownMenuItem>

      {canNativeShare && (
        <DropdownMenuItem onClick={nativeShare}>
          <MoreHorizontal className="w-4 h-4 mr-2" />
          {t("share.more")}
        </DropdownMenuItem>
      )}
    </>
  );
}

/**
 * ShareSubMenu — a "Share ▸" submenu to nest INSIDE an existing card/actions
 * dropdown (e.g. CardActions' overflow ⋯ menu). Keeps the share targets one
 * click away without flooding the parent menu with six rows.
 */
export function ShareSubMenu(share: ShareMenuProps) {
  const { t } = useTranslation();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Share2 className="w-4 h-4 mr-2" />
        {t("share.button")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-52">
        <ShareMenuItems {...share} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export interface StandaloneShareMenuProps extends ShareMenuProps {
  /** Visual style: a full button ("Share" label) or a compact icon button. */
  variant?: "ghost" | "outline" | "icon";
  /** Optional trailing count (e.g. repost count on a feed post). */
  count?: number;
  /** Optional extra classes on the trigger. */
  className?: string;
  align?: "start" | "center" | "end";
  size?: "sm" | "default";
}

/** Standalone Share dropdown with its own trigger. */
export default function ShareMenu({
  variant = "ghost",
  count,
  className,
  align = "start",
  size = "sm",
  ...share
}: StandaloneShareMenuProps) {
  const { t } = useTranslation();
  const iconOnly = variant === "icon";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={iconOnly ? "ghost" : variant}
          size={iconOnly ? "icon" : size}
          aria-label={t("share.button")}
          className={cn(!iconOnly && "text-muted-foreground hover:text-foreground", className)}
        >
          <Share2 className={cn("h-4 w-4", !iconOnly && "mr-2")} />
          {!iconOnly && (
            <>
              {t("share.button")}
              {typeof count === "number" && count > 0 && (
                <span className="ml-1.5 tabular-nums text-muted-foreground">{count}</span>
              )}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <ShareMenuItems {...share} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

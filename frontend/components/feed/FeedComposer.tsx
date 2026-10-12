import { useEffect, useRef, useState } from "react";
import {
  Video,
  Image as ImageIcon,
  FileText,
  Globe,
  Users,
  Heart,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type PostMode = "text" | "video" | "photo" | "article";
export type FeedFilterValue = "all" | "connections" | "following";

type ComposerUser = {
  name?: string | null;
  email?: string | null;
  [key: string]: unknown;
};

function avatarBits(user: ComposerUser) {
  const initials = ((user.name as string) || (user.email as string) || "?")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return { initials, avatar: (user.avatar as string) ?? "" };
}

// ─── Inline post composer bar ─────────────────────────────────────────────────
// `compact` flattens it to a single row (avatar + pill + mini media glyphs) for
// the sticky-on-scroll header; clicking the compact bar fires `onExpand` to open
// the full options again. Both feed surfaces (Home dashboard + Feed) reuse this.
export function PostComposerBar({
  user,
  onOpen,
  compact = false,
  onExpand,
}: {
  user: ComposerUser;
  onOpen: (mode: PostMode) => void;
  compact?: boolean;
  onExpand?: () => void;
}) {
  const { initials, avatar } = avatarBits(user);

  if (compact) {
    return (
      <Card>
        <button
          type="button"
          onClick={onExpand ?? (() => onOpen("text"))}
          className="w-full flex items-center gap-2 px-3 py-2 text-left"
          aria-label="Expand post composer"
        >
          <Avatar className="w-7 h-7 shrink-0">
            <AvatarImage src={avatar} alt={(user.name as string) ?? ""} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-[11px]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate text-sm text-muted-foreground border rounded-full px-3 py-1.5">
            What do you want to talk about?
          </span>
          <span className="flex items-center gap-2 shrink-0" aria-hidden>
            <Video className="h-4 w-4 text-primary" />
            <ImageIcon className="h-4 w-4 text-green-500" />
            <FileText className="h-4 w-4 text-amber-500" />
          </span>
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        {/* Top row: avatar + text input trigger */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="w-10 h-10 shrink-0">
            <AvatarImage src={avatar} alt={(user.name as string) ?? ""} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={() => onOpen("text")}
            className="flex-1 text-left text-sm text-muted-foreground border rounded-full px-4 py-2.5 hover:bg-muted/50 hover:border-primary/40 transition-colors"
          >
            What do you want to talk about?
          </button>
        </div>

        <Separator className="mb-3" />

        {/* Bottom row: media type buttons */}
        <div className="flex items-center justify-around">
          <button
            type="button"
            onClick={() => onOpen("video")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-primary transition-colors"
          >
            <Video className="h-5 w-5 text-primary" />
            Video
          </button>
          <button
            type="button"
            onClick={() => onOpen("photo")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-green-600 transition-colors"
          >
            <ImageIcon className="h-5 w-5 text-green-500" />
            Photo
          </button>
          <button
            type="button"
            onClick={() => onOpen("article")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-amber-600 transition-colors"
          >
            <FileText className="h-5 w-5 text-amber-500" />
            Write article
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Feed filter tabs ─────────────────────────────────────────────────────────
// `compact` shrinks the vertical rhythm so the tab row flattens alongside the
// composer when the sticky header collapses.
export function FeedFilterTabs({
  active,
  onChange,
  compact = false,
}: {
  active: FeedFilterValue;
  onChange: (v: FeedFilterValue) => void;
  compact?: boolean;
}) {
  const tabs: { value: FeedFilterValue; label: string; icon: React.ReactNode }[] = [
    { value: "all", label: "All", icon: <Globe className="h-4 w-4" /> },
    { value: "connections", label: "Connections", icon: <Users className="h-4 w-4" /> },
    { value: "following", label: "Following", icon: <Heart className="h-4 w-4" /> },
  ];

  return (
    <div className="flex border-b bg-card rounded-t-xl overflow-hidden">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            "flex items-center gap-2 flex-1 justify-center font-medium border-b-2 transition-colors",
            compact ? "py-1.5 text-xs" : "py-3 text-sm",
            active === tab.value
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Sticky composer + filter header ──────────────────────────────────────────
// Composer bar + filter tabs stick to the top of the feed column. An
// IntersectionObserver sentinel (offset by the 64px fixed nav) detects when the
// header has scrolled under the nav and flattens both into a compact format;
// tapping the compact composer re-expands to the full options. Scrolling back to
// the top auto-restores the full header. Pass `sticky={false}` to render the
// plain (non-sticky, always-full) block — used where another element already
// owns the sticky top slot. Shared by the Home dashboard feed and /feed.
export function FeedComposerHeader({
  user,
  onOpen,
  filter,
  onFilterChange,
  sticky = true,
}: {
  user: ComposerUser;
  onOpen: (mode: PostMode) => void;
  filter: FeedFilterValue;
  onFilterChange: (v: FeedFilterValue) => void;
  sticky?: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [userExpanded, setUserExpanded] = useState(false);

  useEffect(() => {
    if (!sticky) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const past = !entry.isIntersecting;
        setStuck(past);
        // Back at the top → drop any manual expand so scroll owns the state again.
        if (!past) setUserExpanded(false);
      },
      // Trip the moment the sentinel slides under the 64px fixed nav.
      { rootMargin: "-64px 0px 0px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [sticky]);

  const compact = sticky && stuck && !userExpanded;

  const body = (
    <div className={cn(compact ? "space-y-2" : "space-y-4")}>
      <PostComposerBar
        user={user}
        onOpen={onOpen}
        compact={compact}
        onExpand={() => setUserExpanded(true)}
      />
      <div className="bg-card rounded-xl overflow-hidden border">
        <FeedFilterTabs active={filter} onChange={onFilterChange} compact={compact} />
      </div>
    </div>
  );

  if (!sticky) return body;

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px -mb-px" />
      <div className="sticky top-16 z-20 -mx-1 px-1 py-2 rounded-b-xl bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
        {body}
      </div>
    </>
  );
}

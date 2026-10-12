// SuperAdmin — curate the standard featured content shown on each role's
// dashboard feed. Pick any card the platform can render (tools like Career
// 360, the Chrome extension page, articles, videos, jobs, resumes…) and pin
// it to one or more roles, reorder, toggle, or remove.
//
// Reads/writes /api/admin/feed-features (FeedFeatureService). The content
// picker fans out to the same fetchCardFeed pipeline that powers /search, so
// anything searchable is featurable. A "custom link / page" form covers app
// or marketing pages that aren't first-class entities.

import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Search,
  Link2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  feedFeaturesService,
  type FeedFeatureAdminItem,
} from "@/lib/services/feed-features-service";
import { fetchCardFeed, type CardFeedType } from "@/lib/card-feed";
import {
  FEED_FEATURE_KINDS,
  featureAppliesToRole,
  type FeedFeatureKind,
} from "@shared/feed-features";
import { USER_ROLES, type UserRole } from "@shared/user-roles";

// The three market-facing roles lead; "all" pins to every role (empty
// target array). Internal roles (employee/admin) are reachable by editing
// the roles array but aren't first-class tabs here.
const ROLE_TABS: { value: UserRole | "all"; label: string }[] = [
  { value: USER_ROLES.JOB_SEEKER, label: "Job Seeker" },
  { value: USER_ROLES.RECRUITER, label: "Recruiter" },
  { value: USER_ROLES.EMPLOYER, label: "Employer" },
  { value: "all", label: "All roles" },
];

const PICKER_CATEGORIES: { type: CardFeedType; label: string }[] = [
  { type: "tool", label: "Tools" },
  { type: "article", label: "Articles" },
  { type: "guide", label: "Guides" },
  { type: "video", label: "Videos" },
  { type: "job", label: "Jobs" },
  { type: "resume", label: "Resumes" },
  { type: "company", label: "Companies" },
  { type: "people", label: "People" },
  { type: "template", label: "Templates" },
  { type: "faq", label: "FAQs" },
  { type: "event", label: "Events" },
];

/** A fetchCardFeed `type` is already a FeedFeatureKind (the kind enum is a
 *  superset). Guarded so an unexpected upstream type can't be pinned. */
function asFeedKind(type: string): FeedFeatureKind | null {
  return (FEED_FEATURE_KINDS as readonly string[]).includes(type)
    ? (type as FeedFeatureKind)
    : null;
}

export default function DashboardFeedCuration() {
  const [items, setItems] = useState<FeedFeatureAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | "all">(USER_ROLES.JOB_SEEKER);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await feedFeaturesService.adminList());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Features visible for the active role tab: "all" shows everything;
  // a specific role shows its targeted + the global (empty-roles) features.
  const roleItems = useMemo(() => {
    const filtered =
      role === "all"
        ? items
        : items.filter((it) => featureAppliesToRole(it.roles, role));
    return [...filtered].sort((a, b) => a.rank - b.rank || a.createdAt.localeCompare(b.createdAt));
  }, [items, role]);

  const targetRoles = (): string[] =>
    role === "all" ? [] : [role];

  const addCard = async (card: any) => {
    const kind = asFeedKind(String(card.type));
    if (!kind) return;
    setBusyId("add");
    try {
      // Snapshot the picked card, minus the client-only sort key, as the
      // render-ready payload. The renderer reads `type` + `id` to dispatch.
      const { sortKey: _omit, ...embedPayload } = card;
      await feedFeaturesService.adminCreate({
        entityKind: kind,
        entityId: String(card.id),
        roles: targetRoles(),
        title: String(card.title || card.name || "Untitled"),
        rank: roleItems.length,
        embedPayload,
      });
      await refresh();
      setPickerOpen(false);
    } finally {
      setBusyId(null);
    }
  };

  const addCustomLink = async (input: {
    title: string;
    href: string;
    summary?: string;
    image?: string;
  }) => {
    setBusyId("link");
    try {
      // Stable slug id from the href so the same page can't be double-pinned.
      const entityId = input.href.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 120) || "page";
      await feedFeaturesService.adminCreate({
        entityKind: "page",
        entityId,
        roles: targetRoles(),
        title: input.title,
        rank: roleItems.length,
        embedPayload: {
          type: "page",
          id: entityId,
          title: input.title,
          href: input.href,
          summary: input.summary,
          image: input.image,
        },
      });
      await refresh();
      setLinkOpen(false);
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (it: FeedFeatureAdminItem) => {
    setBusyId(it.id);
    try {
      await feedFeaturesService.adminUpdate(it.id, { isActive: !it.isActive });
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (it: FeedFeatureAdminItem) => {
    setBusyId(it.id);
    try {
      await feedFeaturesService.adminDelete(it.id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  // Swap rank with the previous/next item in the current role view.
  const move = async (index: number, dir: -1 | 1) => {
    const a = roleItems[index];
    const b = roleItems[index + dir];
    if (!a || !b) return;
    setBusyId(a.id);
    try {
      await Promise.all([
        feedFeaturesService.adminUpdate(a.id, { rank: b.rank }),
        feedFeaturesService.adminUpdate(b.id, { rank: a.rank }),
      ]);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Dashboard Feed
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Pin the standard featured content each role sees on their
            dashboard. Anything renderable as a card — tools, pages, articles,
            videos, jobs, resumes — can be featured.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLinkOpen(true)}>
            <Link2 className="h-4 w-4 mr-1.5" />
            Custom link
          </Button>
          <Button onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add content
          </Button>
        </div>
      </div>

      <Tabs value={role} onValueChange={(v) => setRole(v as UserRole | "all")}>
        <TabsList>
          {ROLE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {ROLE_TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading…
              </div>
            ) : roleItems.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  No featured content for this role yet. Use{" "}
                  <strong>Add content</strong> to pin the first card.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {roleItems.map((it, i) => (
                  <FeatureRow
                    key={it.id}
                    item={it}
                    busy={busyId === it.id}
                    isFirst={i === 0}
                    isLast={i === roleItems.length - 1}
                    onUp={() => move(i, -1)}
                    onDown={() => move(i, 1)}
                    onToggle={() => toggleActive(it)}
                    onRemove={() => remove(it)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <ContentPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={addCard}
        busy={busyId === "add"}
        existingKeys={new Set(items.map((it) => `${it.entityKind}:${it.entityId}`))}
      />
      <CustomLinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onSubmit={addCustomLink}
        busy={busyId === "link"}
      />
    </div>
  );
}

function FeatureRow({
  item,
  busy,
  isFirst,
  isLast,
  onUp,
  onDown,
  onToggle,
  onRemove,
}: {
  item: FeedFeatureAdminItem;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  onUp: () => void;
  onDown: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const roleLabel =
    item.roles.length === 0 ? "All roles" : item.roles.join(", ");
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex flex-col">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={isFirst || busy}
          onClick={onUp}
          aria-label="Move up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={isLast || busy}
          onClick={onDown}
          aria-label="Move down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{item.title}</span>
          <Badge variant="outline" className="capitalize">
            {item.entityKind}
          </Badge>
          {!item.isActive && <Badge variant="secondary">Hidden</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate">{roleLabel}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Switch checked={item.isActive} onCheckedChange={onToggle} disabled={busy} />
          <Label className="text-xs text-muted-foreground">Active</Label>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          disabled={busy}
          onClick={onRemove}
          aria-label="Remove"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function ContentPickerDialog({
  open,
  onOpenChange,
  onPick,
  busy,
  existingKeys,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (card: any) => void;
  busy: boolean;
  existingKeys: Set<string>;
}) {
  const [type, setType] = useState<CardFeedType>("tool");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setSearching(true);
    fetchCardFeed({ types: [type], search: query, limitPerType: 24 })
      .then((res) => {
        if (active) setResults(res.items);
      })
      .catch(() => {
        if (active) setResults([]);
      })
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [open, type, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add featured content</DialogTitle>
          <DialogDescription>
            Search any content type and pin it to the selected role's feed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {PICKER_CATEGORIES.map((cat) => (
            <Button
              key={cat.type}
              size="sm"
              variant={type === cat.type ? "default" : "outline"}
              onClick={() => setType(cat.type)}
            >
              {cat.label}
            </Button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="pl-9"
          />
        </div>

        <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
          {searching ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No results.
            </p>
          ) : (
            results.map((r) => {
              const already = existingKeys.has(`${r.type}:${r.id}`);
              return (
                <div
                  key={`${r.type}-${r.id}`}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {r.title || r.name || "Untitled"}
                    </p>
                    {r.summary && (
                      <p className="text-xs text-muted-foreground truncate">
                        {r.summary}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={already ? "outline" : "default"}
                    disabled={already || busy}
                    onClick={() => onPick(r)}
                  >
                    {already ? "Added" : "Add"}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomLinkDialog({
  open,
  onOpenChange,
  onSubmit,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: { title: string; href: string; summary?: string; image?: string }) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState("");
  const [href, setHref] = useState("");
  const [summary, setSummary] = useState("");
  const [image, setImage] = useState("");

  const valid = title.trim().length > 0 && href.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a custom link or page</DialogTitle>
          <DialogDescription>
            Feature an app or marketing page (e.g. the Chrome extension) that
            isn't a first-class entity.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ff-title">Title</Label>
            <Input id="ff-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ff-href">Link (path or URL)</Label>
            <Input
              id="ff-href"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="/chrome-extension"
            />
          </div>
          <div>
            <Label htmlFor="ff-summary">Summary (optional)</Label>
            <Textarea
              id="ff-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="ff-image">Cover image URL (optional)</Label>
            <Input id="ff-image" value={image} onChange={(e) => setImage(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid || busy}
            onClick={() =>
              onSubmit({
                title: title.trim(),
                href: href.trim(),
                summary: summary.trim() || undefined,
                image: image.trim() || undefined,
              })
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Add to feed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

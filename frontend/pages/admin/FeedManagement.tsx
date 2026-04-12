import { useState } from "react";
import {
  Megaphone,
  Plus,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  Pencil,
  Trash2,
  Eye,
  Users,
  Globe,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminPermissions } from "@/lib/admin-permissions";

type FeedItemStatus = "draft" | "scheduled" | "published" | "archived";
type FeedItemAudience = "all" | "job_seekers" | "recruiters" | "employers";

interface FeedItem {
  id: string;
  title: string;
  message: string;
  audience: FeedItemAudience;
  status: FeedItemStatus;
  dismissable: boolean;
  createdAt: string;
  publishedAt?: string;
  scheduledFor?: string;
}

const AUDIENCE_LABELS: Record<FeedItemAudience, { label: string; icon: typeof Globe }> = {
  all:          { label: "All Users",    icon: Globe },
  job_seekers:  { label: "Job Seekers",  icon: Users },
  recruiters:   { label: "Recruiters",   icon: Users },
  employers:    { label: "Employers",    icon: Shield },
};

const STATUS_CONFIG: Record<FeedItemStatus, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft:     { label: "Draft",     icon: Pencil,       variant: "secondary" },
  scheduled: { label: "Scheduled", icon: Clock,        variant: "outline" },
  published: { label: "Published", icon: CheckCircle2, variant: "default" },
  archived:  { label: "Archived",  icon: XCircle,      variant: "destructive" },
};

// Seed data for demo
const SEED_ITEMS: FeedItem[] = [
  {
    id: "1",
    title: "Welcome to hired.video!",
    message: "Get started by creating your first video resume. Our AI-powered studio makes it easy to stand out.",
    audience: "job_seekers",
    status: "published",
    dismissable: true,
    createdAt: "2026-04-10T10:00:00Z",
    publishedAt: "2026-04-10T10:00:00Z",
  },
  {
    id: "2",
    title: "New: Chrome Extension",
    message: "Install our Chrome extension to score your resume against any job posting, right from the job board.",
    audience: "all",
    status: "published",
    dismissable: true,
    createdAt: "2026-04-08T14:00:00Z",
    publishedAt: "2026-04-08T14:00:00Z",
  },
  {
    id: "3",
    title: "Recruiter feature update",
    message: "Video screening is now available for all recruiter accounts. Screen candidates faster with async video interviews.",
    audience: "recruiters",
    status: "draft",
    dismissable: false,
    createdAt: "2026-04-12T09:00:00Z",
  },
];

export default function FeedManagement() {
  const { can } = useAdminPermissions();
  const canCreate = can("feed", "create");
  const canUpdate = can("feed", "update");
  const canDelete = can("feed", "delete");

  const [items, setItems] = useState<FeedItem[]>(SEED_ITEMS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FeedItem | null>(null);
  const [filterStatus, setFilterStatus] = useState<FeedItemStatus | "all">("all");

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formAudience, setFormAudience] = useState<FeedItemAudience>("all");
  const [formDismissable, setFormDismissable] = useState(true);

  const openCreate = () => {
    setEditingItem(null);
    setFormTitle("");
    setFormMessage("");
    setFormAudience("all");
    setFormDismissable(true);
    setDialogOpen(true);
  };

  const openEdit = (item: FeedItem) => {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormMessage(item.message);
    setFormAudience(item.audience);
    setFormDismissable(item.dismissable);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formTitle.trim() || !formMessage.trim()) return;

    if (editingItem) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingItem.id
            ? { ...item, title: formTitle, message: formMessage, audience: formAudience, dismissable: formDismissable }
            : item,
        ),
      );
    } else {
      const newItem: FeedItem = {
        id: crypto.randomUUID(),
        title: formTitle,
        message: formMessage,
        audience: formAudience,
        status: "draft",
        dismissable: formDismissable,
        createdAt: new Date().toISOString(),
      };
      setItems((prev) => [newItem, ...prev]);
    }
    setDialogOpen(false);
  };

  const handlePublish = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: "published" as const, publishedAt: new Date().toISOString() }
          : item,
      ),
    );
  };

  const handleArchive = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "archived" as const } : item,
      ),
    );
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const filteredItems =
    filterStatus === "all"
      ? items
      : items.filter((item) => item.status === filterStatus);

  const counts = {
    all: items.length,
    draft: items.filter((i) => i.status === "draft").length,
    published: items.filter((i) => i.status === "published").length,
    scheduled: items.filter((i) => i.status === "scheduled").length,
    archived: items.filter((i) => i.status === "archived").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Megaphone className="h-7 w-7" />
            Feed Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage notifications, announcements, and messages shown to users in their feed.
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New Feed Item
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(["all", "draft", "published", "scheduled", "archived"] as const).map((key) => {
          const isActive = filterStatus === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilterStatus(key)}
              className={`text-center p-3 rounded-lg border transition-colors ${
                isActive
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              <div className="text-xl font-bold">{counts[key]}</div>
              <div className="text-xs text-muted-foreground capitalize">{key}</div>
            </button>
          );
        })}
      </div>

      {/* Items list */}
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Megaphone className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold mb-1">No feed items</h3>
              <p className="text-sm text-muted-foreground">
                {filterStatus === "all"
                  ? "Create your first feed item to notify users."
                  : `No ${filterStatus} items.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredItems.map((item) => {
            const statusCfg = STATUS_CONFIG[item.status];
            const StatusIcon = statusCfg.icon;
            const audienceCfg = AUDIENCE_LABELS[item.audience];
            const AudienceIcon = audienceCfg.icon;

            return (
              <Card key={item.id}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold">{item.title}</h3>
                        <Badge variant={statusCfg.variant} className="gap-1 text-xs">
                          <StatusIcon className="h-3 w-3" />
                          {statusCfg.label}
                        </Badge>
                        <Badge variant="outline" className="gap-1 text-xs">
                          <AudienceIcon className="h-3 w-3" />
                          {audienceCfg.label}
                        </Badge>
                        {item.dismissable && (
                          <Badge variant="outline" className="text-xs">Dismissable</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {item.message}
                      </p>
                      <div className="text-xs text-muted-foreground mt-2">
                        Created {new Date(item.createdAt).toLocaleDateString()}
                        {item.publishedAt && (
                          <> &middot; Published {new Date(item.publishedAt).toLocaleDateString()}</>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.status === "draft" && canUpdate && (
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1 h-8 text-xs"
                          onClick={() => handlePublish(item.id)}
                        >
                          <Send className="h-3 w-3" />
                          Publish
                        </Button>
                      )}
                      {item.status === "published" && canUpdate && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-8 text-xs"
                          onClick={() => handleArchive(item.id)}
                        >
                          <XCircle className="h-3 w-3" />
                          Archive
                        </Button>
                      )}
                      {canUpdate && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit Feed Item" : "New Feed Item"}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Update this notification or announcement."
                : "Create a notification or announcement to show users in their feed."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="feed-title">Title</Label>
              <Input
                id="feed-title"
                placeholder="e.g. New feature announcement"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-message">Message</Label>
              <Textarea
                id="feed-message"
                placeholder="The notification message shown to users..."
                rows={3}
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select
                  value={formAudience}
                  onValueChange={(v) => setFormAudience(v as FeedItemAudience)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AUDIENCE_LABELS).map(([value, { label }]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Dismissable</Label>
                <Select
                  value={formDismissable ? "yes" : "no"}
                  onValueChange={(v) => setFormDismissable(v === "yes")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes — user can close</SelectItem>
                    <SelectItem value="no">No — always shown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formTitle.trim() || !formMessage.trim()}
            >
              {editingItem ? "Save Changes" : "Create Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
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

const AUDIENCE_ICONS: Record<FeedItemAudience, typeof Globe> = {
  all:          Globe,
  job_seekers:  Users,
  recruiters:   Users,
  employers:    Shield,
};

const STATUS_ICONS: Record<FeedItemStatus, { icon: typeof Clock; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft:     { icon: Pencil,       variant: "secondary" },
  scheduled: { icon: Clock,        variant: "outline" },
  published: { icon: CheckCircle2, variant: "default" },
  archived:  { icon: XCircle,      variant: "destructive" },
};

export default function FeedManagement() {
  const { t } = useTranslation();
  const audienceLabel = (a: FeedItemAudience): string => {
    if (a === "all") return t("labels.allUsers");
    if (a === "job_seekers") return t("labels.jobSeekers");
    if (a === "recruiters") return t("labels.recruiters");
    return t("labels.employers");
  };
  const statusLabel = (s: FeedItemStatus): string => {
    if (s === "draft") return t("status.draftStatus");
    if (s === "scheduled") return t("status.scheduledStatus");
    if (s === "published") return t("status.publishedStatus");
    return t("status.archivedStatus");
  };
  const statusKeyLabels: Record<FeedItemStatus | "all", string> = {
    all: t("labels.allShort"),
    draft: t("status.draftStatus"),
    scheduled: t("status.scheduledStatus"),
    published: t("status.publishedStatus"),
    archived: t("status.archivedStatus"),
  };

  // Seed data for demo
  const SEED_ITEMS: FeedItem[] = [
    {
      id: "1",
      title: t("admin.feedItem.welcomeTitle"),
      message: t("admin.feedItem.welcomeMessage"),
      audience: "job_seekers",
      status: "published",
      dismissable: true,
      createdAt: "2026-04-10T10:00:00Z",
      publishedAt: "2026-04-10T10:00:00Z",
    },
    {
      id: "2",
      title: t("admin.feedItem.chromeTitle"),
      message: t("admin.feedItem.chromeMessage"),
      audience: "all",
      status: "published",
      dismissable: true,
      createdAt: "2026-04-08T14:00:00Z",
      publishedAt: "2026-04-08T14:00:00Z",
    },
    {
      id: "3",
      title: t("admin.feedItem.recruiterTitle"),
      message: t("admin.feedItem.recruiterMessage"),
      audience: "recruiters",
      status: "draft",
      dismissable: false,
      createdAt: "2026-04-12T09:00:00Z",
    },
  ];
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
            {t("headings.feedManagement")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("messages.feedManagementIntro")}
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("actions.newFeedItem")}
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
              <div className="text-xs text-muted-foreground">{statusKeyLabels[key]}</div>
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
              <h3 className="font-semibold mb-1">{t("messages.noFeedItems")}</h3>
              <p className="text-sm text-muted-foreground">
                {filterStatus === "all"
                  ? t("messages.createFirstFeedItem")
                  : t("messages.noStatusItems", { status: statusKeyLabels[filterStatus] })}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredItems.map((item) => {
            const statusCfg = STATUS_ICONS[item.status];
            const StatusIcon = statusCfg.icon;
            const AudienceIcon = AUDIENCE_ICONS[item.audience];

            return (
              <Card key={item.id}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold">{item.title}</h3>
                        <Badge variant={statusCfg.variant} className="gap-1 text-xs">
                          <StatusIcon className="h-3 w-3" />
                          {statusLabel(item.status)}
                        </Badge>
                        <Badge variant="outline" className="gap-1 text-xs">
                          <AudienceIcon className="h-3 w-3" />
                          {audienceLabel(item.audience)}
                        </Badge>
                        {item.dismissable && (
                          <Badge variant="outline" className="text-xs">{t("labels.dismissable")}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {item.message}
                      </p>
                      <div className="text-xs text-muted-foreground mt-2">
                        {t("messages.summaryCreatedDate", { date: new Date(item.createdAt).toLocaleDateString() })}
                        {item.publishedAt && (
                          <>{t("messages.summaryPublishedSeparator", { date: new Date(item.publishedAt).toLocaleDateString() })}</>
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
                          {t("actions.publish")}
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
                          {t("actions.archive")}
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
              {editingItem ? t("actions.editFeedItem") : t("actions.newFeedItem")}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? t("messages.feedDialogEditDesc")
                : t("messages.feedDialogCreateDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="feed-title">{t("labels.title")}</Label>
              <Input
                id="feed-title"
                placeholder={t("labels.titlePlaceholderFeed")}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feed-message">{t("fields.smsBody.label")}</Label>
              <Textarea
                id="feed-message"
                placeholder={t("labels.feedMessagePlaceholder")}
                rows={3}
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("labels.audience")}</Label>
                <Select
                  value={formAudience}
                  onValueChange={(v) => setFormAudience(v as FeedItemAudience)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(AUDIENCE_ICONS) as FeedItemAudience[]).map((value) => (
                      <SelectItem key={value} value={value}>
                        {audienceLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("labels.dismissable")}</Label>
                <Select
                  value={formDismissable ? "yes" : "no"}
                  onValueChange={(v) => setFormDismissable(v === "yes")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">{t("labels.dismissableYes")}</SelectItem>
                    <SelectItem value="no">{t("labels.dismissableNo")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formTitle.trim() || !formMessage.trim()}
            >
              {editingItem ? t("actions.saveChanges") : t("actions.createDraft")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

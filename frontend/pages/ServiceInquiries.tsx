import {
  Inbox,
  Send,
  Check,
  X,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  DollarSign,
  ArrowLeft,
} from "lucide-react";
import { useState, useEffect } from "react";
import { formatCentsPlain, initialsFromWords } from "@/lib/format";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  servicesService,
  type InquiryWithDetails,
  type MyRequestWithDetails,
} from "@/lib/services/services-service";
import { toast } from "sonner";

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  accepted: "default",
  rejected: "destructive",
  completed: "outline",
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  pending: "labels.inquiryStatus.pending",
  accepted: "labels.inquiryStatus.accepted",
  rejected: "labels.inquiryStatus.declined",
  completed: "labels.inquiryStatus.completed",
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const variant = STATUS_VARIANTS[status] ?? "secondary";
  const labelKey = STATUS_LABEL_KEYS[status];
  const label = labelKey ? t(labelKey) : status;
  return <Badge variant={variant}>{label}</Badge>;
}

function useTimeAgo() {
  const { t } = useTranslation();
  return (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return t("labels.minutesAgo", { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("labels.hoursAgo", { count: hrs });
    return t("labels.daysAgo", { count: Math.floor(hrs / 24) });
  };
}

export default function ServiceInquiries() {
  const { t } = useTranslation();
  const timeAgo = useTimeAgo();

  const [incoming, setIncoming] = useState<InquiryWithDetails[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequestWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [incomingData, requestsData] = await Promise.all([
        servicesService.listInquiries(),
        servicesService.listMyRequests(),
      ]);
      setIncoming(incomingData);
      setMyRequests(requestsData);
    } catch {
      toast.error(t("errors.loadInquiriesFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(
    id: string,
    status: "accepted" | "rejected" | "completed",
  ) {
    setUpdating(id);
    try {
      const updated = await servicesService.updateInquiryStatus(id, status);
      setIncoming((prev) =>
        prev.map((item) =>
          item.inquiry.id === id ? { ...item, inquiry: updated } : item,
        ),
      );
      toast.success(t("messages.inquiryStatusUpdated", { status: t(STATUS_LABEL_KEYS[status] ?? "labels.inquiryStatus.pending") }));
    } catch {
      toast.error(t("errors.updateInquiryFailed"));
    } finally {
      setUpdating(null);
    }
  }

  const pendingCount = incoming.filter((i) => i.inquiry.status === "pending").length;

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-4 pb-4 md:px-8 md:pb-8 w-full">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Link to="/services">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {t("headings.inquiriesAndLeads")}
                {pendingCount > 0 && (
                  <Badge className="ml-1">{t("labels.newCount", { count: pendingCount })}</Badge>
                )}
              </h1>
              <p className="text-muted-foreground mt-1">
                {t("messages.inquiriesAndLeadsDesc")}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="incoming">
              <TabsList className="mb-4">
                <TabsTrigger value="incoming" className="flex items-center gap-2">
                  <Inbox className="h-4 w-4" />
                  {t("tabs.incoming")}
                  {pendingCount > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-xs">
                      {pendingCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="sent" className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  {t("tabs.myRequests")}
                </TabsTrigger>
              </TabsList>

              {/* ---- Incoming ---- */}
              <TabsContent value="incoming">
                {incoming.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                      <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-1">{t("messages.noIncomingInquiries")}</h3>
                      <p className="text-muted-foreground text-sm">
                        {t("messages.incomingInquiriesHint")}
                      </p>
                      <Link to="/services" className="mt-4">
                        <Button variant="outline">{t("actions.manageServices")}</Button>
                      </Link>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {incoming.map(({ inquiry, service, buyer }) => (
                      <Card key={inquiry.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            <Avatar className="h-10 w-10 shrink-0">
                              <AvatarFallback>{initialsFromWords(buyer.name)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="font-semibold">{buyer.name}</span>
                                <StatusBadge status={inquiry.status} />
                                <Badge
                                  variant="outline"
                                  className="text-xs text-muted-foreground"
                                >
                                  {inquiry.orderType === "purchase" ? t("labels.orderType.purchase") : t("labels.orderType.inquiry")}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-1">
                                <span className="font-medium text-foreground">{service.title}</span>
                                {" · "}
                                {inquiry.orderType === "purchase" && (
                                  <span className="text-sky-600 font-medium">
                                    {formatCentsPlain(inquiry.paidAmountCents)}
                                  </span>
                                )}
                              </p>
                              {inquiry.message && (
                                <p className="text-sm bg-muted rounded-md px-3 py-2 mt-2">
                                  <MessageSquare className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />
                                  {inquiry.message}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-2">
                                {timeAgo(inquiry.createdAt)}
                              </p>
                            </div>

                            {/* Actions (only for pending) */}
                            {inquiry.status === "pending" && (
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600 border-green-300 hover:bg-green-50"
                                  disabled={updating === inquiry.id}
                                  onClick={() =>
                                    handleUpdateStatus(inquiry.id, "accepted")
                                  }
                                >
                                  {updating === inquiry.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4 mr-1" />
                                  )}
                                  {t("actions.accept")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                  disabled={updating === inquiry.id}
                                  onClick={() =>
                                    handleUpdateStatus(inquiry.id, "rejected")
                                  }
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  {t("actions.decline")}
                                </Button>
                              </div>
                            )}
                            {inquiry.status === "accepted" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                                disabled={updating === inquiry.id}
                                onClick={() =>
                                  handleUpdateStatus(inquiry.id, "completed")
                                }
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                {t("actions.markComplete")}
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ---- My Requests ---- */}
              <TabsContent value="sent">
                {myRequests.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                      <Send className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-1">{t("messages.noRequestsYet")}</h3>
                      <p className="text-muted-foreground text-sm">
                        {t("messages.browsePeopleHint")}
                      </p>
                      <Link to="/people" className="mt-4">
                        <Button variant="outline">{t("actions.browsePeople")}</Button>
                      </Link>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {myRequests.map(({ inquiry, service, provider }) => (
                      <Card key={inquiry.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            <Avatar className="h-10 w-10 shrink-0">
                              <AvatarFallback>{initialsFromWords(provider.name)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="font-semibold">{provider.name}</span>
                                <StatusBadge status={inquiry.status} />
                              </div>
                              <p className="text-sm text-muted-foreground mb-1">
                                <span className="font-medium text-foreground">{service.title}</span>
                                {" · "}
                                {inquiry.orderType === "purchase" ? (
                                  <span className="text-sky-600 font-medium">
                                    {formatCentsPlain(inquiry.paidAmountCents)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">{t("labels.orderType.inquiry")}</span>
                                )}
                              </p>
                              {inquiry.message && (
                                <p className="text-sm bg-muted rounded-md px-3 py-2 mt-2">
                                  {inquiry.message}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {timeAgo(inquiry.createdAt)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </main>
    </AppShell>
  );
}

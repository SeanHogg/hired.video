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
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
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
import { useSidebar } from "@/hooks/use-sidebar";
import {
  servicesService,
  type InquiryWithDetails,
  type MyRequestWithDetails,
} from "@/lib/services/services-service";
import { toast } from "sonner";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Pending", variant: "secondary" },
  accepted: { label: "Accepted", variant: "default" },
  rejected: { label: "Declined", variant: "destructive" },
  completed: { label: "Completed", variant: "outline" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ServiceInquiries() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

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
      toast.error("Failed to load inquiries");
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
      toast.success(`Inquiry ${status}`);
    } catch {
      toast.error("Failed to update inquiry");
    } finally {
      setUpdating(null);
    }
  }

  const pendingCount = incoming.filter((i) => i.inquiry.status === "pending").length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation onSidebarToggle={toggleSidebar} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Link to="/services">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                Inquiries & Leads
                {pendingCount > 0 && (
                  <Badge className="ml-1">{pendingCount} new</Badge>
                )}
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage service requests and track your outgoing inquiries
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
                  Incoming
                  {pendingCount > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-xs">
                      {pendingCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="sent" className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  My Requests
                </TabsTrigger>
              </TabsList>

              {/* ---- Incoming ---- */}
              <TabsContent value="incoming">
                {incoming.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                      <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-1">No incoming inquiries</h3>
                      <p className="text-muted-foreground text-sm">
                        When someone requests one of your services, it will appear here.
                      </p>
                      <Link to="/services" className="mt-4">
                        <Button variant="outline">Manage Services</Button>
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
                              <AvatarFallback>{initials(buyer.name)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="font-semibold">{buyer.name}</span>
                                <StatusBadge status={inquiry.status} />
                                <Badge
                                  variant="outline"
                                  className="text-xs text-muted-foreground"
                                >
                                  {inquiry.orderType === "purchase" ? "Purchase" : "Inquiry"}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-1">
                                <span className="font-medium text-foreground">{service.title}</span>
                                {" · "}
                                {inquiry.orderType === "purchase" && (
                                  <span className="text-violet-600 font-medium">
                                    {formatPrice(inquiry.paidAmountCents)}
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
                                  Accept
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
                                  Decline
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
                                Complete
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
                      <h3 className="text-lg font-medium mb-1">No requests yet</h3>
                      <p className="text-muted-foreground text-sm">
                        Browse people's profiles to find and request services.
                      </p>
                      <Link to="/people" className="mt-4">
                        <Button variant="outline">Browse People</Button>
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
                              <AvatarFallback>{initials(provider.name)}</AvatarFallback>
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
                                  <span className="text-violet-600 font-medium">
                                    {formatPrice(inquiry.paidAmountCents)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">Inquiry</span>
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
      </div>
      <Footer />
    </div>
  );
}

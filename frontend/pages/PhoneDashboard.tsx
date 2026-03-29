import {
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  MessageSquare,
  DollarSign,
  Settings,
  Plus,
  RefreshCw,
  Send,
  Volume2,
  Clock,
  BarChart3,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Edit,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import {
  phoneService,
  type BusinessPhoneNumber,
  type CallLog,
  type SmsMessage,
  type PhoneUsage,
  type PhoneBalance,
  type PhoneBalanceTransaction,
  type AvailableNumber,
} from "@/lib/services/phone-service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatPhone(num: string): string {
  const digits = num.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return num;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day:   "numeric",
    hour:  "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function callStatusIcon(status: CallLog["status"]) {
  if (status === "answered") return <PhoneCall className="h-4 w-4 text-green-500" />;
  if (status === "missed")   return <PhoneMissed className="h-4 w-4 text-red-500" />;
  if (status === "voicemail") return <Volume2 className="h-4 w-4 text-yellow-500" />;
  return <Phone className="h-4 w-4 text-muted-foreground" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PhoneDashboard() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  const [activeTab, setActiveTab] = useState<"overview" | "calls" | "messages" | "numbers" | "balance">("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [numbers, setNumbers]             = useState<BusinessPhoneNumber[]>([]);
  const [calls, setCalls]                 = useState<CallLog[]>([]);
  const [messages, setMessages]           = useState<SmsMessage[]>([]);
  const [usage, setUsage]                 = useState<PhoneUsage | null>(null);
  const [balance, setBalance]             = useState<PhoneBalance | null>(null);
  const [transactions, setTransactions]   = useState<PhoneBalanceTransaction[]>([]);

  // Provision dialog
  const [showProvisionDialog, setShowProvisionDialog] = useState(false);
  const [searchAreaCode, setSearchAreaCode]             = useState("");
  const [searchContains, setSearchContains]             = useState("");
  const [availableNumbers, setAvailableNumbers]         = useState<AvailableNumber[]>([]);
  const [searchLoading, setSearchLoading]               = useState(false);
  const [selectedNumber, setSelectedNumber]             = useState<string>("");
  const [newNumberName, setNewNumberName]               = useState("");
  const [provisionLoading, setProvisionLoading]         = useState(false);

  // Number settings dialog
  const [editNumber, setEditNumber]                     = useState<BusinessPhoneNumber | null>(null);
  const [editForwarding, setEditForwarding]             = useState("");
  const [editGreeting, setEditGreeting]                 = useState("");
  const [editVoicemail, setEditVoicemail]               = useState(true);
  const [editSaving, setEditSaving]                     = useState(false);

  // SMS compose dialog
  const [showSmsDialog, setShowSmsDialog]               = useState(false);
  const [smsFromId, setSmsFromId]                       = useState("");
  const [smsTo, setSmsTo]                               = useState("");
  const [smsBody, setSmsBody]                           = useState("");
  const [smsSending, setSmsSending]                     = useState(false);

  // Balance top-up dialog
  const [showTopupDialog, setShowTopupDialog]           = useState(false);
  const [topupAmount, setTopupAmount]                   = useState("20");
  const [topupLoading, setTopupLoading]                 = useState(false);

  // Auto top-up save
  const [autoTopupLoading, setAutoTopupLoading]         = useState(false);
  const [autoTopupEnabled, setAutoTopupEnabled]         = useState(false);
  const [autoTopupThreshold, setAutoTopupThreshold]     = useState("5");
  const [autoTopupAmount, setAutoTopupAmount]           = useState("20");

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const [numsData, callsData, smsData, usageData, balData] = await Promise.all([
          phoneService.getNumbers().catch(() => []),
          phoneService.getCalls({ limit: 50 }).catch(() => ({ calls: [], total: 0 })),
          phoneService.getSms({ limit: 50 }).catch(() => ({ messages: [], total: 0 })),
          phoneService.getUsage().catch(() => null),
          phoneService.getBalance().catch(() => null),
        ]);
        setNumbers(numsData);
        setCalls(callsData.calls);
        setMessages(smsData.messages);
        setUsage(usageData);
        if (balData) {
          setBalance(balData.balance);
          setTransactions(balData.transactions);
          setAutoTopupEnabled(balData.balance.autoTopUpEnabled);
          setAutoTopupThreshold(String(balData.balance.autoTopUpThresholdCents / 100));
          setAutoTopupAmount(String(balData.balance.autoTopUpAmountCents / 100));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load phone data");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [isAuthenticated, user]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleSearchNumbers = async () => {
    setSearchLoading(true);
    try {
      const results = await phoneService.searchAvailable({
        areaCode: searchAreaCode || undefined,
        contains: searchContains || undefined,
      });
      setAvailableNumbers(results);
    } catch {
      setAvailableNumbers([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleProvision = async () => {
    if (!selectedNumber) return;
    setProvisionLoading(true);
    try {
      const num = await phoneService.provisionNumber(selectedNumber, newNumberName || undefined);
      setNumbers((prev) => [num, ...prev]);
      setShowProvisionDialog(false);
      setSelectedNumber("");
      setNewNumberName("");
      setAvailableNumbers([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to provision number");
    } finally {
      setProvisionLoading(false);
    }
  };

  const handleOpenEdit = (num: BusinessPhoneNumber) => {
    setEditNumber(num);
    setEditForwarding(num.forwardingNumber ?? "");
    setEditGreeting(num.greetingText ?? "");
    setEditVoicemail(num.voicemailEnabled);
  };

  const handleSaveNumber = async () => {
    if (!editNumber) return;
    setEditSaving(true);
    try {
      const updated = await phoneService.updateNumber(editNumber.id, {
        forwardingNumber: editForwarding || null,
        greetingText:     editGreeting   || null,
        voicemailEnabled: editVoicemail,
      });
      setNumbers((prev) => prev.map((n) => n.id === updated.id ? updated : n));
      setEditNumber(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEditSaving(false);
    }
  };

  const handleReleaseNumber = async (id: string) => {
    if (!confirm("Release this number? It cannot be undone.")) return;
    await phoneService.releaseNumber(id).catch(() => undefined);
    setNumbers((prev) => prev.filter((n) => n.id !== id));
  };

  const handleSendSms = async () => {
    if (!smsFromId || !smsTo || !smsBody) return;
    setSmsSending(true);
    try {
      const msg = await phoneService.sendSms({ phoneNumberId: smsFromId, to: smsTo, body: smsBody });
      setMessages((prev) => [msg, ...prev]);
      setShowSmsDialog(false);
      setSmsTo("");
      setSmsBody("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send SMS");
    } finally {
      setSmsSending(false);
    }
  };

  const handleTopup = async () => {
    const cents = Math.round(parseFloat(topupAmount) * 100);
    if (!cents || cents < 500) return;
    setTopupLoading(true);
    try {
      const res = await phoneService.createTopupSession(cents);
      window.location.href = res.checkoutUrl;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create checkout");
    } finally {
      setTopupLoading(false);
    }
  };

  const handleSaveAutoTopup = async () => {
    setAutoTopupLoading(true);
    try {
      const updated = await phoneService.updateAutoTopup({
        enabled:        autoTopupEnabled,
        thresholdCents: Math.round(parseFloat(autoTopupThreshold) * 100),
        amountCents:    Math.round(parseFloat(autoTopupAmount) * 100),
      });
      setBalance(updated);
    } catch {
      // ignore
    } finally {
      setAutoTopupLoading(false);
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const minutePct = usage ? Math.min((usage.minutesUsed / usage.minutesIncluded) * 100, 100) : 0;
  const smsPct    = usage ? Math.min((usage.smsUsed    / usage.smsIncluded)    * 100, 100) : 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
          <div className="pt-16 flex items-center justify-center min-h-screen">
            <p className="text-muted-foreground">Please sign in to access Business Phone.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
        <main className="pt-16">
          <div className="container mx-auto px-4 py-8 max-w-6xl">

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                  <Phone className="h-8 w-8 text-brand-purple" />
                  Business Phone
                </h1>
                <p className="text-muted-foreground mt-1">
                  Professional phone number with call forwarding, voicemail, and SMS — built for recruiting.
                </p>
              </div>
              <Button
                onClick={() => setShowProvisionDialog(true)}
                className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
              >
                <Plus className="h-4 w-4 mr-2" />
                Get a Number
              </Button>
            </div>

            {error && (
              <div className="mb-6 flex items-center gap-2 text-destructive bg-destructive/10 rounded-lg p-4">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                {error}
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <TabsList className="grid grid-cols-5 w-full mb-8">
                  <TabsTrigger value="overview" className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Overview
                  </TabsTrigger>
                  <TabsTrigger value="calls" className="flex items-center gap-2">
                    <PhoneCall className="h-4 w-4" /> Call Log
                    {calls.filter((c) => c.status === "missed").length > 0 && (
                      <Badge variant="destructive" className="ml-1 h-5 text-xs">
                        {calls.filter((c) => c.status === "missed").length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="messages" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" /> Messages
                    {messages.filter((m) => m.status === "unread").length > 0 && (
                      <Badge variant="destructive" className="ml-1 h-5 text-xs">
                        {messages.filter((m) => m.status === "unread").length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="numbers" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" /> Numbers
                  </TabsTrigger>
                  <TabsTrigger value="balance" className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" /> Balance
                  </TabsTrigger>
                </TabsList>

                {/* ── Overview ─────────────────────────────────────────────── */}
                <TabsContent value="overview" className="space-y-6">
                  {/* Usage meters */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <PhoneCall className="h-4 w-4" /> Voice Minutes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-xl">{usage?.minutesUsed ?? 0}</span>
                          <span className="text-muted-foreground">/ {usage?.minutesIncluded ?? 100} min</span>
                        </div>
                        <Progress
                          value={minutePct}
                          className={`h-2 ${minutePct >= 100 ? "[&>div]:bg-red-500" : minutePct >= 80 ? "[&>div]:bg-yellow-500" : ""}`}
                        />
                        {minutePct >= 80 && (
                          <p className="text-xs text-yellow-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {minutePct >= 100 ? "Limit reached — overage billed from balance" : "Approaching monthly limit"}
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" /> SMS / MMS
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-xl">{usage?.smsUsed ?? 0}</span>
                          <span className="text-muted-foreground">/ {usage?.smsIncluded ?? 100} SMS</span>
                        </div>
                        <Progress
                          value={smsPct}
                          className={`h-2 ${smsPct >= 100 ? "[&>div]:bg-red-500" : smsPct >= 80 ? "[&>div]:bg-yellow-500" : ""}`}
                        />
                        {smsPct >= 80 && (
                          <p className="text-xs text-yellow-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {smsPct >= 100 ? "Limit reached — overage billed from balance" : "Approaching monthly limit"}
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <DollarSign className="h-4 w-4" /> Prepaid Balance
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-2xl font-bold">
                          ${((balance?.balanceCents ?? 0) / 100).toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">Used for overage ($0.03/min · $0.01/SMS)</p>
                        <Button size="sm" variant="outline" onClick={() => { setActiveTab("balance"); setShowTopupDialog(true); }}>
                          Top Up Balance
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Active numbers */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Phone className="h-5 w-5 text-brand-purple" />
                        Your Phone Numbers
                      </CardTitle>
                      <CardDescription>
                        {numbers.length === 0 ? "No numbers provisioned yet." : `${numbers.length} active number${numbers.length !== 1 ? "s" : ""}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {numbers.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                          <Phone className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p className="mb-4">Get a professional phone number for your recruiting business.</p>
                          <Button onClick={() => setShowProvisionDialog(true)}>
                            <Plus className="h-4 w-4 mr-2" /> Get Your First Number
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {numbers.map((num) => (
                            <div key={num.id} className="flex items-center justify-between p-4 rounded-lg border bg-muted/20">
                              <div>
                                <div className="font-semibold text-lg">{formatPhone(num.phoneNumber)}</div>
                                {num.friendlyName && <div className="text-sm text-muted-foreground">{num.friendlyName}</div>}
                                <div className="flex gap-2 mt-1">
                                  {num.forwardingNumber && (
                                    <Badge variant="outline" className="text-xs">
                                      Forwards to {formatPhone(num.forwardingNumber)}
                                    </Badge>
                                  )}
                                  {num.voicemailEnabled && <Badge variant="outline" className="text-xs">Voicemail on</Badge>}
                                </div>
                              </div>
                              <Button size="sm" variant="outline" onClick={() => handleOpenEdit(num)}>
                                <Settings className="h-4 w-4 mr-1" /> Settings
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Recent calls */}
                  {calls.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Clock className="h-4 w-4" /> Recent Calls
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {calls.slice(0, 5).map((call) => (
                            <div key={call.id} className="flex items-center gap-3 text-sm py-2 border-b last:border-0">
                              {callStatusIcon(call.status)}
                              <div className="flex-1">
                                <span className="font-medium">{formatPhone(call.direction === "inbound" ? call.callerNumber : call.calledNumber)}</span>
                                <span className="text-muted-foreground ml-2">{call.direction === "inbound" ? "Inbound" : "Outbound"}</span>
                              </div>
                              <span className="text-muted-foreground">{formatDuration(call.durationSeconds)}</span>
                              <span className="text-muted-foreground text-xs">{formatDate(call.createdAt)}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* ── Call Log ─────────────────────────────────────────────── */}
                <TabsContent value="calls" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Call Log</CardTitle>
                        <Button size="sm" variant="outline">
                          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {calls.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <PhoneCall className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p>No calls yet. Calls will appear here once your number is active.</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Status</TableHead>
                              <TableHead>Direction</TableHead>
                              <TableHead>Number</TableHead>
                              <TableHead>Duration</TableHead>
                              <TableHead>Time</TableHead>
                              <TableHead>Recording</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {calls.map((call) => (
                              <TableRow key={call.id}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {callStatusIcon(call.status)}
                                    <span className="capitalize text-sm">{call.status}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 text-sm">
                                    {call.direction === "inbound"
                                      ? <><PhoneIncoming className="h-4 w-4 text-blue-500" /> Inbound</>
                                      : <><PhoneOutgoing className="h-4 w-4 text-purple-500" /> Outbound</>
                                    }
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-sm">
                                  {formatPhone(call.direction === "inbound" ? call.callerNumber : call.calledNumber)}
                                </TableCell>
                                <TableCell>{formatDuration(call.durationSeconds)}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{formatDate(call.createdAt)}</TableCell>
                                <TableCell>
                                  {call.recordingUrl ? (
                                    <audio controls src={call.recordingUrl} className="h-8 w-40" />
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Messages ─────────────────────────────────────────────── */}
                <TabsContent value="messages" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>SMS Messages</CardTitle>
                        <Button
                          size="sm"
                          onClick={() => { setShowSmsDialog(true); if (numbers.length > 0) setSmsFromId(numbers[0].id); }}
                          disabled={numbers.length === 0}
                          className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                        >
                          <Send className="h-4 w-4 mr-2" /> Send SMS
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {messages.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p>No messages yet. Send your first SMS to a candidate.</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Direction</TableHead>
                              <TableHead>From</TableHead>
                              <TableHead>To</TableHead>
                              <TableHead>Message</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Time</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {messages.map((msg) => (
                              <TableRow key={msg.id} className={msg.status === "unread" ? "bg-blue-50/30" : ""}>
                                <TableCell>
                                  <Badge variant={msg.direction === "inbound" ? "default" : "secondary"} className="text-xs">
                                    {msg.direction === "inbound" ? "Received" : "Sent"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{formatPhone(msg.fromNumber)}</TableCell>
                                <TableCell className="font-mono text-sm">{formatPhone(msg.toNumber)}</TableCell>
                                <TableCell className="max-w-xs truncate text-sm">{msg.body}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs capitalize">{msg.status}</Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{formatDate(msg.createdAt)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Numbers ──────────────────────────────────────────────── */}
                <TabsContent value="numbers" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Phone Numbers</CardTitle>
                          <CardDescription>1 number included on Pro · Additional numbers $2/mo each</CardDescription>
                        </div>
                        <Button onClick={() => setShowProvisionDialog(true)}
                          className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                          <Plus className="h-4 w-4 mr-2" /> Add Number
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {numbers.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <Phone className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p className="mb-4">No numbers yet. Get a professional number to start receiving calls and SMS.</p>
                          <Button onClick={() => setShowProvisionDialog(true)}>
                            <Plus className="h-4 w-4 mr-2" /> Get a Number
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {numbers.map((num) => (
                            <div key={num.id} className="border rounded-lg p-5 space-y-3">
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="text-xl font-bold font-mono">{formatPhone(num.phoneNumber)}</div>
                                  {num.friendlyName && (
                                    <div className="text-sm text-muted-foreground">{num.friendlyName}</div>
                                  )}
                                  <Badge className="mt-1 text-xs capitalize" variant={num.status === "active" ? "default" : "secondary"}>
                                    {num.status}
                                  </Badge>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => handleOpenEdit(num)}>
                                    <Edit className="h-4 w-4 mr-1" /> Edit
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                    onClick={() => handleReleaseNumber(num.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                                <div className="bg-muted/30 rounded p-3">
                                  <div className="text-xs text-muted-foreground mb-1">Forwarding</div>
                                  <div className="font-medium">{num.forwardingNumber ? formatPhone(num.forwardingNumber) : "Not set"}</div>
                                </div>
                                <div className="bg-muted/30 rounded p-3">
                                  <div className="text-xs text-muted-foreground mb-1">Voicemail</div>
                                  <div className="font-medium">{num.voicemailEnabled ? "Enabled" : "Disabled"}</div>
                                </div>
                                <div className="bg-muted/30 rounded p-3">
                                  <div className="text-xs text-muted-foreground mb-1">DND Schedule</div>
                                  <div className="font-medium">{num.dndSchedule ? `${num.dndSchedule.length} window${num.dndSchedule.length !== 1 ? "s" : ""}` : "Off"}</div>
                                </div>
                              </div>
                              {num.greetingText && (
                                <div className="text-sm text-muted-foreground italic bg-muted/20 rounded p-3">
                                  <span className="font-medium not-italic text-foreground">Greeting: </span>
                                  {num.greetingText}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── Balance ──────────────────────────────────────────────── */}
                <TabsContent value="balance" className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Current balance */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Prepaid Balance</CardTitle>
                        <CardDescription>Used when monthly included minutes/SMS are exceeded</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="text-4xl font-bold text-brand-purple">
                          ${((balance?.balanceCents ?? 0) / 100).toFixed(2)}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div>Voice overage: $0.03/minute</div>
                          <div>SMS overage: $0.01/message</div>
                        </div>
                        <Button
                          onClick={() => setShowTopupDialog(true)}
                          className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                        >
                          <DollarSign className="h-4 w-4 mr-2" /> Top Up Balance
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Auto top-up */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Auto Top-Up</CardTitle>
                        <CardDescription>Automatically add credits to avoid service interruption</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="auto-topup">Enable auto top-up</Label>
                          <Switch
                            id="auto-topup"
                            checked={autoTopupEnabled}
                            onCheckedChange={setAutoTopupEnabled}
                          />
                        </div>
                        {autoTopupEnabled && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-sm">Top up when balance drops below</Label>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  value={autoTopupThreshold}
                                  onChange={(e) => setAutoTopupThreshold(e.target.value)}
                                  className="w-24"
                                  min="1"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-sm">Add this amount</Label>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  value={autoTopupAmount}
                                  onChange={(e) => setAutoTopupAmount(e.target.value)}
                                  className="w-24"
                                  min="5"
                                />
                              </div>
                            </div>
                          </>
                        )}
                        <Button
                          variant="outline"
                          onClick={handleSaveAutoTopup}
                          disabled={autoTopupLoading}
                          className="w-full"
                        >
                          {autoTopupLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                          Save Settings
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Transaction history */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Transaction History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {transactions.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">No transactions yet.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Type</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead className="text-right">Balance After</TableHead>
                              <TableHead>Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {transactions.map((tx) => (
                              <TableRow key={tx.id}>
                                <TableCell>
                                  <Badge variant={tx.amountCents > 0 ? "default" : "secondary"} className="text-xs capitalize">
                                    {tx.type.replace(/_/g, " ")}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">{tx.description ?? "—"}</TableCell>
                                <TableCell className={`text-right font-medium ${tx.amountCents > 0 ? "text-green-600" : "text-red-500"}`}>
                                  {tx.amountCents > 0 ? "+" : ""}${(Math.abs(tx.amountCents) / 100).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right text-sm">${(tx.balanceCentsAfter / 100).toFixed(2)}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </main>
      </div>
      <Footer />

      {/* ── Provision Number Dialog ─────────────────────────────────────────── */}
      <Dialog open={showProvisionDialog} onOpenChange={setShowProvisionDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Get a Phone Number</DialogTitle>
            <DialogDescription>Search for an available number and provision it instantly.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Area Code (optional)</Label>
                <Input placeholder="e.g. 415" value={searchAreaCode} onChange={(e) => setSearchAreaCode(e.target.value)} maxLength={3} />
              </div>
              <div className="space-y-1">
                <Label>Contains digits (optional)</Label>
                <Input placeholder="e.g. 555" value={searchContains} onChange={(e) => setSearchContains(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleSearchNumbers} disabled={searchLoading} variant="outline" className="w-full">
              {searchLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
              Search Available Numbers
            </Button>

            {availableNumbers.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                {availableNumbers.map((num) => (
                  <div
                    key={num.phoneNumber}
                    className={`flex items-center justify-between p-3 rounded cursor-pointer border transition-colors ${selectedNumber === num.phoneNumber ? "border-brand-purple bg-brand-purple/10" : "border-transparent hover:bg-muted/40"}`}
                    onClick={() => setSelectedNumber(num.phoneNumber)}
                  >
                    <span className="font-mono font-medium">{num.friendlyName}</span>
                    {num.locality && <span className="text-sm text-muted-foreground">{num.locality}</span>}
                    {selectedNumber === num.phoneNumber && <CheckCircle className="h-4 w-4 text-brand-purple" />}
                  </div>
                ))}
              </div>
            )}

            {selectedNumber && (
              <div className="space-y-1">
                <Label>Friendly name (optional)</Label>
                <Input
                  placeholder="e.g. Recruiting Line, East Coast"
                  value={newNumberName}
                  onChange={(e) => setNewNumberName(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProvisionDialog(false)}>Cancel</Button>
            <Button
              disabled={!selectedNumber || provisionLoading}
              onClick={handleProvision}
              className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
            >
              {provisionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
              Provision Number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Number Dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!editNumber} onOpenChange={(open) => { if (!open) setEditNumber(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Number Settings</DialogTitle>
            {editNumber && (
              <DialogDescription>{formatPhone(editNumber.phoneNumber)}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Forward calls to</Label>
              <Input
                placeholder="+1 (555) 000-0000"
                value={editForwarding}
                onChange={(e) => setEditForwarding(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Inbound calls ring this number. Leave blank for voicemail-only.</p>
            </div>
            <div className="space-y-1">
              <Label>Greeting (Text-to-Speech)</Label>
              <Textarea
                placeholder="e.g. You've reached Acme Recruiting. Please hold while we connect your call."
                value={editGreeting}
                onChange={(e) => setEditGreeting(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">Played before forwarding or voicemail.</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Voicemail</Label>
                <p className="text-xs text-muted-foreground">Record a message when calls are not answered</p>
              </div>
              <Switch checked={editVoicemail} onCheckedChange={setEditVoicemail} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNumber(null)}>Cancel</Button>
            <Button
              onClick={handleSaveNumber}
              disabled={editSaving}
              className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
            >
              {editSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Send SMS Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={showSmsDialog} onOpenChange={setShowSmsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send SMS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>From number</Label>
              <Select value={smsFromId} onValueChange={setSmsFromId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your number" />
                </SelectTrigger>
                <SelectContent>
                  {numbers.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.friendlyName ?? formatPhone(n.phoneNumber)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>To number</Label>
              <Input placeholder="+1 (555) 000-0000" value={smsTo} onChange={(e) => setSmsTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Message</Label>
              <Textarea
                placeholder="Type your message..."
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                rows={4}
                maxLength={1600}
              />
              <p className="text-xs text-muted-foreground text-right">{smsBody.length}/1600</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSmsDialog(false)}>Cancel</Button>
            <Button
              disabled={!smsFromId || !smsTo || !smsBody || smsSending}
              onClick={handleSendSms}
              className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
            >
              {smsSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Top-Up Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={showTopupDialog} onOpenChange={setShowTopupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top Up Balance</DialogTitle>
            <DialogDescription>Add credits for overage voice minutes and SMS.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {["10", "20", "50"].map((amt) => (
                <Button
                  key={amt}
                  variant={topupAmount === amt ? "default" : "outline"}
                  onClick={() => setTopupAmount(amt)}
                  className={topupAmount === amt ? "bg-brand-purple hover:bg-brand-purple/90" : ""}
                >
                  ${amt}
                </Button>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Custom amount</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  min="5"
                  max="1000"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTopupDialog(false)}>Cancel</Button>
            <Button
              disabled={!topupAmount || parseFloat(topupAmount) < 5 || topupLoading}
              onClick={handleTopup}
              className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
            >
              {topupLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DollarSign className="h-4 w-4 mr-2" />}
              Checkout ${topupAmount}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

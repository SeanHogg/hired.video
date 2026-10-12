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
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
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
import { useAuth } from "@/lib/auth";
import { confirmDialog, alertDialog } from "@/lib/dialogs";
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
  const { t } = useTranslation();
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
        setError(err instanceof Error ? err.message : t("errors.failedToLoadPhoneData"));
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
      await alertDialog({ title: t("dialogs.phone.errorTitle"), description: err instanceof Error ? err.message : t("errors.failedToProvisionNumber") });
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
      await alertDialog({ title: t("dialogs.phone.errorTitle"), description: err instanceof Error ? err.message : t("errors.failedToSave") });
    } finally {
      setEditSaving(false);
    }
  };

  const handleReleaseNumber = async (id: string) => {
    if (!(await confirmDialog({ title: t("dialogs.phone.releaseTitle"), description: t("messages.confirmReleaseNumber"), confirmText: t("dialogs.phone.releaseConfirm"), destructive: true }))) return;
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
      await alertDialog({ title: t("dialogs.phone.errorTitle"), description: err instanceof Error ? err.message : t("errors.failedToSendSms") });
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
      await alertDialog({ title: t("dialogs.phone.errorTitle"), description: err instanceof Error ? err.message : t("errors.failedToCreateCheckout") });
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
      <AppShell bgClassName="bg-background">
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-muted-foreground">{t("messages.signInForBusinessPhone")}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <main>
        <div className="px-4 py-8">

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                  <Phone className="h-8 w-8 text-brand-primary" />
                  {t("headings.businessPhone")}
                </h1>
                <p className="text-muted-foreground mt-1">
                  {t("messages.businessPhoneIntro")}
                </p>
              </div>
              <Button
                onClick={() => setShowProvisionDialog(true)}
                className="bg-primary hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("actions.getANumber")}
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
                <div className="w-full overflow-x-auto mb-8">
                  <TabsList className="inline-flex w-max gap-1 sm:grid sm:w-full sm:grid-cols-5">
                    <TabsTrigger value="overview" className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" /> {t("tabs.overview")}
                    </TabsTrigger>
                    <TabsTrigger value="calls" className="flex items-center gap-2">
                      <PhoneCall className="h-4 w-4" /> {t("tabs.callLog")}
                      {calls.filter((c) => c.status === "missed").length > 0 && (
                        <Badge variant="destructive" className="ml-1 h-5 text-xs">
                          {calls.filter((c) => c.status === "missed").length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="messages" className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" /> {t("tabs.messages")}
                      {messages.filter((m) => m.status === "unread").length > 0 && (
                        <Badge variant="destructive" className="ml-1 h-5 text-xs">
                          {messages.filter((m) => m.status === "unread").length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="numbers" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" /> {t("tabs.numbers")}
                    </TabsTrigger>
                    <TabsTrigger value="balance" className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" /> {t("tabs.balance")}
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* ── Overview ─────────────────────────────────────────────── */}
                <TabsContent value="overview" className="space-y-6">
                  {/* Usage meters */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <PhoneCall className="h-4 w-4" /> {t("metrics.voiceMinutes")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-xl">{usage?.minutesUsed ?? 0}</span>
                          <span className="text-muted-foreground">{t("labels.minOutOf", { total: usage?.minutesIncluded ?? 100 })}</span>
                        </div>
                        <Progress
                          value={minutePct}
                          className={`h-2 ${minutePct >= 100 ? "[&>div]:bg-red-500" : minutePct >= 80 ? "[&>div]:bg-yellow-500" : ""}`}
                        />
                        {minutePct >= 80 && (
                          <p className="text-xs text-yellow-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {minutePct >= 100 ? t("messages.limitReached") : t("messages.approachingLimit")}
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" /> {t("metrics.smsMms")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-xl">{usage?.smsUsed ?? 0}</span>
                          <span className="text-muted-foreground">{t("labels.smsOutOf", { total: usage?.smsIncluded ?? 100 })}</span>
                        </div>
                        <Progress
                          value={smsPct}
                          className={`h-2 ${smsPct >= 100 ? "[&>div]:bg-red-500" : smsPct >= 80 ? "[&>div]:bg-yellow-500" : ""}`}
                        />
                        {smsPct >= 80 && (
                          <p className="text-xs text-yellow-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {smsPct >= 100 ? t("messages.limitReached") : t("messages.approachingLimit")}
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <DollarSign className="h-4 w-4" /> {t("metrics.prepaidBalance")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="text-2xl font-bold">
                          ${((balance?.balanceCents ?? 0) / 100).toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">{t("messages.overageRates")}</p>
                        <Button size="sm" variant="outline" onClick={() => { setActiveTab("balance"); setShowTopupDialog(true); }}>
                          {t("actions.topUpBalance")}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Active numbers */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Phone className="h-5 w-5 text-brand-primary" />
                        {t("headings.yourPhoneNumbers")}
                      </CardTitle>
                      <CardDescription>
                        {numbers.length === 0 ? t("messages.noNumbersProvisioned") : t("messages.activeNumbersCount", { count: numbers.length })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {numbers.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                          <Phone className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p className="mb-4">{t("messages.getProfessionalNumber")}</p>
                          <Button onClick={() => setShowProvisionDialog(true)}>
                            <Plus className="h-4 w-4 mr-2" /> {t("actions.getFirstNumber")}
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
                                      {t("labels.forwardsTo", { number: formatPhone(num.forwardingNumber) })}
                                    </Badge>
                                  )}
                                  {num.voicemailEnabled && <Badge variant="outline" className="text-xs">{t("labels.voicemailOn")}</Badge>}
                                </div>
                              </div>
                              <Button size="sm" variant="outline" onClick={() => handleOpenEdit(num)}>
                                <Settings className="h-4 w-4 mr-1" /> {t("actions.numberSettings")}
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
                          <Clock className="h-4 w-4" /> {t("headings.recentCalls")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {calls.slice(0, 5).map((call) => (
                            <div key={call.id} className="flex items-center gap-3 text-sm py-2 border-b last:border-0">
                              {callStatusIcon(call.status)}
                              <div className="flex-1">
                                <span className="font-medium">{formatPhone(call.direction === "inbound" ? call.callerNumber : call.calledNumber)}</span>
                                <span className="text-muted-foreground ml-2">{call.direction === "inbound" ? t("labels.inbound") : t("labels.outbound")}</span>
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
                        <CardTitle>{t("headings.callLog")}</CardTitle>
                        <Button size="sm" variant="outline">
                          <RefreshCw className="h-4 w-4 mr-2" /> {t("actions.refresh")}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {calls.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <PhoneCall className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p>{t("messages.noCallsYet")}</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("labels.callStatus")}</TableHead>
                              <TableHead>{t("labels.callDirection")}</TableHead>
                              <TableHead>{t("labels.callNumber")}</TableHead>
                              <TableHead>{t("labels.callDuration")}</TableHead>
                              <TableHead>{t("labels.callTime")}</TableHead>
                              <TableHead>{t("labels.callRecording")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {calls.map((call) => (
                              <TableRow key={call.id}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {callStatusIcon(call.status)}
                                    <span className="capitalize text-sm">{t(`status.callStatus.${call.status}`, { defaultValue: call.status })}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 text-sm">
                                    {call.direction === "inbound"
                                      ? <><PhoneIncoming className="h-4 w-4 text-primary" /> {t("labels.inbound")}</>
                                      : <><PhoneOutgoing className="h-4 w-4 text-primary" /> {t("labels.outbound")}</>
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
                        <CardTitle>{t("headings.smsMessages")}</CardTitle>
                        <Button
                          size="sm"
                          onClick={() => { setShowSmsDialog(true); if (numbers.length > 0) setSmsFromId(numbers[0].id); }}
                          disabled={numbers.length === 0}
                          className="bg-primary hover:bg-primary/90"
                        >
                          <Send className="h-4 w-4 mr-2" /> {t("actions.sendSms")}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {messages.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p>{t("messages.noMessagesYet")}</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("labels.messageDirection")}</TableHead>
                              <TableHead>{t("labels.messageFrom")}</TableHead>
                              <TableHead>{t("labels.messageTo")}</TableHead>
                              <TableHead>{t("labels.messageBody")}</TableHead>
                              <TableHead>{t("labels.messageStatus")}</TableHead>
                              <TableHead>{t("labels.messageTime")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {messages.map((msg) => (
                              <TableRow key={msg.id} className={msg.status === "unread" ? "bg-accent/30" : ""}>
                                <TableCell>
                                  <Badge variant={msg.direction === "inbound" ? "default" : "secondary"} className="text-xs">
                                    {msg.direction === "inbound" ? t("labels.received") : t("labels.sent")}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{formatPhone(msg.fromNumber)}</TableCell>
                                <TableCell className="font-mono text-sm">{formatPhone(msg.toNumber)}</TableCell>
                                <TableCell className="max-w-xs truncate text-sm">{msg.body}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs capitalize">{t(`status.smsStatus.${msg.status}`, { defaultValue: msg.status })}</Badge>
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
                          <CardTitle>{t("headings.phoneNumbers")}</CardTitle>
                          <CardDescription>{t("messages.numbersIncludedDesc")}</CardDescription>
                        </div>
                        <Button onClick={() => setShowProvisionDialog(true)}
                          className="bg-primary hover:bg-primary/90">
                          <Plus className="h-4 w-4 mr-2" /> {t("actions.addNumber")}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {numbers.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <Phone className="h-12 w-12 mx-auto mb-4 opacity-30" />
                          <p className="mb-4">{t("messages.noNumbersIntro")}</p>
                          <Button onClick={() => setShowProvisionDialog(true)}>
                            <Plus className="h-4 w-4 mr-2" /> {t("actions.getANumber")}
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
                                    {t(`status.numberStatus.${num.status}`, { defaultValue: num.status })}
                                  </Badge>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" variant="outline" onClick={() => handleOpenEdit(num)}>
                                    <Edit className="h-4 w-4 mr-1" /> {t("labels.editNumber")}
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                    onClick={() => handleReleaseNumber(num.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                                <div className="bg-muted/30 rounded p-3">
                                  <div className="text-xs text-muted-foreground mb-1">{t("labels.fieldForwarding")}</div>
                                  <div className="font-medium">{num.forwardingNumber ? formatPhone(num.forwardingNumber) : t("labels.notSet")}</div>
                                </div>
                                <div className="bg-muted/30 rounded p-3">
                                  <div className="text-xs text-muted-foreground mb-1">{t("labels.fieldVoicemail")}</div>
                                  <div className="font-medium">{num.voicemailEnabled ? t("labels.enabled") : t("labels.disabled")}</div>
                                </div>
                                <div className="bg-muted/30 rounded p-3">
                                  <div className="text-xs text-muted-foreground mb-1">{t("labels.dndSchedule")}</div>
                                  <div className="font-medium">{num.dndSchedule ? t("labels.dndWindowsCount", { count: num.dndSchedule.length }) : t("labels.dndOff")}</div>
                                </div>
                              </div>
                              {num.greetingText && (
                                <div className="text-sm text-muted-foreground italic bg-muted/20 rounded p-3">
                                  <span className="font-medium not-italic text-foreground">{t("labels.greetingPrefix")} </span>
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
                        <CardTitle>{t("metrics.prepaidBalance")}</CardTitle>
                        <CardDescription>{t("messages.usedWhenExceeded")}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="text-4xl font-bold text-brand-primary">
                          ${((balance?.balanceCents ?? 0) / 100).toFixed(2)}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div>{t("messages.voiceOverageRate")}</div>
                          <div>{t("messages.smsOverageRate")}</div>
                        </div>
                        <Button
                          onClick={() => setShowTopupDialog(true)}
                          className="w-full bg-primary hover:bg-primary/90"
                        >
                          <DollarSign className="h-4 w-4 mr-2" /> {t("actions.topUpBalance")}
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Auto top-up */}
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("headings.autoTopUp")}</CardTitle>
                        <CardDescription>{t("messages.autoTopUpDesc")}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="auto-topup">{t("labels.enableAutoTopUp")}</Label>
                          <Switch
                            id="auto-topup"
                            checked={autoTopupEnabled}
                            onCheckedChange={setAutoTopupEnabled}
                          />
                        </div>
                        {autoTopupEnabled && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-sm">{t("labels.topUpWhenBelow")}</Label>
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
                              <Label className="text-sm">{t("labels.addThisAmount")}</Label>
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
                          {t("actions.saveSettings")}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Transaction history */}
                  <Card>
                    <CardHeader>
                      <CardTitle>{t("headings.transactionHistory")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {transactions.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">{t("messages.noTransactions")}</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("labels.transactionType")}</TableHead>
                              <TableHead>{t("labels.transactionDescription")}</TableHead>
                              <TableHead className="text-right">{t("labels.transactionAmount")}</TableHead>
                              <TableHead className="text-right">{t("labels.balanceAfter")}</TableHead>
                              <TableHead>{t("labels.transactionDate")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {transactions.map((tx) => (
                              <TableRow key={tx.id}>
                                <TableCell>
                                  <Badge variant={tx.amountCents > 0 ? "default" : "secondary"} className="text-xs capitalize">
                                    {t(`status.transactionType.${tx.type}`, { defaultValue: tx.type.replace(/_/g, " ") })}
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

      {/* ── Provision Number Dialog ─────────────────────────────────────────── */}
      <Dialog open={showProvisionDialog} onOpenChange={setShowProvisionDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("headings.getPhoneNumber")}</DialogTitle>
            <DialogDescription>{t("messages.searchProvisionDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("fields.areaCode.label")}</Label>
                <Input placeholder={t("fields.areaCode.placeholder")} value={searchAreaCode} onChange={(e) => setSearchAreaCode(e.target.value)} maxLength={3} />
              </div>
              <div className="space-y-1">
                <Label>{t("fields.containsDigits.label")}</Label>
                <Input placeholder={t("fields.containsDigits.placeholder")} value={searchContains} onChange={(e) => setSearchContains(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleSearchNumbers} disabled={searchLoading} variant="outline" className="w-full">
              {searchLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
              {t("actions.searchAvailableNumbers")}
            </Button>

            {availableNumbers.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                {availableNumbers.map((num) => (
                  <div
                    key={num.phoneNumber}
                    className={`flex items-center justify-between p-3 rounded cursor-pointer border transition-colors ${selectedNumber === num.phoneNumber ? "border-brand-primary bg-brand-primary/10" : "border-transparent hover:bg-muted/40"}`}
                    onClick={() => setSelectedNumber(num.phoneNumber)}
                  >
                    <span className="font-mono font-medium">{num.friendlyName}</span>
                    {num.locality && <span className="text-sm text-muted-foreground">{num.locality}</span>}
                    {selectedNumber === num.phoneNumber && <CheckCircle className="h-4 w-4 text-brand-primary" />}
                  </div>
                ))}
              </div>
            )}

            {selectedNumber && (
              <div className="space-y-1">
                <Label>{t("fields.friendlyName.label")}</Label>
                <Input
                  placeholder={t("fields.friendlyName.placeholder")}
                  value={newNumberName}
                  onChange={(e) => setNewNumberName(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProvisionDialog(false)}>{t("actions.cancel")}</Button>
            <Button
              disabled={!selectedNumber || provisionLoading}
              onClick={handleProvision}
              className="bg-primary hover:bg-primary/90"
            >
              {provisionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
              {t("actions.provisionNumber")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Number Dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!editNumber} onOpenChange={(open) => { if (!open) setEditNumber(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("headings.numberSettingsDialog")}</DialogTitle>
            {editNumber && (
              <DialogDescription>{formatPhone(editNumber.phoneNumber)}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>{t("fields.forwardingNumber.label")}</Label>
              <Input
                placeholder={t("fields.forwardingNumber.placeholder")}
                value={editForwarding}
                onChange={(e) => setEditForwarding(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("messages.forwardingHelp")}</p>
            </div>
            <div className="space-y-1">
              <Label>{t("fields.greeting.label")}</Label>
              <Textarea
                placeholder={t("fields.greeting.placeholder")}
                value={editGreeting}
                onChange={(e) => setEditGreeting(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">{t("messages.greetingHelp")}</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>{t("labels.voicemailLabel")}</Label>
                <p className="text-xs text-muted-foreground">{t("messages.voicemailDesc")}</p>
              </div>
              <Switch checked={editVoicemail} onCheckedChange={setEditVoicemail} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNumber(null)}>{t("actions.cancel")}</Button>
            <Button
              onClick={handleSaveNumber}
              disabled={editSaving}
              className="bg-primary hover:bg-primary/90"
            >
              {editSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {t("actions.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Send SMS Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={showSmsDialog} onOpenChange={setShowSmsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("headings.sendSmsDialog")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>{t("fields.smsFrom.label")}</Label>
              <Select value={smsFromId} onValueChange={setSmsFromId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("fields.smsFrom.placeholder")} />
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
              <Label>{t("fields.smsTo.label")}</Label>
              <Input placeholder={t("fields.smsTo.placeholder")} value={smsTo} onChange={(e) => setSmsTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("fields.smsBody.label")}</Label>
              <Textarea
                placeholder={t("fields.smsBody.placeholder")}
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                rows={4}
                maxLength={1600}
              />
              <p className="text-xs text-muted-foreground text-right">{smsBody.length}/1600</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSmsDialog(false)}>{t("actions.cancel")}</Button>
            <Button
              disabled={!smsFromId || !smsTo || !smsBody || smsSending}
              onClick={handleSendSms}
              className="bg-primary hover:bg-primary/90"
            >
              {smsSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              {t("actions.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Top-Up Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={showTopupDialog} onOpenChange={setShowTopupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("headings.topUpBalanceDialog")}</DialogTitle>
            <DialogDescription>{t("messages.topUpDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {["10", "20", "50"].map((amt) => (
                <Button
                  key={amt}
                  variant={topupAmount === amt ? "default" : "outline"}
                  onClick={() => setTopupAmount(amt)}
                  className={topupAmount === amt ? "bg-brand-primary hover:bg-brand-primary/90" : ""}
                >
                  ${amt}
                </Button>
              ))}
            </div>
            <div className="space-y-1">
              <Label>{t("fields.customAmount.label")}</Label>
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
            <Button variant="outline" onClick={() => setShowTopupDialog(false)}>{t("actions.cancel")}</Button>
            <Button
              disabled={!topupAmount || parseFloat(topupAmount) < 5 || topupLoading}
              onClick={handleTopup}
              className="bg-primary hover:bg-primary/90"
            >
              {topupLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DollarSign className="h-4 w-4 mr-2" />}
              {t("actions.checkoutAmount", { amount: topupAmount })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

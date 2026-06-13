import {
  CheckSquare,
  Video,
  Sparkles,
  ArrowRight,
  Star,
  Calendar,
  Target,
  Clock,
  CheckCircle2,
  Play,
  Zap,
  BarChart3,
  Bell,
  List,
  Filter,
  TrendingUp,
  Users,
  FileText,
  Plus,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Table as TableIcon,
  AlertCircle,
  Flag,
  User,
  Building2,
  Briefcase,
  UserPlus,
  CreditCard,
  Upload,
  Search,
  Loader2,
} from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/components/AppShell";
import HeaderSearch from "@/components/HeaderSearch";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import { MyEventsAndCoffee } from "@/components/events/MyEventsAndCoffee";
// Lazy-loaded so `leaflet` + `react-leaflet` (~250 KB minified) only land
// in the bundle for users who hit the Discover tab on /tasks (gap #1366).
// `EventDiscoveryPanel` is a named export — `.then` re-shapes to default.
const EventDiscoveryPanel = lazy(() =>
  import("@/components/events/EventDiscoveryPanel").then((m) => ({
    default: m.EventDiscoveryPanel,
  })),
);
import { TimesheetTab } from "@/components/timesheet/TimesheetTab";
import MarketingFAQ from "@/components/MarketingFAQ";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { useAuth, USER_ROLES } from "@/lib/auth";
import TaskBoard from "@/components/tasks/TaskBoard";
import TaskDetailSheet from "@/components/tasks/TaskDetailSheet";
import { taskTypeColors, priorityColors } from "@/components/tasks/task-styles";
import { taskService } from "@/lib/services/task-service";
import {
  TaskDTO,
  TaskUIState,
  mapBackendTaskTypeToUI,
  mapBackendStatusToUI,
  mapUITaskTypeToBackend,
  mapUIStatusToBackend,
  TaskType,
  ProductivityItemStatus,
  CreateTaskRequest,
  UpdateTaskRequest,
  getAvailableTaskTypesForRole,
  getTaskTypeDisplayName,
  getStatusDisplayName,
} from "@/types/task";

// Use the TaskUIState interface from types/task.ts
interface Task extends TaskUIState {}

// taskTypeColors + priorityColors now live in components/tasks/task-styles.ts
// (shared with the reusable <TaskBoard> + <TaskDetailSheet>).

// Events FAQ lifted from the deleted /events page. Lives on the Discover
// surface so the marketing copy stays public (events are public per the
// consolidation decision — see [project_gap_register]).
const EVENTS_FAQ = [
  {
    question: "Who can host an event?",
    answer:
      "Any hired.video member can host. There's no upgrade — create unlimited free events, invite your network, and accept RSVPs.",
  },
  {
    question: "Is hosting events free?",
    answer:
      "Yes. Public RSVPs, waitlists, capacity, co-hosts, attendee matchmaking, reminder cadence — all included. Paid ticketing is on the roadmap; we'll never gate the free hosting flow behind a subscription.",
  },
  {
    question: "What kinds of events work best?",
    answer:
      "In-person meetups, online workshops, panels, career fairs, study groups, hackathons, demos, mixers, talks. Every event automatically gets the AI matchmaking layer so attendees see the people they should meet.",
  },
  {
    question: "How does attendee matchmaking work?",
    answer:
      "Default-on. We use the skill graph + skill evidence from members' profiles to suggest who each attendee should meet, ranked 0-100 with a one-line reason. Hosts can disable it per event.",
  },
];

export default function Tasks() {
  const { t } = useTranslation();  const { isAuthenticated, user } = useAuth();

  useSEO("/tasks");
  useBreadcrumbs([{ name: "Tasks, Events & Timesheet", url: "/tasks" }]);

  // View axis lives in the URL so the page-level breadcrumb tabs are
  // shareable + back-button friendly. `?tab=` controls the Tasks-view
  // axis (kanban/calendar/table); `?view=` is reserved for the Discover
  // sub-view (grid/map) so the two never collide.
  type TaskView = "calendar" | "table" | "kanban";
  // Top-level surface tab — Tasks / My events & coffee / Timesheet / Discover.
  // Discover is the unauthenticated default so /tasks doubles as the
  // public marketing landing for the (now-redirected) /events and /map.
  // Timesheet is workforce-only (employee + employer, #1349).
  type TaskSurface = "tasks" | "my-events" | "timesheet" | "discover";
  const [searchParams, setSearchParams] = useSearchParams();
  const surfaceParam = searchParams.get("surface");
  const surfaceFromUrl: TaskSurface | null =
    surfaceParam === "my-events" ? "my-events" :
    surfaceParam === "timesheet" ? "timesheet" :
    surfaceParam === "discover" ? "discover" :
    surfaceParam === "tasks" ? "tasks" :
    null;
  const defaultSurface: TaskSurface = isAuthenticated ? "tasks" : "discover";
  const currentSurface: TaskSurface = surfaceFromUrl ?? defaultSurface;
  // Self-gate the Timesheet surface tab so the surface list is a single
  // SSoT — no prop-drilled `canSeeTimesheet`; consumers inside Tasks.tsx
  // read the same `availableSurfaces` array (DRY rule, #1349).
  const role = (user?.role ?? "").toLowerCase();
  const isWorkforceMember = role === USER_ROLES.EMPLOYEE
    || role === USER_ROLES.EMPLOYER
    || role === USER_ROLES.ADMIN
    || role === USER_ROLES.SUPER_ADMIN;
  const availableSurfaces: TaskSurface[] = isWorkforceMember
    ? ["tasks", "my-events", "timesheet", "discover"]
    : ["tasks", "my-events", "discover"];
  const viewParam = currentSurface === "tasks" ? (searchParams.get("tab") ?? searchParams.get("view")) : null;
  const currentView: TaskView =
    viewParam === "calendar" ? "calendar" :
    viewParam === "table" || viewParam === "list" ? "table" :
    "kanban";
  const switchSurface = (next: TaskSurface) => {
    const sp = new URLSearchParams(searchParams);
    if (next === defaultSurface) sp.delete("surface");
    else sp.set("surface", next);
    sp.delete("tab");
    sp.delete("view");
    setSearchParams(sp, { replace: false });
  };

  // Top strip — rendered above every surface, both authed and unauthed,
  // so the public Discover landing still exposes the route into the
  // app. Defined here (not inside conditional branches) because both
  // the unauth marketing block AND the authed branches consume it.
  const SurfaceTabsStrip = (
    <div className="border-b">
      <div className="px-4 md:px-6 flex gap-1 -mb-px">
        {availableSurfaces.map((key) => {
          const active = currentSurface === key;
          const label =
            key === "tasks" ? "Tasks" :
            key === "my-events" ? "My events & coffee" :
            key === "timesheet" ? "Timesheet" :
            "Discover";
          return (
            <button
              key={key}
              type="button"
              onClick={() => switchSurface(key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTaskType, setSelectedTaskType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  // Sheet opens in view mode by default; "Add task" / row-Edit start in edit.
  const [sheetStartInEdit, setSheetStartInEdit] = useState(false);

  // API state management
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<any[]>([]);

  const openTaskPanel = (task: Task | null) => {
    setSheetStartInEdit(false);
    setSelectedTask(task);
    setTaskPanelOpen(true);
  };

  const handleDeleteTask = async (task: Task) => {
    try {
      if (isGuid(task.id)) {
        await taskService.deleteTask(task.id);
      }
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setTaskPanelOpen(false);
    } catch (e) {
      console.error("Delete failed", e);
      setError(e instanceof Error ? e.message : t("errors.failedDeleteTask"));
    }
  };

  // Persist a created/edited task from the detail sheet. New (non-guid id)
  // rows are prepended; existing rows merged — then flushed to the API.
  const handleSaveTask = async (draft: Task) => {
    setTasks((prev) => {
      const exists = prev.some((tk) => tk.id === draft.id);
      return exists
        ? prev.map((tk) => (tk.id === draft.id ? { ...draft, updatedAt: new Date().toISOString() } : tk))
        : [{ ...draft, updatedAt: new Date().toISOString() }, ...prev];
    });
    await saveTaskToApi({ ...draft });
    setSelectedTask(draft);
  };

  // Kanban drag-drop status change — also stamps a start date the first time a
  // task moves to In Progress. Reverts + surfaces an error on save failure.
  const handleKanbanStatusChange = async (taskId: string, status: ProductivityItemStatus) => {
    const now = new Date().toISOString().split("T")[0];
    let originalTask: Task | null = null;
    let updatedTask: Task | null = null;
    setTasks((prev) => {
      originalTask = prev.find((tk) => tk.id === taskId) || null;
      const updated = prev.map((tk) =>
        tk.id === taskId
          ? {
              ...tk,
              status,
              startDate:
                status === ProductivityItemStatus.InProgress && !tk.startDate ? now : tk.startDate,
              updatedAt: new Date().toISOString(),
            }
          : tk,
      );
      updatedTask = updated.find((tk) => tk.id === taskId) || null;
      return updated;
    });
    if (updatedTask && originalTask) {
      try {
        await saveTaskToApi(updatedTask);
      } catch (err) {
        console.error("Failed to update task status:", err);
        setTasks((prev) => prev.map((tk) => (tk.id === taskId ? originalTask! : tk)));
        setError(t("errors.failedUpdateTaskStatus"));
      }
    }
  };


  // Load tasks from backend using the task service
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const loadTasks = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [tasksData, usersData] = await Promise.all([
          taskService.getTasks(),
          taskService.getAssignableUsers().catch(() => []), // Don't fail if users can't be loaded
        ]);

        // Convert backend DTOs to UI format
        const uiTasks: Task[] = tasksData.map((dto: TaskDTO): Task => {
          const start = dto.start ? new Date(dto.start) : null;
          const end = dto.end ? new Date(dto.end) : null;
          const ymd = (d: Date | null) =>
            d
              ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
              : undefined;

          return {
            id: dto.id || "",
            title: dto.text || "",
            description: dto.description,
            type: mapBackendTaskTypeToUI(dto.taskType),
            priority: "medium", // Default priority since backend doesn't have this
            status: mapBackendStatusToUI(dto.status),
            startDate: ymd(start),
            dueDate: ymd(end || start) || ymd(new Date()),
            createdAt: dto.creationDateTime || new Date().toISOString(),
            updatedAt: dto.updateDateTime,
            assignedTo: dto.assignedToUser,
            createdBy: dto.createdByUser,
            url: dto.url,
          };
        });

        setTasks(uiTasks);
        setAssignableUsers(usersData);
      } catch (err) {
        console.error("Failed to load tasks:", err);
        setError(err instanceof Error ? err.message : t("errors.failedLoadTasks"));
      } finally {
        setIsLoading(false);
      }
    };

    loadTasks();
  }, [isAuthenticated, user]);

  // Filter tasks based on selected filters
  const filteredTasks = tasks
    .filter((task) => {
      const typeMatch =
        selectedTaskType === "all" || task.type.toString() === selectedTaskType;
      const statusMatch =
        selectedStatus === "all" || task.status.toString() === selectedStatus;
      return typeMatch && statusMatch;
    })
    .sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );

  // Local date helpers to avoid UTC offset issues in calendar rendering
  const toLocalYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const fromYmdLocal = (s?: string) => {
    if (!s) return undefined;
    const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
    return new Date(y, (m || 1) - 1, d || 1);
  };

  // Get tasks for calendar view (week/month) using local day comparison
  const getTasksForDate = (date: Date) => {
    const cellKey = toLocalYmd(date);
    return filteredTasks.filter((task) => {
      const start = fromYmdLocal(task.startDate) || fromYmdLocal(task.dueDate);
      const due = fromYmdLocal(task.dueDate);
      const startKey = toLocalYmd(start);
      const dueKey = toLocalYmd(due);
      return cellKey >= startKey && cellKey <= dueKey;
    });
  };

  // Calendar navigation
  const navigateCalendar = (direction: "prev" | "next") => {
    const newDate = new Date(currentDate);
    if (calendarView === "week") {
      newDate.setDate(newDate.getDate() + (direction === "next" ? 7 : -7));
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === "next" ? 1 : -1));
    }
    setCurrentDate(newDate);
  };

  // Get week days for week view
  const getWeekDays = () => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      days.push(day);
    }
    return days;
  };

  // Get month grid (6 weeks x 7 days) for month view
  const getMonthGrid = () => {
    const firstOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    const start = new Date(firstOfMonth);
    // move to Sunday on or before the 1st
    start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

    const grid: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      grid.push(day);
    }
    return grid;
  };

  // Discover surface is fully public — render it before the auth gate
  // so logged-out visitors land on the events grid + map + FAQ that
  // /events and /map used to host. Placed AFTER all hooks (state,
  // effects) above so React's hook-order invariant holds.
  if (currentSurface === "discover") {
    return (
      <AppShell bgClassName="bg-background">
        {SurfaceTabsStrip}
        <div className="p-4 md:p-6">
          <div className="space-y-12">
            <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading map…</div>}>
              <EventDiscoveryPanel />
            </Suspense>
            <MarketingFAQ items={EVENTS_FAQ} schemaId="events" />
          </div>
        </div>
      </AppShell>
    );
  }

  // If user is not authenticated, show marketing page (with the surface
  // tab strip so visitors can flip into the public Discover surface).
  if (!isAuthenticated || !user) {
    return (
      <AppShell bgClassName="bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        {SurfaceTabsStrip}
        <div>
          <div className="px-4 py-16">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <CheckSquare className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    {t("labels.taskManagement")}
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  {t("messages.stayOrganizedAhead")}
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  {t("messages.taskManagementValueProp")}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      {t("actions.getStartedFree")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button size="lg" variant="outline" className="text-lg px-8">
                      {t("actions.signIn")}
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
                {[
                  { stat: t("labels.threshold10Plus"), label: t("labels.taskStatTaskTypesDesc") },
                  { stat: t("labels.taskStatThreeViews"), label: t("labels.taskStatThreeViewsDesc") },
                  { stat: t("labels.taskStatPriorities"), label: t("labels.taskStatPrioritiesDesc") },
                  { stat: t("labels.taskStatRoles"), label: t("labels.taskStatRolesDesc") },
                ].map((s) => (
                  <div key={s.stat} className="text-center">
                    <div className="text-3xl font-bold text-primary mb-2">{s.stat}</div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Features */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  {t("headings.everyCareerMoveOrganized")}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                    <CardHeader>
                      <Calendar className="h-10 w-10 text-brand-purple mb-4" />
                      <CardTitle>{t("headings.taskCalendarTimeline")}</CardTitle>
                      <CardDescription>
                        {t("messages.taskCalendarTimelineDesc")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.taskFeatureMonthWeek")}</div>
                        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.taskFeatureDragDrop")}</div>
                        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.taskFeatureDeadlineReminders")}</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                    <CardHeader>
                      <Target className="h-10 w-10 text-brand-blue mb-4" />
                      <CardTitle>{t("headings.taskRoleSpecific")}</CardTitle>
                      <CardDescription>
                        {t("messages.taskRoleSpecificDesc")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.taskFeatureJobAppsInterviews")}</div>
                        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.taskFeatureRecruiterSourcing")}</div>
                        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.taskFeatureOnboardingTeam")}</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                    <CardHeader>
                      <TrendingUp className="h-10 w-10 text-primary mb-4" />
                      <CardTitle>{t("headings.taskProgressTracking")}</CardTitle>
                      <CardDescription>
                        {t("messages.taskProgressTrackingDesc")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.taskFeatureTodoFlow")}</div>
                        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.taskFeaturePriorityLevels")}</div>
                        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{t("labels.taskFeatureFilterByStatus")}</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Task type showcase */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">{t("headings.builtForEveryStage")}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 rounded-xl border border-border">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <Briefcase className="h-5 w-5 text-brand-purple" />
                      {t("labels.jobSeekers")}
                    </h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />{t("labels.taskFeatureTrackByCompany")}</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />{t("labels.taskFeatureScheduleInterviewPrep")}</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />{t("labels.taskFeatureFollowUpReminders")}</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />{t("labels.taskFeatureNetworkingOutreach")}</li>
                    </ul>
                  </div>
                  <div className="p-6 rounded-xl border border-border">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <Users className="h-5 w-5 text-brand-blue" />
                      {t("labels.outreachRecruitersEmployersTitle")}
                    </h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />{t("labels.taskFeatureCandidateSourcing")}</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />{t("labels.taskFeatureInterviewSchedulingCoord")}</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />{t("labels.taskFeatureOfferOnboarding")}</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />{t("labels.taskFeaturePipelineMgmt")}</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* CTA */}
              <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 rounded-2xl p-12">
                <h2 className="text-3xl font-bold mb-4">{t("messages.stopLosingOpportunities")}</h2>
                <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                  {t("messages.taskManagementBenefits")}
                </p>
                <Link to="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-10">
                    {t("actions.getStartedFree")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>

            </div>
</div>
</AppShell>
  );
  }

  const isGuid = (value: string) =>
    /^(\{)?[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}(\})?$/.test(
      value,
    );

  // Old mapping functions removed - now using enum directly

  const fromBackendDto = (dto: any): Task => {
    const start = dto.start ? new Date(dto.start) : null;
    const end = dto.end ? new Date(dto.end) : null;
    const ymd = (d: Date | null) =>
      d
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        : undefined;
    return {
      id: dto.id,
      title: dto.text,
      description: dto.description || undefined,
      type: mapBackendTaskTypeToUI(dto.taskType),
      priority: "medium",
      status: mapBackendStatusToUI(dto.status),
      startDate: ymd(start || end),
      dueDate: ymd(end || start) || ymd(new Date()),
      createdAt: dto.creationDateTime
        ? new Date(dto.creationDateTime).toISOString()
        : new Date().toISOString(),
      updatedAt: dto.updateDateTime
        ? new Date(dto.updateDateTime).toISOString()
        : undefined,
      url: dto.url,
    };
  };

  const toBackendDto = (task: Task) => {
    const start = task.startDate || task.dueDate;
    const end = task.dueDate;
    return {
      id: isGuid(task.id) ? task.id : null,
      text: task.title,
      description: task.description,
      start: start ? new Date(start).toISOString() : new Date().toISOString(),
      end: end ? new Date(end).toISOString() : null,
      taskType: mapUITaskTypeToBackend(task.type),
      status: mapUIStatusToBackend(task.status),
    } as const;
  };

  const saveTaskToApi = async (task: Task) => {
    try {
      const request: CreateTaskRequest | UpdateTaskRequest = {
        text: task.title,
        description: task.description,
        start: task.startDate
          ? new Date(task.startDate).toISOString()
          : new Date().toISOString(),
        end: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
        taskType: mapUITaskTypeToBackend(task.type),
        status: mapUIStatusToBackend(task.status),
        assignedToUserId: task.assignedTo?.id,
      };

      if (isGuid(task.id)) {
        // Update existing task
        const updateRequest: UpdateTaskRequest = {
          ...request,
          id: task.id,
        };
        const updatedTask = await taskService.updateTask(updateRequest);

        // Update the task in state with the response from API
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? {
              ...t,
              // Map the API response back to UI format
              title: updatedTask.text || t.title,
              description: updatedTask.description || t.description,
              startDate: updatedTask.start ? new Date(updatedTask.start).toISOString().split('T')[0] : t.startDate,
              dueDate: updatedTask.end ? new Date(updatedTask.end).toISOString().split('T')[0] : t.dueDate,
              type: mapBackendTaskTypeToUI(updatedTask.taskType),
              status: mapBackendStatusToUI(updatedTask.status),
              updatedAt: updatedTask.updateDateTime || new Date().toISOString(),
              createdAt: updatedTask.creationDateTime || t.createdAt,
            } : t,
          ),
        );
      } else {
        // Create new task
        const createdTask = await taskService.createTask(request);

        // Update the task in state with the new ID and response data
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? {
              ...t,
              id: createdTask.id || task.id,
              // Map the API response back to UI format
              title: createdTask.text || t.title,
              description: createdTask.description || t.description,
              startDate: createdTask.start ? new Date(createdTask.start).toISOString().split('T')[0] : t.startDate,
              dueDate: createdTask.end ? new Date(createdTask.end).toISOString().split('T')[0] : t.dueDate,
              type: mapBackendTaskTypeToUI(createdTask.taskType),
              status: mapBackendStatusToUI(createdTask.status),
              updatedAt: createdTask.updateDateTime || new Date().toISOString(),
              createdAt: createdTask.creationDateTime || t.createdAt,
            } : t,
          ),
        );
      }
    } catch (e) {
      console.error("Failed to save task", e);
      setError(e instanceof Error ? e.message : t("errors.failedSaveTask"));
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: ProductivityItemStatus) => {
    let originalTask: Task | null = null;
    let updatedTask: Task | null = null;

    // Store original task and update optimistically
    setTasks((prev) => {
      originalTask = prev.find((t) => t.id === taskId) || null;
      const updated = prev.map((task) =>
        task.id === taskId
          ? { ...task, status: newStatus, updatedAt: new Date().toISOString() }
          : task,
      );
      updatedTask = updated.find((t) => t.id === taskId) || null;
      return updated;
    });

    // Save to API and handle potential errors
    if (updatedTask && originalTask) {
      try {
        await saveTaskToApi(updatedTask);
      } catch (error) {
        // Revert to original state on error
        console.error("Failed to update task status:", error);
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? originalTask! : t))
        );
        setError(t("errors.failedUpdateTaskStatus"));
      }
    }
  };

  // Local-only remove (table-row trash); kanban drag-status lives in <TaskBoard>.
  const deleteTask = (taskId: string) => {
    setTasks(tasks.filter((task) => task.id !== taskId));
  };


  const taskTabs: PageHeaderTab[] = [
    { key: "table",    label: t("fields.bulkListPick.label"), icon: TableIcon,    to: "/tasks?tab=table" },
    { key: "calendar", label: t("labels.calendarView"),       icon: CalendarDays, to: "/tasks?tab=calendar" },
    { key: "kanban",   label: t("labels.kanbanView"),         icon: List,         to: "/tasks" },
  ];

  // My events + coffee surface — short-circuits before the heavy
  // tasks-tab JSX. (The Discover surface is handled earlier, above the
  // auth gate, since events are public.)
  if (currentSurface === "my-events") {
    return (
      <AppShell bgClassName="bg-background">
        {SurfaceTabsStrip}
        <div className="p-4 md:p-6">
          <div className="space-y-6">
            <MyEventsAndCoffee viewerUserId={user.id} />
          </div>
        </div>
      </AppShell>
    );
  }

  // Timesheet surface — workforce-only (employee + employer). The
  // <TimesheetTab/> component self-gates; for non-workforce viewers it
  // returns null and we fall through to the tasks surface below.
  if (currentSurface === "timesheet" && isWorkforceMember) {
    return (
      <AppShell bgClassName="bg-background">
        {SurfaceTabsStrip}
        <div className="p-4 md:p-6">
          <div className="space-y-6">
            <TimesheetTab />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      {SurfaceTabsStrip}
      <div className="p-4 md:p-6">
          <div className="space-y-6">
            <PageHeader
              search={<HeaderSearch />}
              actions={
                <>
                  <Select
                    value={selectedTaskType}
                    onValueChange={setSelectedTaskType}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder={t("fields.filterByType.placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("labels.allTypes")}</SelectItem>
                      {getAvailableTaskTypesForRole(user?.role || "").map((taskType) => (
                        <SelectItem key={taskType} value={taskType.toString()}>
                          {getTaskTypeDisplayName(taskType)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedStatus}
                    onValueChange={setSelectedStatus}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder={t("fields.filterByStatus.placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("fields.allStatus")}</SelectItem>
                      <SelectItem value={ProductivityItemStatus.Planning.toString()}>
                        {getStatusDisplayName(ProductivityItemStatus.Planning)}
                      </SelectItem>
                      <SelectItem value={ProductivityItemStatus.ToDo.toString()}>
                        {getStatusDisplayName(ProductivityItemStatus.ToDo)}
                      </SelectItem>
                      <SelectItem value={ProductivityItemStatus.Open.toString()}>
                        {getStatusDisplayName(ProductivityItemStatus.Open)}
                      </SelectItem>
                      <SelectItem value={ProductivityItemStatus.InProgress.toString()}>
                        {getStatusDisplayName(ProductivityItemStatus.InProgress)}
                      </SelectItem>
                      <SelectItem value={ProductivityItemStatus.Completed.toString()}>
                        {getStatusDisplayName(ProductivityItemStatus.Completed)}
                      </SelectItem>
                      <SelectItem value={ProductivityItemStatus.OnHold.toString()}>
                        {getStatusDisplayName(ProductivityItemStatus.OnHold)}
                      </SelectItem>
                      <SelectItem value={ProductivityItemStatus.Cancelled.toString()}>
                        {getStatusDisplayName(ProductivityItemStatus.Cancelled)}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* View-axis segmented control (List / Calendar / Kanban).
                      Lives next to "Add task" instead of the PageHeader tab
                      strip; each segment is a router Link so the view stays
                      URL-driven (`?tab=`). */}
                  <div className="flex items-center rounded-md border">
                    {taskTabs.map((tab, i) => {
                      const active = currentView === tab.key;
                      const Icon = tab.icon;
                      return (
                        <Button
                          key={tab.key}
                          asChild
                          variant={active ? "default" : "ghost"}
                          size="sm"
                          className={cn(
                            i === 0 && "rounded-r-none",
                            i === taskTabs.length - 1 && "rounded-l-none",
                            i > 0 && i < taskTabs.length - 1 && "rounded-none",
                          )}
                          aria-pressed={active}
                        >
                          <Link to={tab.to ?? "/tasks"} aria-label={tab.label} title={tab.label}>
                            {Icon && <Icon className="h-4 w-4" />}
                          </Link>
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    className="gap-2"
                    onClick={() => {
                      const today = new Date();
                      const y = today.getFullYear();
                      const m = String(today.getMonth() + 1).padStart(2, "0");
                      const d = String(today.getDate()).padStart(2, "0");
                      const newTask: Task = {
                        id: `temp-${Date.now()}`,
                        title: "",
                        description: "",
                        type: TaskType.General,
                        priority: "medium",
                        status: ProductivityItemStatus.Planning,
                        startDate: `${y}-${m}-${d}`,
                        dueDate: `${y}-${m}-${d}`,
                        createdAt: today.toISOString(),
                      };
                      setSelectedTask(newTask);
                      setSheetStartInEdit(true);
                      setTaskPanelOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    {t("actions.addTask")}
                  </Button>
                </>
              }
            />

            {/* Loading State */}
            {isLoading && (
              <div data-testid="loader" className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span>{t("status.loadingTasks")}</span>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                  <span className="text-red-700">{error}</span>
                </div>
              </div>
            )}

            {/* Quick Stats */}
            {!isLoading && !error && (
              <div className="grid grid-cols-2 md:grid-cols-8 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {t("labels.totalTasks")}
                    </CardTitle>
                    <CheckSquare className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{tasks.length}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {getStatusDisplayName(ProductivityItemStatus.Planning)}
                    </CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {tasks.filter((t) => t.status === ProductivityItemStatus.Planning).length}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {getStatusDisplayName(ProductivityItemStatus.ToDo)}
                    </CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {tasks.filter((t) => t.status === ProductivityItemStatus.ToDo).length}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {getStatusDisplayName(ProductivityItemStatus.InProgress)}
                    </CardTitle>
                    <Zap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {tasks.filter((t) => t.status === ProductivityItemStatus.InProgress).length}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {getStatusDisplayName(ProductivityItemStatus.Completed)}
                    </CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {tasks.filter((t) => t.status === ProductivityItemStatus.Completed).length}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Table View */}
            {currentView === "table" && (
              <Card data-testid="list-view">
                <CardHeader>
                  <CardTitle>{t("headings.tasksList")}</CardTitle>
                  <CardDescription>
                    {t("messages.tasksSortedByDueDate")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("labels.taskTitleColumn")}</TableHead>
                        <TableHead>{t("labels.transactionType")}</TableHead>
                        <TableHead>{t("labels.priorityColumn")}</TableHead>
                        <TableHead>{t("fields.startDateField.label")}</TableHead>
                        <TableHead>{t("fields.dueDateField.label")}</TableHead>
                        <TableHead>{t("labels.callStatus")}</TableHead>
                        <TableHead>{t("labels.actionsColumn")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.map((task) => (
                        <TableRow
                          key={task.id}
                          className="cursor-pointer"
                          onClick={() => openTaskPanel(task)}
                        >
                          <TableCell>
                            <div>
                              <div className="font-medium">{task.title}</div>
                              {task.description && (
                                <div className="text-sm text-muted-foreground mt-1">
                                  {task.description.length > 50
                                    ? `${task.description.substring(0, 50)}...`
                                    : task.description}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={taskTypeColors[task.type]}>
                              {getTaskTypeDisplayName(task.type)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={priorityColors[task.priority]}>
                              {task.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {task.startDate
                              ? new Date(task.startDate).toLocaleDateString()
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {new Date(task.dueDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={task.status.toString()}
                              onValueChange={(value) => {
                                updateTaskStatus(
                                  task.id,
                                  parseInt(value) as ProductivityItemStatus,
                                ).catch((error) => {
                                  console.error("Failed to update task status:", error);
                                });
                              }}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={ProductivityItemStatus.Planning.toString()}>
                                  {getStatusDisplayName(ProductivityItemStatus.Planning)}
                                </SelectItem>
                                <SelectItem value={ProductivityItemStatus.ToDo.toString()}>
                                  {getStatusDisplayName(ProductivityItemStatus.ToDo)}
                                </SelectItem>
                                <SelectItem value={ProductivityItemStatus.Open.toString()}>
                                  {getStatusDisplayName(ProductivityItemStatus.Open)}
                                </SelectItem>
                                <SelectItem value={ProductivityItemStatus.InProgress.toString()}>
                                  {getStatusDisplayName(ProductivityItemStatus.InProgress)}
                                </SelectItem>
                                <SelectItem value={ProductivityItemStatus.Completed.toString()}>
                                  {getStatusDisplayName(ProductivityItemStatus.Completed)}
                                </SelectItem>
                                <SelectItem value={ProductivityItemStatus.OnHold.toString()}>
                                  {getStatusDisplayName(ProductivityItemStatus.OnHold)}
                                </SelectItem>
                                <SelectItem value={ProductivityItemStatus.Cancelled.toString()}>
                                  {getStatusDisplayName(ProductivityItemStatus.Cancelled)}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTask(task);
                                  setSheetStartInEdit(true);
                                  setTaskPanelOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTask(task.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Calendar View */}
            {currentView === "calendar" && (
              <Card data-testid="calendar-view">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{t("headings.calendarView")}</CardTitle>
                    <div className="flex items-center gap-3">
                      <Select
                        value={calendarView}
                        onValueChange={(value) =>
                          setCalendarView(value as "week" | "month")
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="week">{t("labels.weekShort")}</SelectItem>
                          <SelectItem value="month">{t("labels.monthShort")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => navigateCalendar("prev")}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => navigateCalendar("next")}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <CardDescription>
                    {calendarView === "week"
                      ? t("labels.weekOf", { date: currentDate.toLocaleDateString() })
                      : currentDate.toLocaleDateString(undefined, {
                          month: "long",
                          year: "numeric",
                        })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {calendarView === "week" ? (
                    <div className="grid grid-cols-7 gap-2">
                      {[
                        { key: "sun", label: t("labels.weekday.sun") },
                        { key: "mon", label: t("labels.weekday.mon") },
                        { key: "tue", label: t("labels.weekday.tue") },
                        { key: "wed", label: t("labels.weekday.wed") },
                        { key: "thu", label: t("labels.weekday.thu") },
                        { key: "fri", label: t("labels.weekday.fri") },
                        { key: "sat", label: t("labels.weekday.sat") },
                      ].map(
                        (day) => (
                          <div
                            key={day.key}
                            className="text-center font-medium text-muted-foreground py-2 border-b"
                          >
                            {day.label}
                          </div>
                        ),
                      )}
                      {getWeekDays().map((day, index) => {
                        const dayTasks = getTasksForDate(day);
                        const isToday =
                          day.toDateString() === new Date().toDateString();

                        return (
                          <div
                            key={index}
                            className={`min-h-32 p-2 border rounded-lg ${isToday ? "bg-primary/5 border-primary/20" : "border-border"}`}
                          >
                            <div
                              className={`text-sm font-medium mb-2 ${isToday ? "text-primary" : "text-foreground"}`}
                            >
                              {day.getDate()}
                            </div>
                            <div className="space-y-1">
                              {dayTasks.map((task) => (
                                <div
                                  key={task.id}
                                  onClick={() => openTaskPanel(task)}
                                  className={`text-xs p-1 rounded text-gray-900 cursor-pointer ${
                                    taskTypeColors[task.type] || "bg-gray-600"
                                  }`}
                                  title={task.description}
                                >
                                  {task.title.length > 15
                                    ? `${task.title.substring(0, 15)}...`
                                    : task.title}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-7 gap-2">
                      {[
                        { key: "sun", label: t("labels.weekday.sun") },
                        { key: "mon", label: t("labels.weekday.mon") },
                        { key: "tue", label: t("labels.weekday.tue") },
                        { key: "wed", label: t("labels.weekday.wed") },
                        { key: "thu", label: t("labels.weekday.thu") },
                        { key: "fri", label: t("labels.weekday.fri") },
                        { key: "sat", label: t("labels.weekday.sat") },
                      ].map(
                        (day) => (
                          <div
                            key={day.key}
                            className="text-center font-medium text-muted-foreground py-2 border-b"
                          >
                            {day.label}
                          </div>
                        ),
                      )}
                      {getMonthGrid().map((day, index) => {
                        const isCurrentMonth =
                          day.getMonth() === currentDate.getMonth();
                        const dayTasks = getTasksForDate(day);
                        const isToday =
                          day.toDateString() === new Date().toDateString();
                        return (
                          <div
                            key={index}
                            className={`min-h-28 p-2 border rounded-lg ${
                              isToday
                                ? "bg-primary/5 border-primary/20"
                                : "border-border"
                            } ${isCurrentMonth ? "" : "opacity-50"}`}
                          >
                            <div
                              className={`text-sm font-medium mb-2 ${isToday ? "text-primary" : "text-foreground"}`}
                            >
                              {day.getDate()}
                            </div>
                            <div className="space-y-1">
                              {dayTasks.map((task) => (
                                <div
                                  key={task.id}
                                  onClick={() => openTaskPanel(task)}
                                  className={`text-xs p-1 rounded text-gray-900 cursor-pointer ${
                                    taskTypeColors[task.type] || "bg-gray-600"
                                  }`}
                                  title={task.description}
                                >
                                  {task.title.length > 12
                                    ? `${task.title.substring(0, 12)}...`
                                    : task.title}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Kanban View */}
          </div>
        </div>
</AppShell>
  );
}

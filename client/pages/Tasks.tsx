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
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth, USER_ROLES } from "@/lib/auth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
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

const taskTypeColors = {
  [TaskType.General]: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  [TaskType.Project]: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  [TaskType.Email]: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  [TaskType.Phone]: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  [TaskType.Meeting]: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  [TaskType.Interview]: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  [TaskType.Recruiting]: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  [TaskType.Sales]: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  [TaskType.Onboarding]: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  [TaskType.OnboardingProfile]: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  [TaskType.OnboardingProfileSettings]: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  [TaskType.OnboardingPrivacy]: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  [TaskType.Recruiter]: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  [TaskType.RecruiterPreferences]: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  [TaskType.JobSeeker]: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  [TaskType.JobSeekerPreferences]: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  [TaskType.Company]: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  [TaskType.CompanySettings]: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  [TaskType.Profile]: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
  [TaskType.Job]: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  [TaskType.Resume]: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
};

const priorityColors = {
  low: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  medium:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function Tasks() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  const [currentView, setCurrentView] = useState<
    "calendar" | "table" | "kanban"
  >("table");
  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTaskType, setSelectedTaskType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // API state management
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<any[]>([]);

  const openTaskPanel = (task: Task | null) => {
    setIsEditing(false);
    setSelectedTask(task);
    setEditTask(task ? { ...task } : null);
    setTaskPanelOpen(true);
  };
  const closeTaskPanel = () => setTaskPanelOpen(false);

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ProductivityItemStatus | null>(null);

  const handleDelete = async () => {
    if (!selectedTask) return;
    try {
      if (isGuid(selectedTask.id)) {
        await taskService.deleteTask(selectedTask.id);
      }
      setTasks((prev) => prev.filter((t) => t.id !== selectedTask.id));
      setTaskPanelOpen(false);
    } catch (e) {
      console.error("Delete failed", e);
      setError(e instanceof Error ? e.message : "Failed to delete task");
    }
  };

  const renderTaskSheet = () => (
    <Sheet open={taskPanelOpen} onOpenChange={setTaskPanelOpen}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {isEditing
              ? editTask?.title || "Edit Task"
              : selectedTask?.title || "Task Details"}
          </SheetTitle>
          {!isEditing && selectedTask?.description && (
            <SheetDescription>{selectedTask.description}</SheetDescription>
          )}
        </SheetHeader>
        {selectedTask && !isEditing && (
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Type</span>
              <Badge className={taskTypeColors[selectedTask.type]}>
                {getTaskTypeDisplayName(selectedTask.type)}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Priority</span>
              <Badge className={priorityColors[selectedTask.priority]}>
                {selectedTask.priority}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge>{getStatusDisplayName(selectedTask.status)}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Start</span>
              <span>
                {selectedTask.startDate
                  ? selectedTask.startDate &&
                    !isNaN(new Date(selectedTask.startDate).getTime())
                    ? new Date(selectedTask.startDate).toLocaleDateString()
                    : "Invalid date"
                  : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Due</span>
              <span>
                {selectedTask.dueDate &&
                !isNaN(new Date(selectedTask.dueDate).getTime())
                  ? new Date(selectedTask.dueDate).toLocaleDateString()
                  : "Invalid date"}
              </span>
            </div>
            {selectedTask.assignedTo && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Assigned To</span>
                <span>
                  {selectedTask.assignedTo.firstName}{" "}
                  {selectedTask.assignedTo.lastName}
                </span>
              </div>
            )}
            {selectedTask.createdBy && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created By</span>
                <span>
                  {selectedTask.createdBy.firstName}{" "}
                  {selectedTask.createdBy.lastName}
                </span>
              </div>
            )}
          </div>
        )}

        {isEditing && editTask && (
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTask.title}
                onChange={(e) =>
                  setEditTask({ ...editTask, title: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editTask.description || ""}
                onChange={(e) =>
                  setEditTask({ ...editTask, description: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="edit-type">Type</Label>
              <Select
                value={editTask.type.toString()}
                onValueChange={(v) =>
                  setEditTask({ ...editTask, type: parseInt(v) as TaskType })
                }
              >
                <SelectTrigger id="edit-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableTaskTypesForRole(user?.role || "").map((taskType) => (
                    <SelectItem key={taskType} value={taskType.toString()}>
                      {getTaskTypeDisplayName(taskType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-priority">Priority</Label>
              <Select
                value={editTask.priority}
                onValueChange={(v) =>
                  setEditTask({ ...editTask, priority: v as Task["priority"] })
                }
              >
                <SelectTrigger id="edit-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editTask.status.toString()}
                onValueChange={(v) =>
                  setEditTask({ ...editTask, status: parseInt(v) as ProductivityItemStatus })
                }
              >
                <SelectTrigger id="edit-status">
                  <SelectValue placeholder="Select status" />
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-start">Start Date</Label>
                <Input
                  id="edit-start"
                  type="date"
                  value={editTask.startDate || ""}
                  onChange={(e) =>
                    setEditTask({ ...editTask, startDate: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-due">Due Date</Label>
                <Input
                  id="edit-due"
                  type="date"
                  value={editTask.dueDate}
                  onChange={(e) =>
                    setEditTask({ ...editTask, dueDate: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Task Assignment - only show for employer/recruiter roles */}
            {(user?.role === USER_ROLES.EMPLOYER ||
              user?.role === USER_ROLES.RECRUITER) &&
              assignableUsers.length > 0 && (
                <div>
                  <Label htmlFor="edit-assigned">Assign To</Label>
                  <Select
                    value={editTask.assignedTo?.id || "unassigned"}
                    onValueChange={(userId) => {
                      if (userId === "unassigned") {
                        setEditTask({
                          ...editTask,
                          assignedTo: undefined,
                        });
                        return;
                      }
                      const assignedUser = assignableUsers.find(
                        (u) => u.userProfile?.id === userId,
                      );
                      setEditTask({
                        ...editTask,
                        assignedTo: assignedUser?.userProfile || undefined,
                      });
                    }}
                  >
                    <SelectTrigger id="edit-assigned">
                      <SelectValue placeholder="Select assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {assignableUsers
                        .filter((association) => association.userProfile?.id)
                        .map((association) => (
                          <SelectItem
                            key={association.id}
                            value={association.userProfile?.id || ""}
                          >
                            {association.userProfile?.firstName}{" "}
                            {association.userProfile?.lastName}
                            {association.userProfile?.role &&
                              ` (${association.userProfile.role})`}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
          </div>
        )}

        <SheetFooter className="mt-6">
          <div className="flex w-full justify-between gap-2">
            {!isEditing ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setIsEditing(true);
                  setEditTask(selectedTask ? { ...selectedTask } : null);
                }}
              >
                Edit
              </Button>
            ) : (
              <div className="flex gap-2 ml-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    setTaskPanelOpen(false);
                    setIsEditing(false);
                    setEditTask(selectedTask ? { ...selectedTask } : null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!editTask) return;
                    // Local update
                    setTasks((prev) => {
                      const exists = prev.some((t) => t.id === editTask.id);
                      const updated = exists
                        ? prev.map((t) =>
                            t.id === editTask.id
                              ? {
                                  ...editTask,
                                  updatedAt: new Date().toISOString(),
                                }
                              : t,
                          )
                        : [
                            {
                              ...editTask,
                              updatedAt: new Date().toISOString(),
                            },
                            ...prev,
                          ];
                      return updated;
                    });
                    // Remote save
                    await saveTaskToApi({ ...editTask });
                    setSelectedTask(editTask);
                    setIsEditing(false);
                    setTaskPanelOpen(false);
                  }}
                >
                  Save
                </Button>
              </div>
            )}
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );

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
          };
        });

        setTasks(uiTasks);
        setAssignableUsers(usersData);
      } catch (err) {
        console.error("Failed to load tasks:", err);
        setError(err instanceof Error ? err.message : "Failed to load tasks");
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

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={closeSidebar}
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />

          <div className="pt-16">
            <div className="max-w-6xl mx-auto px-4 py-16">
              {/* Marketing content for non-authenticated users */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <CheckSquare className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    Task Management
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Stay Organized, Stay Ahead
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Manage your career journey with intelligent task management.
                  Track applications, schedule interviews, and never miss an
                  opportunity.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      Get Started
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-lg px-8"
                    >
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
            <Footer />
          </div>
        </div>
      </div>
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
      setError(e instanceof Error ? e.message : "Failed to save task");
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
        setError("Failed to update task status. Changes have been reverted.");
      }
    }
  };

  // Drag and drop helpers for Kanban view
  const onDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedTaskId(taskId);
    
    // Add visual feedback to the dragged element
    const draggedElement = e.currentTarget;
    draggedElement.style.opacity = "0.5";
    draggedElement.style.transform = "rotate(5deg) scale(1.05)";
    draggedElement.style.boxShadow = "0 10px 25px rgba(0,0,0,0.3)";
  };

  const onDropOnColumn = async (
    e: React.DragEvent<HTMLDivElement>,
    column: ProductivityItemStatus,
  ) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;

    const now = new Date().toISOString().split("T")[0];
    let originalTask: Task | null = null;
    let updatedTask: Task | null = null;

    // Store original task for potential rollback
    setTasks((prev) => {
      originalTask = prev.find((t) => t.id === id) || null;
      const updated = prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: column,
              startDate:
                column === ProductivityItemStatus.InProgress && !t.startDate ? now : t.startDate,
              updatedAt: new Date().toISOString(),
            }
          : t,
      );
      updatedTask = updated.find((t) => t.id === id) || null;
      return updated;
    });

    // Clear drag state immediately after drop
    setDraggedTaskId(null);
    setDragOverColumn(null);

    // Save to API and handle potential errors
    if (updatedTask && originalTask) {
      try {
        await saveTaskToApi(updatedTask);
      } catch (error) {
        // Revert to original state on error
        console.error("Failed to update task status:", error);
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? originalTask! : t))
        );
        setError("Failed to update task status. Changes have been reverted.");
      }
    }
  };

  const onDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    // Reset visual feedback
    const draggedElement = e.currentTarget;
    draggedElement.style.opacity = "";
    draggedElement.style.transform = "";
    draggedElement.style.boxShadow = "";
    
    // Clear drag state
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>, column?: ProductivityItemStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    
    if (column) {
      setDragOverColumn(column);
    }
  };

  const deleteTask = (taskId: string) => {
    setTasks(tasks.filter((task) => task.id !== taskId));
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only clear if we're leaving the column entirely, not just moving to a child element
    const relatedTarget = e.relatedTarget as Node;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverColumn(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  Task Management
                </h1>
                <p className="text-muted-foreground mt-1">
                  Organize and track your career activities
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="capitalize">
                  {user.role?.replace("_", " ")}
                </Badge>
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
                    setEditTask({ ...newTask });
                    setIsEditing(true);
                    setTaskPanelOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add Task
                </Button>
              </div>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span>Loading tasks...</span>
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Total Tasks
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
                      Planning
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
                      To Do
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
                      In Progress
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
                      Completed
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

            {/* View Toggle and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <Tabs
                value={currentView}
                onValueChange={(value) =>
                  setCurrentView(value as "calendar" | "table" | "kanban")
                }
              >
                <TabsList>
                  <TabsTrigger value="table" className="gap-2">
                    <TableIcon className="h-4 w-4" />
                    Table View
                  </TabsTrigger>
                  <TabsTrigger value="calendar" className="gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Calendar View
                  </TabsTrigger>
                  <TabsTrigger value="kanban" className="gap-2">
                    <List className="h-4 w-4" />
                    Kanban View
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-3">
                <Select
                  value={selectedTaskType}
                  onValueChange={setSelectedTaskType}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
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
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
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
              </div>
            </div>

            {/* Table View */}
            {currentView === "table" && (
              <Card>
                <CardHeader>
                  <CardTitle>Tasks List</CardTitle>
                  <CardDescription>
                    All your tasks sorted by due date
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
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
                                  setIsEditing(true);
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
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Calendar View</CardTitle>
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
                          <SelectItem value="week">Week</SelectItem>
                          <SelectItem value="month">Month</SelectItem>
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
                      ? `Week of ${currentDate.toLocaleDateString()}`
                      : currentDate.toLocaleDateString("en-US", {
                          month: "long",
                          year: "numeric",
                        })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {calendarView === "week" ? (
                    <div className="grid grid-cols-7 gap-2">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                        (day) => (
                          <div
                            key={day}
                            className="text-center font-medium text-muted-foreground py-2 border-b"
                          >
                            {day}
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
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                        (day) => (
                          <div
                            key={day}
                            className="text-center font-medium text-muted-foreground py-2 border-b"
                          >
                            {day}
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
            {currentView === "kanban" && (
              <Card>
                <CardHeader>
                  <CardTitle>Kanban View</CardTitle>
                  <CardDescription>
                    Drag tasks between columns to update status
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Planning Column */}
                    <div
                      className={`rounded-lg border p-3 transition-all duration-200 ${
                        dragOverColumn === ProductivityItemStatus.Planning
                          ? "bg-blue-50 border-blue-300 border-2 scale-105"
                          : "bg-muted/30"
                      }`}
                      onDragOver={(e) => onDragOver(e, ProductivityItemStatus.Planning)}
                      onDragLeave={onDragLeave}
                      onDrop={(e) => onDropOnColumn(e, ProductivityItemStatus.Planning)}
                    >
                      <div className={`font-semibold mb-2 flex items-center gap-2 ${
                        dragOverColumn === ProductivityItemStatus.Planning ? "text-blue-600" : ""
                      }`}>
                        Planning
                        {dragOverColumn === ProductivityItemStatus.Planning && (
                          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">
                            Drop here
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 min-h-24">
                        {tasks
                          .filter((t) => t.status === ProductivityItemStatus.Planning)
                          .map((t) => (
                            <div
                              key={t.id}
                              className={`rounded-md border bg-card p-3 cursor-grab active:cursor-grabbing transition-all duration-200 ${
                                draggedTaskId === t.id
                                  ? "opacity-50 transform rotate-2 scale-105 shadow-2xl"
                                  : "hover:shadow-md hover:scale-102"
                              }`}
                              draggable
                              onDragStart={(e) => onDragStart(e, t.id)}
                              onDragEnd={onDragEnd}
                              onClick={() => openTaskPanel(t)}
                            >
                              <div className="text-sm font-medium">
                                {t.title}
                              </div>
                              {t.description && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {t.description.length > 60
                                    ? `${t.description.substring(0, 60)}...`
                                    : t.description}
                                </div>
                              )}
                              <div className="mt-2 flex items-center gap-2">
                                <Badge className={taskTypeColors[t.type]}>
                                  {getTaskTypeDisplayName(t.type)}
                                </Badge>
                                <Badge className={priorityColors[t.priority]}>
                                  {t.priority}
                                </Badge>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* To Do Column */}
                    <div
                      className={`rounded-lg border p-3 transition-all duration-200 ${
                        dragOverColumn === ProductivityItemStatus.ToDo
                          ? "bg-yellow-50 border-yellow-300 border-2 scale-105"
                          : "bg-muted/30"
                      }`}
                      onDragOver={(e) => onDragOver(e, ProductivityItemStatus.ToDo)}
                      onDragLeave={onDragLeave}
                      onDrop={(e) => onDropOnColumn(e, ProductivityItemStatus.ToDo)}
                    >
                      <div className={`font-semibold mb-2 flex items-center gap-2 ${
                        dragOverColumn === ProductivityItemStatus.ToDo ? "text-yellow-600" : ""
                      }`}>
                        To Do
                        {dragOverColumn === ProductivityItemStatus.ToDo && (
                          <span className="text-xs bg-yellow-100 text-yellow-600 px-2 py-1 rounded-full">
                            Drop here
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 min-h-24">
                        {tasks
                          .filter((t) => t.status === ProductivityItemStatus.ToDo)
                          .map((t) => (
                            <div
                              key={t.id}
                              className={`rounded-md border bg-card p-3 cursor-grab active:cursor-grabbing transition-all duration-200 ${
                                draggedTaskId === t.id
                                  ? "opacity-50 transform rotate-2 scale-105 shadow-2xl"
                                  : "hover:shadow-md hover:scale-102"
                              }`}
                              draggable
                              onDragStart={(e) => onDragStart(e, t.id)}
                              onDragEnd={onDragEnd}
                              onClick={() => openTaskPanel(t)}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="text-sm font-medium">
                                {t.title}
                              </div>
                              {t.description && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {t.description.length > 60
                                    ? `${t.description.substring(0, 60)}...`
                                    : t.description}
                                </div>
                              )}
                              <div className="mt-2 flex items-center gap-2">
                                <Badge className={taskTypeColors[t.type]}>
                                  {getTaskTypeDisplayName(t.type)}
                                </Badge>
                                <Badge className={priorityColors[t.priority]}>
                                  {t.priority}
                                </Badge>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* In Progress Column */}
                    <div
                      className={`rounded-lg border p-3 transition-all duration-200 ${
                        dragOverColumn === ProductivityItemStatus.InProgress
                          ? "bg-orange-50 border-orange-300 border-2 scale-105"
                          : "bg-muted/30"
                      }`}
                      onDragOver={(e) => onDragOver(e, ProductivityItemStatus.InProgress)}
                      onDragLeave={onDragLeave}
                      onDrop={(e) => onDropOnColumn(e, ProductivityItemStatus.InProgress)}
                    >
                      <div className={`font-semibold mb-2 flex items-center gap-2 ${
                        dragOverColumn === ProductivityItemStatus.InProgress ? "text-orange-600" : ""
                      }`}>
                        In Progress
                        {dragOverColumn === ProductivityItemStatus.InProgress && (
                          <span className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded-full">
                            Drop here
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 min-h-24">
                        {tasks
                          .filter((t) => t.status === ProductivityItemStatus.InProgress)
                          .map((t) => (
                            <div
                              key={t.id}
                              className={`rounded-md border bg-card p-3 cursor-grab active:cursor-grabbing transition-all duration-200 ${
                                draggedTaskId === t.id
                                  ? "opacity-50 transform rotate-2 scale-105 shadow-2xl"
                                  : "hover:shadow-md hover:scale-102"
                              }`}
                              draggable
                              onDragStart={(e) => onDragStart(e, t.id)}
                              onDragEnd={onDragEnd}
                              onClick={() => openTaskPanel(t)}
                            >
                              <div className="text-sm font-medium">
                                {t.title}
                              </div>
                              {t.description && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {t.description.length > 60
                                    ? `${t.description.substring(0, 60)}...`
                                    : t.description}
                                </div>
                              )}
                              <div className="mt-2 flex items-center gap-2">
                                <Badge className={taskTypeColors[t.type]}>
                                  {getTaskTypeDisplayName(t.type)}
                                </Badge>
                                <Badge className={priorityColors[t.priority]}>
                                  {t.priority}
                                </Badge>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Completed Column */}
                    <div
                      className={`rounded-lg border p-3 transition-all duration-200 ${
                        dragOverColumn === ProductivityItemStatus.Completed
                          ? "bg-green-50 border-green-300 border-2 scale-105"
                          : "bg-muted/30"
                      }`}
                      onDragOver={(e) => onDragOver(e, ProductivityItemStatus.Completed)}
                      onDragLeave={onDragLeave}
                      onDrop={(e) => onDropOnColumn(e, ProductivityItemStatus.Completed)}
                    >
                      <div className={`font-semibold mb-2 flex items-center gap-2 ${
                        dragOverColumn === ProductivityItemStatus.Completed ? "text-green-600" : ""
                      }`}>
                        Completed
                        {dragOverColumn === ProductivityItemStatus.Completed && (
                          <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">
                            Drop here
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 min-h-24">
                        {tasks
                          .filter((t) => t.status === ProductivityItemStatus.Completed)
                          .map((t) => (
                            <div
                              key={t.id}
                              className={`rounded-md border bg-card p-3 cursor-grab active:cursor-grabbing transition-all duration-200 ${
                                draggedTaskId === t.id
                                  ? "opacity-50 transform rotate-2 scale-105 shadow-2xl"
                                  : "hover:shadow-md hover:scale-102"
                              }`}
                              draggable
                              onDragStart={(e) => onDragStart(e, t.id)}
                              onDragEnd={onDragEnd}
                              onClick={() => openTaskPanel(t)}
                            >
                              <div className="text-sm font-medium">
                                {t.title}
                              </div>
                              {t.description && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {t.description.length > 60
                                    ? `${t.description.substring(0, 60)}...`
                                    : t.description}
                                </div>
                              )}
                              <div className="mt-2 flex items-center gap-2">
                                <Badge className={taskTypeColors[t.type]}>
                                  {getTaskTypeDisplayName(t.type)}
                                </Badge>
                                <Badge className={priorityColors[t.priority]}>
                                  {t.priority}
                                </Badge>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {renderTaskSheet()}
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}

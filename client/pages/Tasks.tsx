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
import { useAuth } from "@/lib/auth";
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
} from "@/types/task";

// Use the TaskUIState interface from types/task.ts
interface Task extends TaskUIState {}

const taskTypeColors = {
  onboarding: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  interview:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  recruiting:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  sales:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
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

  const [isEditing, setIsEditing] = useState(false);

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
                {selectedTask.type}
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
              <Badge>{selectedTask.status.replace("_", " ")}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Start</span>
              <span>
                {selectedTask.startDate
                  ? new Date(selectedTask.startDate).toLocaleDateString()
                  : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Due</span>
              <span>{new Date(selectedTask.dueDate).toLocaleDateString()}</span>
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
                value={editTask.type}
                onValueChange={(v) =>
                  setEditTask({ ...editTask, type: v as Task["type"] })
                }
              >
                <SelectTrigger id="edit-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="interview">Interview</SelectItem>
                  <SelectItem value="recruiting">Recruiting</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
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

            {/* Task Assignment - only show for business/recruiter roles */}
            {(user?.role === "business" || user?.role === "recruiter") &&
              assignableUsers.length > 0 && (
                <div>
                  <Label htmlFor="edit-assigned">Assign To</Label>
                  <Select
                    value={editTask.assignedTo?.id || ""}
                    onValueChange={(userId) => {
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
                      <SelectItem value="">Unassigned</SelectItem>
                      {assignableUsers.map((association) => (
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
        selectedTaskType === "all" || task.type === selectedTaskType;
      const statusMatch =
        selectedStatus === "all" || task.status === selectedStatus;
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
      const start = fromYmdLocal(task.startDate) || fromYmdLocal(task.dueDate)!;
      const due = fromYmdLocal(task.dueDate)!;
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

  const mapTaskTypeToBackend = (type: Task["type"]): string => {
    switch (type) {
      case "onboarding":
        return "Onboarding";
      case "interview":
        return "Interview";
      case "recruiting":
        return "Recruiter";
      default:
        return "General";
    }
  };

  const mapStatusToBackend = (status: Task["status"]): string => {
    switch (status) {
      case "todo":
        return "ToDo";
      case "in_progress":
        return "InProgress";
      case "completed":
        return "Completed";
    }
  };
  const backendStatusToUi = (status: string): Task["status"] => {
    switch (status) {
      case "ToDo":
      case "Open":
      case "Planning":
        return "todo";
      case "InProgress":
        return "in_progress";
      case "Completed":
      case "Closed":
        return "completed";
      default:
        return "todo";
    }
  };

  const backendTypeToUi = (taskType: string): Task["type"] => {
    switch (taskType) {
      case "Onboarding":
      case "OnboardingProfile":
      case "OnboardingProfileSettings":
      case "OnboardingPrivacy":
        return "onboarding";
      case "Interview":
        return "interview";
      case "Recruiter":
      case "Company":
        return "recruiting";
      default:
        return "sales";
    }
  };

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
      type: backendTypeToUi(String(dto.taskType)),
      priority: "medium",
      status: backendStatusToUi(String(dto.status)),
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
      taskType: mapTaskTypeToBackend(task.type),
      status: mapStatusToBackend(task.status),
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
        await taskService.updateTask(updateRequest);
      } else {
        // Create new task
        const createdTask = await taskService.createTask(request);

        // Update the task in state with the new ID
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? { ...task, id: createdTask.id || task.id } : t,
          ),
        );
      }
    } catch (e) {
      console.error("Failed to save task", e);
      setError(e instanceof Error ? e.message : "Failed to save task");
    }
  };

  const updateTaskStatus = (taskId: string, newStatus: Task["status"]) => {
    setTasks((prev) => {
      const updated = prev.map((task) =>
        task.id === taskId
          ? { ...task, status: newStatus, updatedAt: new Date().toISOString() }
          : task,
      );
      const task = updated.find((t) => t.id === taskId);
      if (task) {
        saveTaskToApi(task);
      }
      return updated;
    });
  };

  // Drag and drop helpers for Kanban view
  const onDragStart = (e: React.DragEvent<HTMLDivElement>, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDropOnColumn = (
    e: React.DragEvent<HTMLDivElement>,
    column: Task["status"],
  ) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const now = new Date().toISOString().split("T")[0];
    let updatedTask: Task | null = null;
    setTasks((prev) => {
      const updated = prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: column,
              startDate:
                column === "in_progress" && !t.startDate ? now : t.startDate,
              updatedAt: new Date().toISOString(),
            }
          : t,
      );
      updatedTask = updated.find((t) => t.id === id) || null;
      return updated;
    });
    if (updatedTask) {
      saveTaskToApi(updatedTask);
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const deleteTask = (taskId: string) => {
    setTasks(tasks.filter((task) => task.id !== taskId));
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
                      type: "onboarding",
                      priority: "medium",
                      status: "todo",
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
                      To Do
                    </CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {tasks.filter((t) => t.status === "todo").length}
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
                      {tasks.filter((t) => t.status === "in_progress").length}
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
                      {tasks.filter((t) => t.status === "completed").length}
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
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                    <SelectItem value="interview">Interview</SelectItem>
                    <SelectItem value="recruiting">Recruiting</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
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
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
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
                              {task.type}
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
                              value={task.status}
                              onValueChange={(value) =>
                                updateTaskStatus(
                                  task.id,

                                  value as Task["status"],
                                )
                              }
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todo">To Do</SelectItem>
                                <SelectItem value="in_progress">
                                  In Progress
                                </SelectItem>
                                <SelectItem value="completed">
                                  Completed
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
                                  className={`text-xs p-1 rounded text-white cursor-pointer ${
                                    task.type === "onboarding"
                                      ? "bg-blue-600"
                                      : task.type === "interview"
                                        ? "bg-green-600"
                                        : task.type === "recruiting"
                                          ? "bg-purple-600"
                                          : "bg-orange-600"
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
                                  className={`text-xs p-1 rounded text-white cursor-pointer ${
                                    task.type === "onboarding"
                                      ? "bg-blue-600"
                                      : task.type === "interview"
                                        ? "bg-green-600"
                                        : task.type === "recruiting"
                                          ? "bg-purple-600"
                                          : "bg-orange-600"
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* To Do Column */}
                    <div
                      className="rounded-lg border p-3 bg-muted/30"
                      onDragOver={onDragOver}
                      onDrop={(e) => onDropOnColumn(e, "todo")}
                    >
                      <div className="font-semibold mb-2">To Do</div>
                      <div className="space-y-2 min-h-24">
                        {tasks
                          .filter((t) => t.status === "todo")
                          .map((t) => (
                            <div
                              key={t.id}
                              className="rounded-md border bg-card p-3 cursor-grab active:cursor-grabbing"
                              draggable
                              onDragStart={(e) => onDragStart(e, t.id)}
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
                                  {t.type}
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
                      className="rounded-lg border p-3 bg-muted/30"
                      onDragOver={onDragOver}
                      onDrop={(e) => onDropOnColumn(e, "in_progress")}
                    >
                      <div className="font-semibold mb-2">In Progress</div>
                      <div className="space-y-2 min-h-24">
                        {tasks
                          .filter((t) => t.status === "in_progress")
                          .map((t) => (
                            <div
                              key={t.id}
                              className="rounded-md border bg-card p-3 cursor-grab active:cursor-grabbing"
                              draggable
                              onDragStart={(e) => onDragStart(e, t.id)}
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
                                  {t.type}
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
                      className="rounded-lg border p-3 bg-muted/30"
                      onDragOver={onDragOver}
                      onDrop={(e) => onDropOnColumn(e, "completed")}
                    >
                      <div className="font-semibold mb-2">Completed</div>
                      <div className="space-y-2 min-h-24">
                        {tasks
                          .filter((t) => t.status === "completed")
                          .map((t) => (
                            <div
                              key={t.id}
                              className="rounded-md border bg-card p-3 cursor-grab active:cursor-grabbing"
                              draggable
                              onDragStart={(e) => onDragStart(e, t.id)}
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
                                  {t.type}
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

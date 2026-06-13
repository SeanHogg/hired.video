// Content Creator → Gigs tab. The creator's awarded gig work, rendered on the
// SAME reusable <TaskBoard> as the personal Tasks page (drag a card to advance
// it; completing it submits the linked escrow milestone for the poster to
// approve). Self-fetches + self-gates — empty state points at the marketplace.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import TaskBoard from "@/components/tasks/TaskBoard";
import { gigService, type GigProjectStatus } from "@/lib/services/gig-service";
import {
  ProductivityItemStatus,
  mapBackendStatusToUI,
  mapBackendTaskTypeToUI,
  type TaskDTO,
  type TaskUIState,
} from "@/types/task";

const ymd = (iso?: string) => (iso ? iso.split("T")[0] : undefined);

function toUIState(dto: TaskDTO): TaskUIState {
  return {
    id: dto.id ?? "",
    title: dto.text,
    description: dto.description,
    type: mapBackendTaskTypeToUI(dto.taskType),
    priority: "medium",
    status: mapBackendStatusToUI(dto.status),
    startDate: ymd(dto.start),
    dueDate: ymd(dto.end) ?? ymd(dto.start) ?? new Date().toISOString().split("T")[0],
    createdAt: dto.creationDateTime ?? new Date().toISOString(),
  };
}

const STATUS_BADGE: Record<GigProjectStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function GigsPanel() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TaskUIState[]>([]);
  const [projects, setProjects] = useState<{ id: string; title: string; status: GigProjectStatus }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    gigService
      .listMyWork()
      .then((res) => {
        if (cancelled) return;
        setTasks(res.tasks.map(toUIState));
        setProjects(res.projects);
      })
      .catch(() => {
        if (!cancelled) {
          setTasks([]);
          setProjects([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStatusChange = async (taskId: string, status: ProductivityItemStatus) => {
    const previous = tasks;
    setTasks((cur) => cur.map((t) => (t.id === taskId ? { ...t, status } : t)));
    try {
      await gigService.updateWorkStatus(taskId, status);
    } catch (e) {
      setTasks(previous);
      toast({
        title: "Couldn't update",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading your gig work…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Gig work
          </h2>
          <p className="text-sm text-muted-foreground">
            Deliverables from gigs you&apos;ve won. Drag a card to In Progress / Completed — finishing a card
            submits its milestone for the client to approve and release payment.
          </p>
        </div>
        <Link to="/gigs">
          <Button variant="outline" size="sm">
            Browse marketplace <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </div>

      {projects.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <Link key={p.id} to={`/gigs/${p.id}`}>
              <Badge variant="secondary" className={STATUS_BADGE[p.status]}>
                {p.title}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Briefcase className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold">No gig work yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Win a gig in the marketplace and its deliverables land here as a task board you can work through.
            </p>
            <Link to="/gigs" className="inline-block mt-4">
              <Button size="sm">Browse open gigs</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <TaskBoard tasks={tasks} onStatusChange={handleStatusChange} />
      )}
    </div>
  );
}

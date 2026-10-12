// Content Creator → Gigs tab. The creator's awarded gig work, rendered on the
// SAME reusable <TaskBoard> as the personal Tasks page (drag a card to advance
// it; completing it submits the linked escrow milestone for the poster to
// approve). Self-fetches + self-gates — empty state points at the marketplace.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Briefcase, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import TaskBoard from "@/components/tasks/TaskBoard";
import { gigService, type GigProjectStatus } from "@/lib/services/gig-service";
import { ProductivityItemStatus, taskDtoToUIState, type TaskUIState } from "@/types/task";

const STATUS_BADGE: Record<GigProjectStatus, string> = {
  draft: "bg-muted text-foreground",
  open: "bg-accent text-primary",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function GigsPanel() {
  const { t } = useTranslation();
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
        setTasks(res.tasks.map(taskDtoToUIState));
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
        title: t("gigs.panel.couldntUpdate"),
        description: e instanceof Error ? e.message : t("gigs.common.tryAgain"),
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t("gigs.panel.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            {t("gigs.panel.heading")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("gigs.panel.intro")}</p>
        </div>
        <Link to="/services/gigs">
          <Button variant="outline" size="sm">
            {t("gigs.panel.browseMarketplace")} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </div>

      {projects.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <Link key={p.id} to={`/services/gigs/${p.id}`}>
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
            <h3 className="font-semibold">{t("gigs.panel.emptyTitle")}</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{t("gigs.panel.emptyBody")}</p>
            <Link to="/services/gigs" className="inline-block mt-4">
              <Button size="sm">{t("gigs.panel.browseOpen")}</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <TaskBoard tasks={tasks} onStatusChange={handleStatusChange} />
      )}
    </div>
  );
}

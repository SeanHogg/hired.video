// Reusable task view/edit sheet — extracted from Tasks.tsx so the personal
// Tasks page and the Content Creator → Gigs board share one detail panel.
// Self-contained: owns its view/edit toggle + draft state. The consumer
// controls visibility and supplies save/delete handlers.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  ProductivityItemStatus,
  TaskType,
  getStatusDisplayName,
  getTaskTypeDisplayName,
  type TaskUIState,
} from "@/types/task";
import { taskTypeColors, priorityColors } from "./task-styles";

const isGuid = (value: string) =>
  /^(\{)?[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}(\})?$/.test(value);

const EDITABLE_STATUSES: ProductivityItemStatus[] = [
  ProductivityItemStatus.Planning,
  ProductivityItemStatus.ToDo,
  ProductivityItemStatus.Open,
  ProductivityItemStatus.InProgress,
  ProductivityItemStatus.Completed,
  ProductivityItemStatus.OnHold,
  ProductivityItemStatus.Cancelled,
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskUIState | null;
  /** Open straight into the edit form (Add-task / row Edit). */
  startInEdit?: boolean;
  onSave: (task: TaskUIState) => void | Promise<void>;
  onDelete: (task: TaskUIState) => void | Promise<void>;
  /** Task types selectable in edit mode. */
  availableTaskTypes?: TaskType[];
  /** Assignment dropdown (employer/recruiter task delegation). Omit to hide. */
  assignableUsers?: any[];
  /** Hide the type selector for surfaces where it's fixed (e.g. gig work). */
  allowTypeEdit?: boolean;
}

export default function TaskDetailSheet({
  open,
  onOpenChange,
  task,
  startInEdit = false,
  onSave,
  onDelete,
  availableTaskTypes = [],
  assignableUsers = [],
  allowTypeEdit = true,
}: Props) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(startInEdit);
  const [draft, setDraft] = useState<TaskUIState | null>(task);

  // Re-sync when a new task is selected or the sheet (re)opens.
  useEffect(() => {
    setDraft(task);
    setIsEditing(startInEdit);
  }, [task, startInEdit, open]);

  if (!task) return null;
  const isCreate = !isGuid(task.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {isEditing
              ? isCreate
                ? t("actions.createNewTask")
                : draft?.title || t("actions.editTaskAction")
              : t("headings.taskDetails")}
          </SheetTitle>
          {!isEditing && task.description && <SheetDescription>{task.description}</SheetDescription>}
        </SheetHeader>

        {!isEditing && (
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <Label htmlFor="view-title">{t("labels.taskTitleColumn")}</Label>
              <Input id="view-title" value={task.title} readOnly disabled />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("labels.transactionType")}</span>
              <Badge className={taskTypeColors[task.type]}>{getTaskTypeDisplayName(task.type)}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("labels.priorityColumn")}</span>
              <Badge className={priorityColors[task.priority]}>{task.priority}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("labels.callStatus")}</span>
              <Badge>{getStatusDisplayName(task.status)}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("labels.due")}</span>
              <span>
                {task.dueDate && !isNaN(new Date(task.dueDate).getTime())
                  ? new Date(task.dueDate).toLocaleDateString()
                  : "-"}
              </span>
            </div>
            {task.url && (
              <div className="pt-2">
                <Link to={task.url} onClick={() => onOpenChange(false)}>
                  <Button className="w-full" size="sm">
                    <ArrowRight className="h-4 w-4 mr-2" />
                    {t("actions.goToTask", { title: task.title })}
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {isEditing && draft && (
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <Label htmlFor="edit-title">{t("labels.taskTitleColumn")}</Label>
              <Input id="edit-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="edit-description">{t("fields.taskDescription.label")}</Label>
              <Textarea
                id="edit-description"
                value={draft.description || ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            {allowTypeEdit && availableTaskTypes.length > 0 && (
              <div>
                <Label htmlFor="edit-type">{t("labels.transactionType")}</Label>
                <Select
                  value={draft.type.toString()}
                  onValueChange={(v) => setDraft({ ...draft, type: parseInt(v) as TaskType })}
                >
                  <SelectTrigger id="edit-type">
                    <SelectValue placeholder={t("fields.taskType.placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTaskTypes.map((taskType) => (
                      <SelectItem key={taskType} value={taskType.toString()}>
                        {getTaskTypeDisplayName(taskType)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="edit-priority">{t("labels.priorityColumn")}</Label>
              <Select
                value={draft.priority}
                onValueChange={(v) => setDraft({ ...draft, priority: v as TaskUIState["priority"] })}
              >
                <SelectTrigger id="edit-priority">
                  <SelectValue placeholder={t("fields.taskPriority.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("labels.priorityLevel.low")}</SelectItem>
                  <SelectItem value="medium">{t("labels.priorityLevel.medium")}</SelectItem>
                  <SelectItem value="high">{t("labels.priorityLevel.high")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-status">{t("labels.callStatus")}</Label>
              <Select
                value={draft.status.toString()}
                onValueChange={(v) => setDraft({ ...draft, status: parseInt(v) as ProductivityItemStatus })}
              >
                <SelectTrigger id="edit-status">
                  <SelectValue placeholder={t("fields.statusSelect.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {EDITABLE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s.toString()}>
                      {getStatusDisplayName(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-start">{t("fields.startDateField.label")}</Label>
                <Input
                  id="edit-start"
                  type="date"
                  value={draft.startDate || ""}
                  onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-due">{t("fields.dueDateField.label")}</Label>
                <Input
                  id="edit-due"
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                />
              </div>
            </div>
            {assignableUsers.length > 0 && (
              <div>
                <Label htmlFor="edit-assigned">{t("fields.assignToField.label")}</Label>
                <Select
                  value={draft.assignedTo?.id || "unassigned"}
                  onValueChange={(userId) => {
                    if (userId === "unassigned") {
                      setDraft({ ...draft, assignedTo: undefined });
                      return;
                    }
                    const assigned = assignableUsers.find((u) => u.userProfile?.id === userId);
                    setDraft({ ...draft, assignedTo: assigned?.userProfile || undefined });
                  }}
                >
                  <SelectTrigger id="edit-assigned">
                    <SelectValue placeholder={t("fields.assignee.placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">{t("labels.unassigned")}</SelectItem>
                    {assignableUsers
                      .filter((a) => a.userProfile?.id)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.userProfile?.id || ""}>
                          {a.userProfile?.firstName} {a.userProfile?.lastName}
                          {a.userProfile?.role && ` (${a.userProfile.role})`}
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
              <Button variant="secondary" onClick={() => { setDraft(task); setIsEditing(true); }}>
                {t("actions.edit")}
              </Button>
            ) : (
              <div className="flex gap-2 ml-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (isCreate) onOpenChange(false);
                    else { setDraft(task); setIsEditing(false); }
                  }}
                >
                  {t("actions.cancel")}
                </Button>
                <Button
                  onClick={async () => {
                    if (!draft) return;
                    await onSave(draft);
                    setIsEditing(false);
                    onOpenChange(false);
                  }}
                >
                  {t("actions.save")}
                </Button>
              </div>
            )}
            <Button variant="destructive" onClick={() => onDelete(task)}>
              {t("actions.deleteAdmin")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

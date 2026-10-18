import { Star, Eye, Globe, Lock, Power, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TABLE_SURFACE, TABLE_HEAD } from "@/lib/ui/table-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { ResumeWithOwnership } from "@/types/resume";

/**
 * Dense Table view of the owner's resumes — the third browse layout
 * alongside Scroll and Grid. One row per resume with status badges,
 * privacy, view count, created date and View / Edit / Delete actions.
 * Pagination is owned by the parent (shared `<Pagination>` below), so
 * this renders exactly the rows it's handed.
 */
export default function ResumeOwnedTable({
  resumes,
  onView,
  onEdit,
  onDelete,
}: {
  resumes: ResumeWithOwnership[];
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (resume: ResumeWithOwnership) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={TABLE_SURFACE}>
      <table className="w-full text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-3 py-2 font-medium">{t("labels.name", "Name")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.status", "Status")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.privacy", "Privacy")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.views", "Views")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.created", "Created")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.actions", "Actions")}</th>
          </tr>
        </thead>
        <tbody>
          {resumes.map((resume) => {
            const isPublic = resume.privacy === "public";
            return (
              <tr
                key={resume.id}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onView(resume.id)}
                    className="font-medium hover:text-brand-primary"
                  >
                    {resume.title}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {resume.isMaster && (
                      <Badge variant="secondary" className="gap-1">
                        <Star className="h-3 w-3" />
                        {t("labels.resumes.master", "Master")}
                      </Badge>
                    )}
                    {resume.isActive && (
                      <Badge variant="outline" className="gap-1">
                        <Power className="h-3 w-3" />
                        {t("labels.resumes.active", "Active")}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {isPublic ? (
                      <Globe className="h-3.5 w-3.5" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" />
                    )}
                    {isPublic
                      ? t("labels.public", "Public")
                      : t("labels.private", "Private")}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {resume.viewCount ?? 0}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDate(resume.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onView(resume.id)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {t("actions.view", "View")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(resume.id)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      {t("actions.edit", "Edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(resume)}
                      aria-label={t("actions.resumes.deleteNamed", { name: resume.title })}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

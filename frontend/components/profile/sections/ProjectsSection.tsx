import { ExternalLink, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMonthYear } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Project } from "@/types/resume";
import SectionEditButton from "./SectionEditButton";

interface ProjectsSectionProps {
  projects: Project[];
  isOwner: boolean;
  onEdit?: () => void;
}

export default function ProjectsSection({ projects, isOwner, onEdit }: ProjectsSectionProps) {
  const { t } = useTranslation();
  if (projects.length === 0 && !isOwner) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          {t("tabs.projects")}
        </CardTitle>
        {isOwner && onEdit && (
          <SectionEditButton onClick={onEdit} label={t("actions.editProjects")} />
        )}
      </CardHeader>
      <CardContent>
        {projects.length > 0 ? (
          <div className="space-y-4">
            {projects.map((project, index) => (
              <div key={project.id || index} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{project.name}</h3>
                    {project.entity && (
                      <p className="text-sm text-muted-foreground">{project.entity}</p>
                    )}
                  </div>
                  {project.url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={project.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </div>
                {(project.startDate || project.endDate) && (
                  <p className="text-sm text-muted-foreground mb-2">
                    {formatMonthYear(project.startDate, "")}
                    {project.startDate && project.endDate ? " - " : ""}
                    {formatMonthYear(project.endDate, "") || t("labels.present")}
                    {project.roles && project.roles.length > 0 &&
                      ` · ${project.roles.join(", ")}`}
                  </p>
                )}
                {project.description && (
                  <p className="text-sm mb-3">{project.description}</p>
                )}
                {project.keywords && project.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {project.keywords.map((tech, techIndex) => (
                      <Badge key={techIndex} variant="secondary" className="text-xs">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {t("messages.projectsEmpty")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

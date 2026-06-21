/**
 * TemplatesTab — CRUD list of email templates, search + grid/list view.
 * Edit / delete / create are owned by the parent (via callbacks) so the
 * dialog state stays out of this component.
 */
import { Edit, FileText, Plus, Trash2 } from "lucide-react";
import Pagination from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/outreach/shared/EmptyState";
import { OutreachTabToolbar } from "@/components/outreach/shared/OutreachTabToolbar";
import ViewModeToggle, { type ViewMode } from "@/components/ViewModeToggle";
import { ViewModeList, SCROLL_GRID_LIST_MODES } from "@/components/ViewModeList";
import {
  EmailTemplateCategory,
  EmailTemplateTargetRole,
  type EmailTemplateDTO,
} from "@/types/communication";

export interface TemplatesTabProps {
  emailTemplates: EmailTemplateDTO[];
  filteredTemplates: EmailTemplateDTO[];
  paginatedTemplates: EmailTemplateDTO[];
  search: string;
  onSearchChange: (value: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  pagination: {
    currentPage: number;
    itemsPerPage: number;
    setCurrentPage: (n: number) => void;
    handleItemsPerPageChange: (n: number) => void;
  };
  onCreate: () => void;
  onEdit: (template: EmailTemplateDTO) => void;
  onDelete: (id: string) => void;
}

export function TemplatesTab({
  emailTemplates,
  filteredTemplates,
  paginatedTemplates,
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  pagination,
  onCreate,
  onEdit,
  onDelete,
}: TemplatesTabProps) {
  return (
    <div className="space-y-6">
      <OutreachTabToolbar
        title="Email Templates"
        search={{
          placeholder: "Search templates...",
          value: search,
          onChange: (v) => {
            onSearchChange(v);
            pagination.setCurrentPage(1);
          },
        }}
      >
        <ViewModeToggle value={viewMode} onChange={onViewModeChange} modes={SCROLL_GRID_LIST_MODES} />
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </OutreachTabToolbar>

      <ViewModeList viewMode={viewMode}>
        {paginatedTemplates.map((template) => (
          <Card
            key={template.id}
            className={viewMode === "list" ? "flex flex-row items-center" : ""}
          >
            {viewMode === "list" ? (
              <>
                <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{template.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {template.description}
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                    <Badge variant="secondary">
                      {EmailTemplateCategory[template.category]}
                    </Badge>
                    <Badge variant="outline">
                      {EmailTemplateTargetRole[template.targetRole]}
                    </Badge>
                  </div>
                  <span className="text-sm text-muted-foreground flex-shrink-0">
                    Used {template.usageCount}x
                  </span>
                </div>
                <div className="flex gap-2 p-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(template)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  {!template.isSystemTemplate && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDelete(template.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <CardDescription>{template.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(template)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {!template.isSystemTemplate && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onDelete(template.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Badge variant="secondary">
                      {EmailTemplateCategory[template.category]}
                    </Badge>
                    <Badge variant="outline">
                      {EmailTemplateTargetRole[template.targetRole]}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      Used {template.usageCount} times
                    </p>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        ))}
      </ViewModeList>

      {filteredTemplates.length > 0 && (
        <Pagination
          currentPage={pagination.currentPage}
          totalItems={filteredTemplates.length}
          itemsPerPage={pagination.itemsPerPage}
          onPageChange={pagination.setCurrentPage}
          onItemsPerPageChange={pagination.handleItemsPerPageChange}
        />
      )}

      {emailTemplates.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No templates yet"
          description="Create your first email template to get started"
          action={
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Template
            </Button>
          }
        />
      )}
    </div>
  );
}

export default TemplatesTab;

/**
 * ContactsTab — CRUD list of external contacts (people you outreach to
 * outside the platform), same shape as TemplatesTab.
 */
import { Edit, ExternalLink, Plus, Trash2, Users } from "lucide-react";
import Pagination from "@/components/Pagination";
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
import type { ExternalContactDTO } from "@/types/communication";

export interface ContactsTabProps {
  externalContacts: ExternalContactDTO[];
  filteredContacts: ExternalContactDTO[];
  paginatedContacts: ExternalContactDTO[];
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
  onEdit: (contact: ExternalContactDTO) => void;
  onDelete: (id: string) => void;
}

export function ContactsTab({
  externalContacts,
  filteredContacts,
  paginatedContacts,
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  pagination,
  onCreate,
  onEdit,
  onDelete,
}: ContactsTabProps) {
  return (
    <div className="space-y-6">
      <OutreachTabToolbar
        title="External Contacts"
        search={{
          placeholder: "Search contacts...",
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
          Add Contact
        </Button>
      </OutreachTabToolbar>

      <ViewModeList viewMode={viewMode}>
        {paginatedContacts.map((contact) => (
          <Card
            key={contact.id}
            className={viewMode === "list" ? "flex flex-row items-center" : ""}
          >
            {viewMode === "list" ? (
              <>
                <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">
                      {contact.firstName} {contact.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {contact.jobTitle}
                      {contact.companyName ? ` at ${contact.companyName}` : ""}
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
                    <span>{contact.email}</span>
                    {contact.location && <span>{contact.location}</span>}
                  </div>
                </div>
                <div className="flex gap-2 p-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(contact)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDelete(contact.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {contact.firstName} {contact.lastName}
                      </CardTitle>
                      <CardDescription>{contact.jobTitle}</CardDescription>
                      <CardDescription>{contact.companyName}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit(contact)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDelete(contact.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground">{contact.email}</p>
                    {contact.phone && (
                      <p className="text-muted-foreground">{contact.phone}</p>
                    )}
                    {contact.location && (
                      <p className="text-muted-foreground">{contact.location}</p>
                    )}
                    {contact.linkedInUrl && (
                      <a
                        href={contact.linkedInUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        LinkedIn <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        ))}
      </ViewModeList>

      {filteredContacts.length > 0 && (
        <Pagination
          currentPage={pagination.currentPage}
          totalItems={filteredContacts.length}
          itemsPerPage={pagination.itemsPerPage}
          onPageChange={pagination.setCurrentPage}
          onItemsPerPageChange={pagination.handleItemsPerPageChange}
        />
      )}

      {externalContacts.length === 0 && (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Add external contacts to manage your outreach"
          action={
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          }
        />
      )}
    </div>
  );
}

export default ContactsTab;

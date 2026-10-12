/**
 * Section importers — optional per-section "pull from an existing store"
 * affordances for the document ArrayEditor. Keeps section-specific data
 * sources out of the generic editor: the editor just looks up
 * `SECTION_IMPORTERS[sectionKey]` and renders it beside "Add" when present.
 *
 * Today only the resume `references` section has one — it pulls the owner's
 * saved reference contacts (the SSoT at /references), LIVE-linked by contact
 * id (#2258), so a candidate edits a reference once and every résumé that
 * shows it follows.
 */
import { useEffect, useState, type ComponentType } from "react";
import { BookUser, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { referenceFromContact } from "@shared/resume-references";
import {
  referencesService,
  type ReferenceContact,
} from "@/lib/services/references-service";

export interface SectionImporterProps {
  /** The section's current items — used to skip already-imported entries. */
  existing: Record<string, unknown>[];
  /** Append the chosen items (shaped to the section's field schema). */
  onImport: (items: Record<string, unknown>[]) => void;
}

function ReferencesImporter({ existing, onImport }: SectionImporterProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<ReferenceContact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void referencesService
      .listContacts()
      .then((rows) => active && setContacts(rows))
      .catch(() => active && setContacts([]))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, []);

  const existingNames = new Set(
    existing.map((it) => String(it.name ?? "").trim().toLowerCase()).filter(Boolean),
  );
  const linkedIds = new Set(existing.map((it) => it.contactId).filter((id): id is string => typeof id === "string"));
  const available = contacts.filter(
    (c) => !linkedIds.has(c.id) && !existingNames.has(c.name.trim().toLowerCase()),
  );

  // Live-linked (#2258): the item keeps the contact's id, so editing the
  // contact at /references updates it on every résumé (the snapshot text
  // stays as the fallback if the contact is deleted).
  const add = (c: ReferenceContact) => {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ref_${c.id}`;
    onImport([{ ...referenceFromContact(c, id) }]);
    toast({ title: t("references.profile.pullDone", { count: 1 }) });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className="inline-flex items-center gap-1 rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-brand-primary hover:text-brand-primary"
        onClick={(e) => e.stopPropagation()}
      >
        <BookUser className="h-3.5 w-3.5" />
        {t("references.profile.pullFromSaved")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {loaded && contacts.length === 0 ? (
          <DropdownMenuItem asChild>
            <Link to="/references">{t("references.profile.pullEmpty")}</Link>
          </DropdownMenuItem>
        ) : available.length === 0 ? (
          <DropdownMenuItem disabled>{t("references.empty")}</DropdownMenuItem>
        ) : (
          available.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onClick={(e) => {
                e.stopPropagation();
                add(c);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-2 shrink-0" />
              <span className="truncate">
                {c.name}
                {c.title ? `, ${c.title}` : ""}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const SECTION_IMPORTERS: Record<string, ComponentType<SectionImporterProps>> = {
  references: ReferencesImporter,
};

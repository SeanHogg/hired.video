import { useTranslation } from "react-i18next";
import { Search, Filter, Sparkles, Gift, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import type { UserViewMode } from "./types";

/**
 * View toggle — flat user list vs. referred-users-grouped-by-referrer.
 * SuperAdmin-only; the grouped view is backed by the SA-gated
 * /users/referrals endpoint.
 */
export function UserViewToggle({ viewMode, onChange }: { viewMode: UserViewMode; onChange: (mode: UserViewMode) => void }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
      <Button
        type="button"
        variant={viewMode === "list" ? "default" : "ghost"}
        size="sm"
        className="h-8"
        aria-pressed={viewMode === "list"}
        onClick={() => onChange("list")}
      >
        <Users className="h-3.5 w-3.5 mr-1.5" />
        {t("labels.allUsers")}
      </Button>
      <Button
        type="button"
        variant={viewMode === "grouped" ? "default" : "ghost"}
        size="sm"
        className="h-8"
        aria-pressed={viewMode === "grouped"}
        onClick={() => onChange("grouped")}
      >
        <Gift className="h-3.5 w-3.5 mr-1.5" />
        {t("labels.groupByReferrer")}
      </Button>
    </div>
  );
}

interface UserFiltersProps {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  roleFilter: string;
  onRoleFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  editorialFilter: boolean;
  onToggleEditorial: () => void;
  referredFilter: boolean;
  onToggleReferred: () => void;
  isSuperAdmin: boolean;
}

/**
 * Filters — sticky on sm+ so they remain visible when the user scrolls the
 * table. top-16 sits flush under the fixed top Navigation. The bg + ring
 * pulls the row over the table beneath so rows don't bleed through under
 * the controls. Pinned height is filter-input (40px) + py-3 ×2 (24px) =
 * 64px → so the table header below uses top-32 (128px = 64 nav + 64 filters).
 */
export function UserFilters({
  searchInput,
  onSearchInputChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
  editorialFilter,
  onToggleEditorial,
  referredFilter,
  onToggleReferred,
  isSuperAdmin,
}: UserFiltersProps) {
  const { t } = useTranslation();
  return (
    <div className="sm:sticky sm:top-16 z-30 bg-background sm:py-3 sm:-my-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("messages.searchByNameOrEmail")}
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={onRoleFilterChange}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder={t("labels.role")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("labels.allRoles")}</SelectItem>
            <SelectItem value="super_admin">{t("labels.superAdmin")}</SelectItem>
            <SelectItem value="admin">{t("labels.admin")}</SelectItem>
            <SelectItem value="employer">{getRoleDisplayLabel("employer")}</SelectItem>
            <SelectItem value="recruiter">{getRoleDisplayLabel("recruiter")}</SelectItem>
            <SelectItem value="job_seeker">{getRoleDisplayLabel("job_seeker")}</SelectItem>
            {/* Affiliate is NOT a role — it's a service users opt into.
                Filtering for affiliates uses the separate `enableAffiliate`
                / affiliate-profile join, surfaced as its own filter. */}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("labels.callStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("labels.allStatuses")}</SelectItem>
            <SelectItem value="active">{t("status.activeStatus")}</SelectItem>
            <SelectItem value="suspended">{t("status.suspendedStatus")}</SelectItem>
            <SelectItem value="banned">{t("status.bannedStatus")}</SelectItem>
          </SelectContent>
        </Select>
        {/* Editorial filter chip — SuperAdmin-only. Toggles the
            is_system (house author) restriction on the list. */}
        {isSuperAdmin && (
          <Button
            type="button"
            variant={editorialFilter ? "default" : "outline"}
            size="sm"
            className="h-10 whitespace-nowrap"
            aria-pressed={editorialFilter}
            onClick={onToggleEditorial}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            {t("labels.editorial")}
          </Button>
        )}
        {/* Referred filter chip — SuperAdmin-only. Restricts the list to
            users who signed up via an affiliate referral link. */}
        {isSuperAdmin && (
          <Button
            type="button"
            variant={referredFilter ? "default" : "outline"}
            size="sm"
            className="h-10 whitespace-nowrap"
            aria-pressed={referredFilter}
            onClick={onToggleReferred}
          >
            <Gift className="h-3.5 w-3.5 mr-1.5" />
            {t("labels.referred")}
          </Button>
        )}
      </div>
    </div>
  );
}

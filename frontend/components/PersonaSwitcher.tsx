import React, { useState, useEffect } from "react"; // useEffect kept for role sync
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { USER_ROLES } from "@shared/user-roles";

interface PersonaSwitcherProps {
  className?: string;
  variant?: "default" | "compact";
  showBadge?: boolean;
  onPersonaChange?: (newPersona: string) => void;
}

export function PersonaSwitcher({
  className = "",
  variant = "default",
  showBadge = true,
  onPersonaChange,
}: PersonaSwitcherProps) {
  const { user, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [selectedPersona, setSelectedPersona] = useState<string>(user?.role || "job_seeker");

  useEffect(() => {
    if (user?.role) setSelectedPersona(user.role);
  }, [user?.role]);

  const handlePersonaSwitch = (newPersona: string) => {
    try {
      setSelectedPersona(newPersona);
      onPersonaChange?.(newPersona);
      toast({
        title: "Persona Preview",
        description: `Previewing as ${getRoleDisplayLabel(newPersona)}.`,
      });
    } catch (error) {
      console.error("Failed to switch persona", error);
      setSelectedPersona(user?.role || "job_seeker");
    }
  };

  // Don't render if not superadmin
  if (!isSuperAdmin) {
    return null;
  }

  const containerClasses = variant === "compact" 
    ? "flex items-center gap-2" 
    : "flex flex-col items-end gap-2";

  const selectWidth = variant === "compact" ? "w-[180px]" : "w-[200px]";

  return (
    <div className={`${containerClasses} ${className}`}>
      {showBadge && (
        <Badge variant="secondary" className={variant === "compact" ? "text-xs" : "mb-1"}>
          SuperAdmin Mode
        </Badge>
      )}
      
      <Select value={selectedPersona} onValueChange={handlePersonaSwitch}>
        <SelectTrigger className={selectWidth}>
          <SelectValue placeholder="Select Persona" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={USER_ROLES.JOB_SEEKER}>Job Seeker</SelectItem>
          <SelectItem value={USER_ROLES.RECRUITER}>Recruiter</SelectItem>
          <SelectItem value={USER_ROLES.EMPLOYER}>Employer</SelectItem>
          <SelectItem value={USER_ROLES.ADMIN}>Administrator</SelectItem>
          <SelectItem value={USER_ROLES.SUPER_ADMIN}>Super Administrator</SelectItem>
        </SelectContent>
      </Select>
      
      {variant === "default" && (
        <p className="text-xs text-muted-foreground">
          Current: {getRoleDisplayLabel(selectedPersona)}
        </p>
      )}
    </div>
  );
}

export default PersonaSwitcher;

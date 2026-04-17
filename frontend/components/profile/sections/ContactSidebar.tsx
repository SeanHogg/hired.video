import { Mail, Phone, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SectionEditButton from "./SectionEditButton";

interface ContactSidebarProps {
  email?: string;
  phone?: string;
  website?: string;
  isOwner: boolean;
  onEdit?: () => void;
}

export default function ContactSidebar({
  email,
  phone,
  website,
  isOwner,
  onEdit,
}: ContactSidebarProps) {
  const hasInfo = email || phone || website;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Contact Information</CardTitle>
        {isOwner && onEdit && <SectionEditButton onClick={onEdit} label="Edit contact" />}
      </CardHeader>
      <CardContent className="space-y-3">
        {email && (
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <a
              href={`mailto:${email}`}
              className="text-sm text-primary hover:underline truncate"
            >
              {email}
            </a>
          </div>
        )}
        {phone && (
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm">{phone}</span>
          </div>
        )}
        {website && (
          <div className="flex items-center gap-3">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline truncate"
            >
              {website.replace(/^https?:\/\//, "")}
            </a>
          </div>
        )}
        {!hasInfo && (
          <p className="text-sm text-muted-foreground text-center py-2">
            {isOwner ? "Add your contact information." : "No contact information available."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

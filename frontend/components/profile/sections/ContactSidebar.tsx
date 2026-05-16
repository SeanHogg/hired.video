import { Mail, Phone, MapPin, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SectionEditButton from "./SectionEditButton";

interface ContactSidebarProps {
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  isOwner: boolean;
  onEdit?: () => void;
  /** Privacy flags — only consulted for non-owners. When false, the owner's
   *  information is masked even if set. Owners always see their own data. */
  visibility?: {
    showEmail?: boolean;
    showPhone?: boolean;
    showLocation?: boolean;
  };
}

export default function ContactSidebar({
  email,
  phone,
  location,
  website,
  isOwner,
  onEdit,
  visibility,
}: ContactSidebarProps) {
  const showEmail = isOwner || visibility?.showEmail;
  const showPhone = isOwner || visibility?.showPhone;
  const showLocation = isOwner || visibility?.showLocation;
  // Website is conceptually public — owners who don't want it exposed leave
  // it blank.
  const showWebsite = true;

  const visibleEmail = showEmail ? email : undefined;
  const visiblePhone = showPhone ? phone : undefined;
  const visibleLocation = showLocation ? location : undefined;
  const visibleWebsite = showWebsite ? website : undefined;

  const hasInfo = visibleEmail || visiblePhone || visibleLocation || visibleWebsite;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Contact Information</CardTitle>
        {isOwner && onEdit && <SectionEditButton onClick={onEdit} label="Edit contact" />}
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleEmail && (
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <a
              href={`mailto:${visibleEmail}`}
              className="text-sm text-primary hover:underline truncate"
            >
              {visibleEmail}
            </a>
          </div>
        )}
        {visiblePhone && (
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm">{visiblePhone}</span>
          </div>
        )}
        {visibleLocation && (
          <div className="flex items-center gap-3">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm">{visibleLocation}</span>
          </div>
        )}
        {visibleWebsite && (
          <div className="flex items-center gap-3">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <a
              href={visibleWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline truncate"
            >
              {visibleWebsite.replace(/^https?:\/\//, "")}
            </a>
          </div>
        )}
        {!hasInfo && (
          <p className="text-sm text-muted-foreground text-center py-2">
            {isOwner
              ? "Add your contact information."
              : "Contact information is private."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

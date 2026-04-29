import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  ExternalLink,
  Link as LinkIcon,
  Share,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import SectionEditButton from "./SectionEditButton";

interface ProfileHeaderProps {
  avatar?: string;
  firstName: string;
  lastName: string;
  headline?: string;
  roleBadge: string;
  subscription?: string;
  email: string;
  phone?: string;
  location?: string;
  currentRole?: string;
  currentCompany?: string;
  website?: string;
  joinedText: string;
  slug?: string;
  isOwner: boolean;
  onEditProfile?: () => void;
  onEditUrl?: () => void;
  onShare?: () => void;
  stats?: { connections: number; followers: number; profileViews: number };
}

export default function ProfileHeader({
  avatar,
  firstName,
  lastName,
  headline,
  roleBadge,
  subscription,
  email,
  phone,
  location,
  currentRole,
  currentCompany,
  website,
  joinedText,
  slug,
  isOwner,
  onEditProfile,
  onEditUrl,
  onShare,
  stats,
}: ProfileHeaderProps) {
  const { t } = useTranslation();
  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`;
  const fullName = `${firstName} ${lastName}`.trim() || t("labels.userFallback");

  const roleAtCompany = currentRole && currentCompany
    ? t("labels.atCompany", { role: currentRole, company: currentCompany })
    : currentRole || currentCompany || "";

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <Avatar className="w-28 h-28 lg:w-32 lg:h-32">
              <AvatarImage src={avatar} alt={fullName} />
              <AvatarFallback className="text-3xl lg:text-4xl">
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold">{fullName}</h1>
                {headline && (
                  <p className="text-base lg:text-lg text-muted-foreground mt-1">
                    {headline}
                  </p>
                )}
              </div>
              {isOwner && (
                <div className="flex items-center gap-2">
                  {onEditProfile && (
                    <SectionEditButton onClick={onEditProfile} label={t("actions.editProfile")} />
                  )}
                  {onShare && (
                    <Button variant="outline" size="sm" onClick={onShare}>
                      <Share className="h-4 w-4 mr-2" />
                      {t("actions.share")}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Badges */}
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline">{roleBadge}</Badge>
              {subscription && subscription !== "free" && (
                <Badge variant="secondary" className="capitalize">
                  {t("labels.subscriptionMember", { tier: subscription })}
                </Badge>
              )}
            </div>

            {/* Details */}
            <div className="space-y-1.5 text-sm text-muted-foreground">
              {(currentRole || currentCompany) && (
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 shrink-0" />
                  <span>{roleAtCompany}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0" />
                <span>{email}</span>
              </div>
              {phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span>{phone}</span>
                </div>
              )}
              {location && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>{location}</span>
                </div>
              )}
              {website && (
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {website}
                  </a>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>{joinedText}</span>
              </div>
              {/* Custom URL */}
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 shrink-0" />
                {slug ? (
                  <a
                    href={`/people/${slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    hired.video/people/{slug}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("labels.noCustomUrlSet")}
                  </span>
                )}
                {isOwner && onEditUrl && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
                    onClick={onEditUrl}
                  >
                    {slug ? t("actions.edit") : t("actions.setCustomUrl")}
                  </button>
                )}
              </div>
            </div>

            {/* Stats */}
            {isOwner && stats && (
              <div className="grid grid-cols-3 gap-4 text-center mt-5 pt-4 border-t">
                <div>
                  <div className="text-xl font-bold text-primary">{stats.connections}</div>
                  <div className="text-xs text-muted-foreground">{t("labels.connections")}</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-primary">{stats.followers}</div>
                  <div className="text-xs text-muted-foreground">{t("labels.followers")}</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-primary">{stats.profileViews}</div>
                  <div className="text-xs text-muted-foreground">{t("labels.profileViews")}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

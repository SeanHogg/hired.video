import { Link } from "react-router-dom";
import {
  BarChart3,
  Bookmark,
  Briefcase,
  ChevronRight,
  Eye,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import type { User } from "@/lib/auth";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import { roleUtils } from "@/lib/role-utils";

interface FeedProfileCardProps {
  user: User;
}

interface QuickLink {
  to: string;
  Icon: LucideIcon;
  label: string;
}

const JOB_SEEKER_LINKS: QuickLink[] = [
  { to: "/resumes", Icon: Bookmark, label: "My Resumes" },
  { to: "/people", Icon: Users, label: "My Network" },
];

const EMPLOYER_LINKS: QuickLink[] = [
  { to: "/jobs", Icon: Briefcase, label: "ATS" },
  { to: "/companies", Icon: BarChart3, label: "Stats" },
];

export default function FeedProfileCard({ user }: FeedProfileCardProps) {
  const effectiveRole = useEffectiveRole();
  const quickLinks = roleUtils.isEmployer(effectiveRole) ? EMPLOYER_LINKS : JOB_SEEKER_LINKS;
  const initials = (user.name || user.email || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const role = (user as any).role ?? "";
  const headline = (user as any).headline ?? role ?? "Professional";
  const avatar = (user as any).avatar ?? "";

  return (
    <div className="bg-card border rounded-xl overflow-hidden text-sm">
      {/* Cover + Avatar */}
      <div className="h-14 bg-primary" />
      <div className="px-4 pb-4">
        <div className="-mt-7 mb-3">
          <Avatar className="w-14 h-14 border-2 border-background">
            <AvatarImage src={avatar} alt={user.name ?? ""} />
            <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        <Link to="/profile" className="font-semibold text-base hover:underline leading-tight block">
          {user.name ?? user.email}
        </Link>
        <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{headline}</p>

        <Separator className="my-3" />

        {/* Stats */}
        <div className="space-y-2">
          <Link
            to="/profile"
            className="flex items-center justify-between py-1 hover:text-primary transition-colors"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              Profile views
            </span>
            <span className="font-semibold text-primary text-xs">View</span>
          </Link>
          <Link
            to="/feed"
            className="flex items-center justify-between py-1 hover:text-primary transition-colors"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Post impressions
            </span>
            <span className="font-semibold text-primary text-xs">View</span>
          </Link>
        </div>

        <Separator className="my-3" />

        {/* Quick links — switch by role so employers see ATS/Stats and
            job seekers see Resumes/Network. */}
        <div className="space-y-1">
          {quickLinks.map(({ to, Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center justify-between py-1.5 rounded hover:bg-muted px-1 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {label}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

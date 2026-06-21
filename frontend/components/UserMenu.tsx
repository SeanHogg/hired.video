import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut, Settings, Heart, Trophy } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useSignOut } from "@/hooks/use-sign-out";

/**
 * UserMenu — the avatar dropdown in the top bar that consolidates every
 * account action (profile, settings, wishlist, points, sign out). Shown on
 * mobile AND desktop, replacing the user block that used to live in the
 * sidebar rail. Self-gates: renders nothing for signed-out visitors (the nav
 * shows <AuthButtons> instead), so callers can drop <UserMenu /> unconditionally.
 */
export function UserMenu() {
  const { isAuthenticated, user } = useAuth();
  const { t } = useTranslation();
  const signOut = useSignOut();

  if (!isAuthenticated || !user) return null;

  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={t("userMenu.openAriaLabel")}
      >
        <Avatar className="h-8 w-8 border border-border">
          <AvatarImage src={user.avatar} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-3 py-2">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate capitalize">
              {user.role?.replace("_", " ")}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <Settings className="mr-2 h-4 w-4" />
            {t("labels.accountSettings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/wishlist">
            <Heart className="mr-2 h-4 w-4" />
            {t("labels.wishlist", { defaultValue: "Wishlist" })}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/points">
            <Trophy className="mr-2 h-4 w-4" />
            {t("userMenu.pointsRewards")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut()}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("actions.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

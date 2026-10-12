import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut, Settings, Heart, Trophy } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMenuCount } from "@/components/ui/menu-item-count";
import { useAuth } from "@/lib/auth";
import { useSignOut } from "@/hooks/use-sign-out";
import { useInboxUnreadCount } from "@/hooks/use-inbox-unread-count";
import { SuperAdminMenuItems } from "@/components/EmulationBar";
import { LocaleMenuItems } from "@/components/i18n/LocaleSwitcher";
import { ThemeMenuItems } from "@/components/theme/ThemeMenuItems";
import { CartMenuItem } from "@/components/cart/CartMenuItem";
import { InboxMenuItem } from "@/components/communication/InboxMenuItem";
import { InboxOverlay } from "@/components/communication/InboxOverlay";

/**
 * UserMenu — the avatar dropdown in the top bar, and the SINGLE home for every
 * top-bar control: inbox, cart, account (settings, wishlist, points), theme,
 * language, SuperAdmin tools and sign out. The bar itself keeps only the
 * avatar, whose badge carries the unread count.
 *
 * Composition, not accumulation: each section is its own self-gating
 * embeddable (<InboxMenuItem>, <CartMenuItem>, <ThemeMenuItems>,
 * <LocaleMenuItems>, <SuperAdminMenuItems>), so adding a control never means
 * editing this file's logic. Self-gates: renders nothing for signed-out
 * visitors (the nav shows <AuthButtons> instead), so callers can drop
 * <UserMenu /> unconditionally.
 */
export function UserMenu() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated || !user) return null;
  return <AuthenticatedUserMenu />;
}

function AuthenticatedUserMenu() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const signOut = useSignOut();
  const unreadCount = useInboxUnreadCount();
  // The overlay is mounted OUTSIDE DropdownMenuContent: menu content unmounts
  // on close, which would tear the drawer down with it.
  const [inboxOpen, setInboxOpen] = useState(false);

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const triggerLabel =
    unreadCount > 0
      ? t("userMenu.openAriaLabelWithUnread", { count: unreadCount })
      : t("userMenu.openAriaLabel");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="relative rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={triggerLabel}
        >
          <Avatar className="h-8 w-8 border border-border">
            <AvatarImage src={user?.avatar} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              aria-hidden="true"
              className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center px-1 text-[10px]"
            >
              {formatMenuCount(unreadCount)}
            </Badge>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="flex items-center gap-3 py-2">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate capitalize">
                {user?.role?.replace("_", " ")}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <InboxMenuItem onSelect={() => setInboxOpen(true)} />
          <CartMenuItem />
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings">
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
          {/* Appearance, language and the SuperAdmin tools — every control the
              top bar used to carry inline, now folded in at ALL breakpoints.
              SuperAdminMenuItems self-gates to SuperAdmins; the other two show
              for everyone. */}
          <ThemeMenuItems />
          <LocaleMenuItems />
          <SuperAdminMenuItems />
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
      <InboxOverlay open={inboxOpen} onOpenChange={setInboxOpen} />
    </>
  );
}

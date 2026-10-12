/**
 * CartMenuItem — "Cart" as a plain menu item (with its item count) for
 * embedding INSIDE an existing DropdownMenuContent. Opens the shared cart
 * drawer (<CartPanel />) through the cart context, so the top bar no longer
 * needs a standalone cart icon.
 *
 * Self-contained: it reads the cart itself and needs no props.
 */
import { useTranslation } from "react-i18next";
import { ShoppingCart } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { MenuItemCount } from "@/components/ui/menu-item-count";
import { useCart } from "@/lib/cart-context";

export function CartMenuItem(): JSX.Element {
  const { t } = useTranslation();
  const { openCart, getItemCount } = useCart();
  const count = getItemCount();

  return (
    <DropdownMenuItem onSelect={() => openCart()}>
      <ShoppingCart className="mr-2 h-4 w-4" aria-hidden="true" />
      {t("userMenu.cart")}
      <MenuItemCount count={count} />
    </DropdownMenuItem>
  );
}

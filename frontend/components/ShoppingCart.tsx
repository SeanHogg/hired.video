import {
  ShoppingCart as ShoppingCartIcon,
  Plus,
  Minus,
  X,
  CreditCard,
  Users,
  Briefcase,
  FileType,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCart } from "@/lib/cart-context";

export default function ShoppingCart() {
  const navigate = useNavigate();
  const {
    items,
    isOpen,
    removeItem,
    updateQuantity,
    updateUsers,
    updateBillingCycle,
    clearCart,
    openCart,
    closeCart,
    getTotalPrice,
    getItemCount,
  } = useCart();

  const handleCheckout = () => {
    closeCart();
    navigate("/checkout");
  };

  const formatPlanPrice = (price: number, billingCycle?: "monthly" | "annual") => {
    if (billingCycle === "annual") {
      return `$${price.toFixed(2)}/year`;
    }
    return `$${price.toFixed(2)}/month`;
  };

  const formatServicePrice = (price: number) => `$${price.toFixed(2)}`;

  const itemCount = getItemCount();
  const totalPrice = getTotalPrice();

  const serviceItems = items.filter((i) => i.type === "service");
  const templateItems = items.filter((i) => i.type === "template");
  // Plans = everything that isn't a service or template (keeps voice_clone
  // alongside subscription plans, matching prior behavior).
  const planItems = items.filter((i) => i.type !== "service" && i.type !== "template");

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => (open ? openCart() : closeCart())}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <ShoppingCartIcon className="h-4 w-4" />
          {itemCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {itemCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[90%] max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Shopping Cart</SheetTitle>
          <SheetDescription>
            Review your items and proceed to checkout
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {items.length === 0 ? (
            <div className="text-center py-8">
              <ShoppingCartIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Your cart is empty</h3>
              <p className="text-muted-foreground mb-6">
                Add a premium plan to get started
              </p>
              <Button
                onClick={() => {
                  closeCart();
                  navigate("/pricing");
                }}
                className="w-full"
              >
                View Pricing Plans
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  closeCart();
                  navigate("/marketplace");
                }}
                className="w-full mt-2"
              >
                Browse Marketplace
              </Button>
            </div>
          ) : (
            <>
              {/* Service Items */}
              {serviceItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    <Briefcase className="h-3.5 w-3.5" />
                    Services
                  </div>
                  {serviceItems.map((item) => (
                    <Card key={item.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{item.name}</h4>
                            {item.providerName && (
                              <p className="text-xs text-muted-foreground">
                                by {item.providerName}
                              </p>
                            )}
                            <p className="text-sm font-semibold mt-1 text-violet-600">
                              {formatServicePrice(item.price)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(item.id)}
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {templateItems.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    <FileType className="h-3.5 w-3.5" />
                    Resume Templates
                  </div>
                  {templateItems.map((item) => (
                    <Card key={item.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{item.name}</h4>
                            <p className="text-xs text-muted-foreground">One-time purchase</p>
                            <p className="text-sm font-semibold mt-1 text-violet-600">
                              {item.price > 0 ? formatServicePrice(item.price) : "Free"}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(item.id)}
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Plan Items */}
              {planItems.length > 0 && (
                <div className="space-y-3">
                  {(serviceItems.length > 0 || templateItems.length > 0) && (
                    <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      <CreditCard className="h-3.5 w-3.5" />
                      Plans
                    </div>
                  )}
                  {planItems.map((item) => (
                    <Card key={item.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium">{item.name}</h4>
                            <p className="text-sm text-muted-foreground mb-3">
                              {formatPlanPrice(item.price, item.billingCycle)}
                              {item.billingCycle === "annual" && (
                                <Badge
                                  variant="secondary"
                                  className="ml-2 text-xs"
                                >
                                  20% OFF
                                </Badge>
                              )}
                            </p>

                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                <span className="text-sm font-medium">
                                  Number of users:
                                </span>
                                <Select
                                  value={(item.users ?? 1).toString()}
                                  onValueChange={(value) =>
                                    updateUsers(item.id, parseInt(value))
                                  }
                                >
                                  <SelectTrigger className="w-20">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from(
                                      { length: 20 },
                                      (_, i) => i + 1,
                                    ).map((num) => (
                                      <SelectItem
                                        key={num}
                                        value={num.toString()}
                                      >
                                        {num}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  Billing:
                                </span>
                                <Select
                                  value={item.billingCycle ?? "monthly"}
                                  onValueChange={(
                                    value: "monthly" | "annual",
                                  ) => updateBillingCycle(item.id, value)}
                                >
                                  <SelectTrigger className="w-32">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="monthly">
                                      Monthly
                                    </SelectItem>
                                    <SelectItem value="annual">
                                      Annual
                                      <Badge
                                        variant="secondary"
                                        className="ml-2 text-xs"
                                      >
                                        Save 20%
                                      </Badge>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  Quantity:
                                </span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() =>
                                      updateQuantity(item.id, item.quantity - 1)
                                    }
                                    disabled={item.quantity <= 1}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-8 text-center text-sm">
                                    {item.quantity}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() =>
                                      updateQuantity(item.id, item.quantity + 1)
                                    }
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(item.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <Separator />

              {/* Total */}
              <div className="space-y-2">
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total:</span>
                  <span>${totalPrice.toFixed(2)}</span>
                </div>
                {planItems.some((item) => item.billingCycle === "annual") && (
                  <p className="text-sm text-green-600">
                    ✓ You're saving 20% with annual billing!
                  </p>
                )}
              </div>

              {/* Checkout Button */}
              <Button className="w-full" onClick={handleCheckout}>
                <CreditCard className="h-4 w-4 mr-2" />
                Proceed to Checkout — ${totalPrice.toFixed(2)}
              </Button>

              {/* Clear Cart */}
              <Button variant="outline" className="w-full" onClick={clearCart}>
                Clear Cart
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

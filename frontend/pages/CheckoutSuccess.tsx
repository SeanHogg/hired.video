import { CheckCircle2, ArrowRight, CreditCard, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { toast } from "sonner";

export default function CheckoutSuccess() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated } = useAuth();
  const { clearCart } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(true);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login?redirect=/checkout");
    }
  }, [isAuthenticated, navigate]);

  // Handle successful payment setup
  useEffect(() => {
    if (isAuthenticated) {
      // Clear the cart since payment setup was successful
      clearCart();
      
      // Show success message
      toast.success("Payment successful! Welcome to Premium! 🎉");
      
      setIsProcessing(false);
    }
  }, [isAuthenticated, clearCart]);

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16 min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
          <div className="max-w-4xl mx-auto p-6">
            <div className="text-center space-y-8">
              {/* Success Icon */}
              <div className="flex justify-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
              </div>

              {/* Success Message */}
              <div className="space-y-4">
                <h1 className="text-4xl font-bold text-foreground">
                  Payment Setup Complete!
                </h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                  Your payment method has been successfully configured. Welcome to Premium!
                </p>
              </div>

              {/* Features Card */}
              <Card className="max-w-2xl mx-auto">
                <CardHeader>
                  <CardTitle className="flex items-center justify-center gap-2">
                    <Users className="h-5 w-5" />
                    You now have access to Premium features
                  </CardTitle>
                  <CardDescription>
                    Start exploring all the powerful tools available to Premium members
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span>Unlimited AI requests</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span>Advanced resume templates</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span>Priority support</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span>Enhanced analytics</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  asChild
                  size="lg"
                  className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                >
                  <Link to="/dashboard">
                    Go to Dashboard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/settings?tab=billing">
                    <CreditCard className="mr-2 h-4 w-4" />
                    Manage Billing
                  </Link>
                </Button>
              </div>

              {/* Additional Info */}
              <div className="text-sm text-muted-foreground max-w-xl mx-auto">
                <p>
                  Your subscription is now active. You can manage your billing settings, 
                  view invoices, and update payment methods in your account settings.
                </p>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  CreditCard,
  Download,
  TrendingUp,
  FileText,
  Settings,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  limits: {
    users: number;
    jobs: number;
    resumes: number;
    aiCredits: number;
  };
  isPopular?: boolean;
}

interface CurrentSubscription {
  planId: string;
  planName: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  usage: {
    users: number;
    jobs: number;
    resumes: number;
    aiCredits: number;
  };
}

interface PaymentMethod {
  id: string;
  type: 'card';
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

interface Invoice {
  id: string;
  number: string;
  status: 'paid' | 'pending' | 'failed';
  amount: number;
  currency: string;
  date: Date;
  dueDate: Date;
  downloadUrl?: string;
}

const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    features: ['Basic resume builder', 'Up to 3 resumes', 'Basic templates'],
    limits: { users: 1, jobs: 5, resumes: 3, aiCredits: 10 }
  },
  {
    id: 'pro',
    name: 'Professional',
    price: 29,
    interval: 'month',
    features: ['Advanced resume builder', 'Unlimited resumes', 'Premium templates', 'AI assistance'],
    limits: { users: 1, jobs: 50, resumes: -1, aiCredits: 100 },
    isPopular: true
  },
  {
    id: 'employer',
    name: 'Employer',
    price: 99,
    interval: 'month',
    features: ['Team collaboration', 'Advanced analytics', 'Custom branding', 'Priority support'],
    limits: { users: 10, jobs: 200, resumes: -1, aiCredits: 500 }
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 299,
    interval: 'month',
    features: ['Unlimited users', 'Advanced integrations', 'Custom features', 'Dedicated support'],
    limits: { users: -1, jobs: -1, resumes: -1, aiCredits: -1 }
  }
];

export function BillingManagement() {
  const [activeTab, setActiveTab] = useState('overview');
  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPlanDialog, setShowPlanDialog] = useState(false);

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API calls
      
      // Mock current subscription
      setCurrentSubscription({
        planId: 'pro',
        planName: 'Professional',
        status: 'active',
        currentPeriodStart: new Date('2024-03-01'),
        currentPeriodEnd: new Date('2024-04-01'),
        cancelAtPeriodEnd: false,
        usage: {
          users: 1,
          jobs: 23,
          resumes: 8,
          aiCredits: 67
        }
      });

      // Mock payment methods
      setPaymentMethods([
        {
          id: 'pm_1',
          type: 'card',
          brand: 'visa',
          last4: '4242',
          expiryMonth: 12,
          expiryYear: 2025,
          isDefault: true
        },
        {
          id: 'pm_2',
          type: 'card',
          brand: 'mastercard',
          last4: '5555',
          expiryMonth: 8,
          expiryYear: 2026,
          isDefault: false
        }
      ]);

      // Mock invoices
      setInvoices([
        {
          id: 'inv_1',
          number: 'INV-2024-001',
          status: 'paid',
          amount: 29.00,
          currency: 'USD',
          date: new Date('2024-03-01'),
          dueDate: new Date('2024-03-01'),
          downloadUrl: '/invoices/inv_1.pdf'
        },
        {
          id: 'inv_2',
          number: 'INV-2024-002',
          status: 'paid',
          amount: 29.00,
          currency: 'USD',
          date: new Date('2024-02-01'),
          dueDate: new Date('2024-02-01'),
          downloadUrl: '/invoices/inv_2.pdf'
        }
      ]);
    } catch (error) {
      console.error('Failed to load billing data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePlan = async (planId: string) => {
    try {
      // TODO: Implement plan change logic
      console.log('Changing to plan:', planId);
      setShowPlanDialog(false);
    } catch (error) {
      console.error('Failed to change plan:', error);
    }
  };

  const _handleCancelSubscription = async () => {
    try {
      // TODO: Implement subscription cancellation
      console.log('Canceling subscription');
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'trialing':
        return 'bg-blue-100 text-blue-800';
      case 'past_due':
        return 'bg-red-100 text-red-800';
      case 'canceled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === -1) return 0; // Unlimited
    return Math.min((used / limit) * 100, 100);
  };

  const formatLimit = (limit: number) => {
    return limit === -1 ? 'Unlimited' : limit.toString();
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading billing information...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CreditCard className="h-8 w-8" />
            Billing & Subscriptions
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your subscription, payment methods, and billing history
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download Receipts
          </Button>
          <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
            <DialogTrigger asChild>
              <Button>
                <TrendingUp className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Choose Your Plan</DialogTitle>
                <DialogDescription>
                  Select the plan that best fits your needs
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {SUBSCRIPTION_PLANS.map((plan) => (
                  <Card key={plan.id} className={`relative ${plan.isPopular ? 'border-primary' : ''}`}>
                    {plan.isPopular && (
                      <Badge className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                        Most Popular
                      </Badge>
                    )}
                    <CardHeader className="text-center">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <div className="text-3xl font-bold">
                        ${plan.price}
                        <span className="text-sm font-normal text-muted-foreground">
                          /{plan.interval}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="space-y-2 text-sm">
                        {plan.features.map((feature, index) => (
                          <li key={index} className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <div>Users: {formatLimit(plan.limits.users)}</div>
                        <div>Jobs: {formatLimit(plan.limits.jobs)}</div>
                        <div>AI Credits: {formatLimit(plan.limits.aiCredits)}</div>
                      </div>
                      
                      <Button 
                        className="w-full" 
                        variant={currentSubscription?.planId === plan.id ? "outline" : "default"}
                        onClick={() => handleChangePlan(plan.id)}
                        disabled={currentSubscription?.planId === plan.id}
                      >
                        {currentSubscription?.planId === plan.id ? 'Current Plan' : 'Select Plan'}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="payment-methods">Payment Methods</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Current Plan */}
          {currentSubscription && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Current Plan
                  <Badge className={getStatusColor(currentSubscription.status)}>
                    {currentSubscription.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{currentSubscription.planName}</h3>
                    <p className="text-muted-foreground">
                      Next billing: {currentSubscription.currentPeriodEnd.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">$29</div>
                    <div className="text-sm text-muted-foreground">per month</div>
                  </div>
                </div>
                
                {currentSubscription.cancelAtPeriodEnd && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Your subscription will be canceled at the end of the current billing period.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Usage Overview */}
          {currentSubscription && (
            <Card>
              <CardHeader>
                <CardTitle>Usage This Month</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Users</span>
                      <span className="text-sm text-muted-foreground">
                        {currentSubscription.usage.users} / {formatLimit(SUBSCRIPTION_PLANS.find(p => p.id === currentSubscription.planId)?.limits.users || 0)}
                      </span>
                    </div>
                    <Progress 
                      value={getUsagePercentage(
                        currentSubscription.usage.users, 
                        SUBSCRIPTION_PLANS.find(p => p.id === currentSubscription.planId)?.limits.users || 0
                      )} 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Jobs Posted</span>
                      <span className="text-sm text-muted-foreground">
                        {currentSubscription.usage.jobs} / {formatLimit(SUBSCRIPTION_PLANS.find(p => p.id === currentSubscription.planId)?.limits.jobs || 0)}
                      </span>
                    </div>
                    <Progress 
                      value={getUsagePercentage(
                        currentSubscription.usage.jobs, 
                        SUBSCRIPTION_PLANS.find(p => p.id === currentSubscription.planId)?.limits.jobs || 0
                      )} 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Resumes</span>
                      <span className="text-sm text-muted-foreground">
                        {currentSubscription.usage.resumes} / {formatLimit(SUBSCRIPTION_PLANS.find(p => p.id === currentSubscription.planId)?.limits.resumes || 0)}
                      </span>
                    </div>
                    <Progress 
                      value={getUsagePercentage(
                        currentSubscription.usage.resumes, 
                        SUBSCRIPTION_PLANS.find(p => p.id === currentSubscription.planId)?.limits.resumes || 0
                      )} 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">AI Credits</span>
                      <span className="text-sm text-muted-foreground">
                        {currentSubscription.usage.aiCredits} / {formatLimit(SUBSCRIPTION_PLANS.find(p => p.id === currentSubscription.planId)?.limits.aiCredits || 0)}
                      </span>
                    </div>
                    <Progress 
                      value={getUsagePercentage(
                        currentSubscription.usage.aiCredits, 
                        SUBSCRIPTION_PLANS.find(p => p.id === currentSubscription.planId)?.limits.aiCredits || 0
                      )} 
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <TrendingUp className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Upgrade Plan</h3>
                    <p className="text-sm text-muted-foreground">Get more features</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <CreditCard className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Payment Methods</h3>
                    <p className="text-sm text-muted-foreground">Manage cards</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Download Invoices</h3>
                    <p className="text-sm text-muted-foreground">View billing history</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subscription" className="space-y-4">
          <Alert>
            <Settings className="h-4 w-4" />
            <AlertDescription>
              Detailed subscription management will be implemented in the next phase.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="payment-methods" className="space-y-4">
          {paymentMethods.length === 0 ? (
            <Alert>
              <CreditCard className="h-4 w-4" />
              <AlertDescription>No payment methods on file.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((pm) => (
                <Card key={pm.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium uppercase">{pm.brand} •••• {pm.last4}</div>
                        <div className="text-sm text-muted-foreground">Expires {pm.expiryMonth}/{pm.expiryYear}</div>
                      </div>
                    </div>
                    {pm.isDefault && <Badge variant="secondary">Default</Badge>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          {invoices.length === 0 ? (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>No invoices found.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {invoices.map((inv) => (
                <Card key={inv.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <div className="font-medium">{inv.number}</div>
                      <div className="text-sm text-muted-foreground">
                        {inv.date.toLocaleDateString()} • {inv.currency} {inv.amount.toFixed(2)}
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <a href={inv.downloadUrl}>Download</a>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

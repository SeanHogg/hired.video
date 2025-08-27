import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  CreditCard, 
  BarChart3, 
  Settings, 
  Shield, 
  TrendingUp,
  UserPlus,
  DollarSign,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { TeamManagement } from '@/components/team/TeamManagement';
import { BillingManagement } from '@/components/billing/BillingManagement';
import { BillingAnalytics } from '@/components/billing/BillingAnalytics';
import { usePermissions, PermissionGate, RoleGate } from '@/hooks/use-permissions';
import { MyVideoResumeRole } from '@/types/account';
import { useAuth } from '@/lib/auth';

interface QuickStat {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const { user } = useAuth();
  const { permissions, isOwner, isAdmin } = usePermissions();

  const quickStats: QuickStat[] = [
    {
      title: 'Team Members',
      value: '12',
      change: '+2 this month',
      trend: 'up',
      icon: <Users className="h-5 w-5" />
    },
    {
      title: 'Monthly Revenue',
      value: '$2,450',
      change: '+15% from last month',
      trend: 'up',
      icon: <DollarSign className="h-5 w-5" />
    },
    {
      title: 'Active Jobs',
      value: '34',
      change: '+8 this week',
      trend: 'up',
      icon: <BarChart3 className="h-5 w-5" />
    },
    {
      title: 'Subscription',
      value: 'Business Plan',
      change: 'Renews in 15 days',
      trend: 'neutral',
      icon: <CreditCard className="h-5 w-5" />
    }
  ];

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4" />;
      case 'down':
        return <TrendingUp className="h-4 w-4 rotate-180" />;
      default:
        return <Calendar className="h-4 w-4" />;
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">
              You don't have permission to access the admin dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage your team, billing, and organization settings
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant={isOwner ? "default" : "secondary"}>
            {isOwner ? "Account Owner" : "Admin"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Welcome back, {user?.firstName || 'Admin'}
          </span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          
          <PermissionGate resource="team_members" action="read">
            <TabsTrigger value="team">Team</TabsTrigger>
          </PermissionGate>
          
          <PermissionGate resource="billing" action="read">
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </PermissionGate>
          
          <PermissionGate resource="analytics" action="read">
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </PermissionGate>
          
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickStats.map((stat, index) => (
              <Card key={index}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {stat.title}
                      </p>
                      <p className="text-2xl font-bold">{stat.value}</p>
                    </div>
                    <div className="p-2 bg-primary/10 rounded-lg">
                      {stat.icon}
                    </div>
                  </div>
                  <div className={`flex items-center mt-2 ${getTrendColor(stat.trend)}`}>
                    {getTrendIcon(stat.trend)}
                    <span className="text-sm ml-1">{stat.change}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <PermissionGate resource="team_members" action="create">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <UserPlus className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Invite Team Member</h3>
                      <p className="text-sm text-muted-foreground">
                        Add new users to your organization
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </PermissionGate>

            <PermissionGate resource="billing" action="manage">
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <CreditCard className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Manage Billing</h3>
                      <p className="text-sm text-muted-foreground">
                        Update payment methods and plans
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </PermissionGate>

            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Settings className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Organization Settings</h3>
                    <p className="text-sm text-muted-foreground">
                      Configure company preferences
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="p-2 bg-blue-100 rounded-full">
                    <UserPlus className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">New team member invited</p>
                    <p className="text-sm text-muted-foreground">
                      sarah.johnson@company.com was invited as a Recruiter
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">2 hours ago</span>
                </div>

                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="p-2 bg-green-100 rounded-full">
                    <CreditCard className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Payment successful</p>
                    <p className="text-sm text-muted-foreground">
                      Monthly subscription payment of $99.00 processed
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">1 day ago</span>
                </div>

                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="p-2 bg-yellow-100 rounded-full">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Usage limit warning</p>
                    <p className="text-sm text-muted-foreground">
                      You've used 85% of your monthly AI credits
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">3 days ago</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <PermissionGate resource="team_members" action="read">
          <TabsContent value="team">
            <TeamManagement />
          </TabsContent>
        </PermissionGate>

        <PermissionGate resource="billing" action="read">
          <TabsContent value="billing">
            <BillingManagement />
          </TabsContent>
        </PermissionGate>

        <PermissionGate resource="analytics" action="read">
          <TabsContent value="analytics">
            <BillingAnalytics />
          </TabsContent>
        </PermissionGate>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold">Company Profile</h3>
                    <p className="text-sm text-muted-foreground">
                      Update your organization's basic information
                    </p>
                  </div>
                  <Button variant="outline">Edit</Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold">Security Settings</h3>
                    <p className="text-sm text-muted-foreground">
                      Manage authentication and security policies
                    </p>
                  </div>
                  <Button variant="outline">Configure</Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-semibold">Integrations</h3>
                    <p className="text-sm text-muted-foreground">
                      Connect with third-party services and APIs
                    </p>
                  </div>
                  <Button variant="outline">Manage</Button>
                </div>

                <RoleGate roles={[MyVideoResumeRole.AccountOwner]}>
                  <div className="flex items-center justify-between p-4 border rounded-lg border-red-200">
                    <div>
                      <h3 className="font-semibold text-red-600">Danger Zone</h3>
                      <p className="text-sm text-muted-foreground">
                        Irreversible actions that affect your entire organization
                      </p>
                    </div>
                    <Button variant="destructive" size="sm">
                      Delete Organization
                    </Button>
                  </div>
                </RoleGate>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

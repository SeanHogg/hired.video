import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  CreditCard,
  BarChart3,
  Download,
  RefreshCw,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface BillingMetrics {
  totalRevenue: number;
  monthlyRevenue: number;
  activeSubscriptions: number;
  churnRate: number;
  averageRevenuePerUser: number;
  lifetimeValue: number;
  conversionRate: number;
  trialToSubscription: number;
}

interface RevenueData {
  month: string;
  revenue: number;
  subscriptions: number;
  churn: number;
}

interface PlanDistribution {
  plan: string;
  subscribers: number;
  revenue: number;
  percentage: number;
  color: string;
}

interface ChurnAnalysis {
  period: string;
  churnRate: number;
  churned: number;
  retained: number;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

export function BillingAnalytics() {
  const [activeTab, setActiveTab] = useState("overview");
  const [dateRange, setDateRange] = useState("last_12_months");
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<BillingMetrics | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [planDistribution, setPlanDistribution] = useState<PlanDistribution[]>(
    [],
  );
  const [churnAnalysis, setChurnAnalysis] = useState<ChurnAnalysis[]>([]);

  useEffect(() => {
    loadAnalyticsData();
  }, [dateRange]);

  const loadAnalyticsData = async () => {
    setIsLoading(true);
    try {
      // TODO: Replace with actual API calls

      // Mock metrics
      setMetrics({
        totalRevenue: 125430.5,
        monthlyRevenue: 12543.0,
        activeSubscriptions: 342,
        churnRate: 3.2,
        averageRevenuePerUser: 36.67,
        lifetimeValue: 1250.0,
        conversionRate: 12.5,
        trialToSubscription: 68.3,
      });

      // Mock revenue data
      setRevenueData([
        { month: "Jan", revenue: 8500, subscriptions: 245, churn: 2.1 },
        { month: "Feb", revenue: 9200, subscriptions: 267, churn: 2.8 },
        { month: "Mar", revenue: 10100, subscriptions: 289, churn: 1.9 },
        { month: "Apr", revenue: 10800, subscriptions: 312, churn: 3.2 },
        { month: "May", revenue: 11200, subscriptions: 328, churn: 2.5 },
        { month: "Jun", revenue: 11900, subscriptions: 341, churn: 2.9 },
        { month: "Jul", revenue: 12100, subscriptions: 338, churn: 4.1 },
        { month: "Aug", revenue: 12300, subscriptions: 345, churn: 3.8 },
        { month: "Sep", revenue: 12000, subscriptions: 339, churn: 4.2 },
        { month: "Oct", revenue: 12200, subscriptions: 342, churn: 3.5 },
        { month: "Nov", revenue: 12400, subscriptions: 348, churn: 2.8 },
        { month: "Dec", revenue: 12543, subscriptions: 342, churn: 3.2 },
      ]);

      // Mock plan distribution
      setPlanDistribution([
        {
          plan: "Free",
          subscribers: 1250,
          revenue: 0,
          percentage: 65.2,
          color: COLORS[0],
        },
        {
          plan: "Professional",
          subscribers: 342,
          revenue: 9918,
          percentage: 17.8,
          color: COLORS[1],
        },
        {
          plan: "employer",
          subscribers: 89,
          revenue: 8811,
          percentage: 4.6,
          color: COLORS[2],
        },
        {
          plan: "Enterprise",
          subscribers: 23,
          revenue: 6877,
          percentage: 1.2,
          color: COLORS[3],
        },
      ]);

      // Mock churn analysis
      setChurnAnalysis([
        { period: "Q1 2024", churnRate: 2.3, churned: 18, retained: 267 },
        { period: "Q2 2024", churnRate: 2.9, churned: 24, retained: 318 },
        { period: "Q3 2024", churnRate: 4.0, churned: 34, retained: 311 },
        { period: "Q4 2024", churnRate: 3.2, churned: 27, retained: 315 },
      ]);
    } catch (error) {
      console.error("Failed to load analytics data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading analytics...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Billing Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Track revenue, subscriptions, and business metrics
          </p>
        </div>

        <div className="flex gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            <option value="last_30_days">Last 30 Days</option>
            <option value="last_3_months">Last 3 Months</option>
            <option value="last_6_months">Last 6 Months</option>
            <option value="last_12_months">Last 12 Months</option>
            <option value="year_to_date">Year to Date</option>
          </select>

          <Button variant="outline" onClick={loadAnalyticsData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>

          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="churn">Churn Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Key Metrics */}
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Total Revenue
                      </p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(metrics.totalRevenue)}
                      </p>
                    </div>
                    <div className="p-2 bg-green-100 rounded-lg">
                      <DollarSign className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                  <div className="flex items-center mt-2">
                    <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-600">
                      +12.5% from last month
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Active Subscriptions
                      </p>
                      <p className="text-2xl font-bold">
                        {metrics.activeSubscriptions}
                      </p>
                    </div>
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Users className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                  <div className="flex items-center mt-2">
                    <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-600">
                      +8.2% from last month
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Churn Rate
                      </p>
                      <p className="text-2xl font-bold">
                        {formatPercentage(metrics.churnRate)}
                      </p>
                    </div>
                    <div className="p-2 bg-red-100 rounded-lg">
                      <TrendingDown className="h-6 w-6 text-red-600" />
                    </div>
                  </div>
                  <div className="flex items-center mt-2">
                    <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                    <span className="text-sm text-red-600">
                      +0.3% from last month
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        ARPU
                      </p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(metrics.averageRevenuePerUser)}
                      </p>
                    </div>
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <CreditCard className="h-6 w-6 text-purple-600" />
                    </div>
                  </div>
                  <div className="flex items-center mt-2">
                    <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-600">
                      +4.1% from last month
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#8884d8"
                    fill="#8884d8"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Plan Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Subscription Plan Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={250}>
                  <RechartsPieChart>
                    <Pie
                      data={planDistribution}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="subscribers"
                      label={({ plan, percentage }) =>
                        `${plan} (${percentage}%)`
                      }
                    >
                      {planDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>

                <div className="space-y-4">
                  {planDistribution.map((plan, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: plan.color }}
                        />
                        <span className="font-medium">{plan.plan}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {plan.subscribers} users
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatCurrency(plan.revenue)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Revenue Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                  <Legend />
                  <Bar dataKey="revenue" fill="#8884d8" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Subscription Growth</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="subscriptions"
                    stroke="#8884d8"
                    strokeWidth={2}
                    name="Active Subscriptions"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="churn" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Churn Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={churnAnalysis}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="churned" fill="#ff8042" name="Churned" />
                  <Bar dataKey="retained" fill="#00c49f" name="Retained" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

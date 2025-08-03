import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  Check,
  Star,
  Users,
  Building2,
  MessageCircle,
  Play,
  ArrowRight,
  Zap,
  Shield,
  Heart,
  Briefcase,
  FileText,
  BarChart3,
  Clock,
  Target,
  Brain,
  Video,
  CheckSquare,
  Send,
  Calendar,
  Bell,
  Globe,
  TrendingUp,
  Handshake,
  ShoppingCart,
  Plus,
  Minus,
} from "lucide-react";

export default function Pricing() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated } = useAuth();
  const { addItem, openCart } = useCart();

  // Pricing state
  const [isAnnual, setIsAnnual] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState(1);

  const basePrice = 9.95; // per user per month
  const calculatePrice = (users: number, annual: boolean) => {
    const monthlyTotal = basePrice * users;
    if (annual) {
      return monthlyTotal * 12 * 0.8; // 20% discount for annual
    }
    return monthlyTotal;
  };

  const handleAddToCart = () => {
    addItem({
      id: `premium-${selectedUsers}-${isAnnual ? 'annual' : 'monthly'}`,
      name: 'Premium Plan',
      price: calculatePrice(selectedUsers, isAnnual),
      billingCycle: isAnnual ? 'annual' : 'monthly',
      users: selectedUsers,
    });
    openCart();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
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
        
        <div className="pt-16">
          <div className="max-w-6xl mx-auto px-4 py-16">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <h1 className="text-5xl font-bold mb-6">
                Simple, Transparent Pricing
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                All-in-one HR platform with employment-focused social media, referral network, ATS, Recruitment CRM, crowdsourcing, and recruitment marketing — build a true talent pipeline with our flexible pricing plans.
              </p>
              <div className="flex items-center justify-center gap-4 mb-8">
                <Badge variant="outline" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  No hidden fees
                </Badge>
                <Badge variant="outline" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Cancel anytime
                </Badge>
              </div>
            </div>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <Label htmlFor="billing-toggle" className={!isAnnual ? "font-semibold" : ""}>
                Monthly
              </Label>
              <Switch
                id="billing-toggle"
                checked={isAnnual}
                onCheckedChange={setIsAnnual}
              />
              <Label htmlFor="billing-toggle" className={isAnnual ? "font-semibold" : ""}>
                Annual
                <Badge variant="secondary" className="ml-2">Save 20%</Badge>
              </Label>
            </div>

            {/* Pricing Cards */}
            <div className="grid md:grid-cols-2 gap-8 mb-16 max-w-4xl mx-auto">
              
              {/* Free Plan */}
              <Card className="relative border-2 border-border hover:border-primary/20 transition-colors">
                <CardHeader className="text-center pb-8">
                  <CardTitle className="text-2xl">Free</CardTitle>
                  <div className="mt-4">
                    <span className="text-5xl font-bold">$0.00</span>
                  </div>
                  <CardDescription className="text-lg mt-4">
                    Essential HR platform features including ATS, social recruiting, and CRM — perfect for growing teams.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-lg">What's included:</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                        <span className="text-sm">Applicant Tracking System (ATS)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                        <span className="text-sm">Unlimited Jobs Postings</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                        <span className="text-sm">Recruiting & Sales CRM</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                        <span className="text-sm">Up to 2 Employees</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                        <span className="text-sm">AI Assistance (10 requests/month)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                        <span className="text-sm">1 Admin User</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                        <span className="text-sm">Login / Sign-Up</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-4">
                    {!isAuthenticated ? (
                      <Link to="/signup" className="block">
                        <Button className="w-full" variant="outline" size="lg">
                          Get Started
                        </Button>
                      </Link>
                    ) : (
                      <Button className="w-full" variant="outline" size="lg">
                        Current Plan
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Premium Plan */}
              <Card className="relative border-2 border-primary shadow-lg">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-brand-purple to-brand-blue text-white px-4 py-1">
                    Most Popular
                  </Badge>
                </div>
                <CardHeader className="text-center pb-8">
                  <CardTitle className="text-2xl">Premium</CardTitle>

                  {/* User Selection */}
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center justify-center gap-4">
                      <Label htmlFor="user-select">Number of users:</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setSelectedUsers(Math.max(1, selectedUsers - 1))}
                          disabled={selectedUsers <= 1}
                          className="h-8 w-8"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Select
                          value={selectedUsers.toString()}
                          onValueChange={(value) => setSelectedUsers(parseInt(value))}
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                              <SelectItem key={num} value={num.toString()}>
                                {num}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setSelectedUsers(Math.min(20, selectedUsers + 1))}
                          disabled={selectedUsers >= 20}
                          className="h-8 w-8"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="text-center">
                      <span className="text-5xl font-bold">
                        ${isAnnual
                          ? (calculatePrice(selectedUsers, true) / 12).toFixed(2)
                          : calculatePrice(selectedUsers, false).toFixed(2)
                        }
                      </span>
                      <span className="text-lg text-muted-foreground ml-2">
                        / {isAnnual ? 'month (billed annually)' : 'month'}
                      </span>
                      {isAnnual && (
                        <div className="text-sm text-green-600 mt-2">
                          Save ${(calculatePrice(selectedUsers, false) * 12 - calculatePrice(selectedUsers, true)).toFixed(2)} per year!
                        </div>
                      )}
                    </div>
                  </div>

                  <CardDescription className="text-lg mt-4">
                    All FREE features plus advanced tools for growing teams
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-lg">All FREE features plus:</h4>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        <div>
                          <span className="text-sm font-medium">Employee Community</span>
                          <p className="text-xs text-muted-foreground">(Engage, Inform, Inspire)</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        <span className="text-sm">Post & Bid on Exclusive Job Postings</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        <span className="text-sm">Unlimited Applicants & Contacts</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        <div>
                          <span className="text-sm font-medium">Hiring & Onboarding</span>
                          <p className="text-xs text-muted-foreground">(Offers)</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        <span className="text-sm">Performance Management</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Zap className="h-3 w-3 text-primary" />
                        </div>
                        <div>
                          <span className="text-sm font-medium">Unlimited AI Assistance</span>
                          <p className="text-xs text-muted-foreground">AI-powered resume optimization & job matching</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-4">
                    {!isAuthenticated ? (
                      <Link to="/signup" className="block">
                        <Button className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90" size="lg">
                          Get Started
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                        size="lg"
                        onClick={handleAddToCart}
                      >
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Add to Cart - ${isAnnual
                          ? (calculatePrice(selectedUsers, true) / 12).toFixed(2)
                          : calculatePrice(selectedUsers, false).toFixed(2)
                        }/month
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Feature Comparison */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">Compare Features</h2>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-4 font-semibold">Features</th>
                        <th className="text-center p-4 font-semibold">Free</th>
                        <th className="text-center p-4 font-semibold">Premium</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {/* Core Platform Features */}
                      <tr className="bg-muted/20">
                        <td className="p-4 font-semibold text-sm uppercase tracking-wide" colSpan={3}>
                          Core Platform
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          Applicant Tracking System (ATS)
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          Job Postings
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Unlimited</td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Unlimited + Exclusive</td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Team Size
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Up to 5</td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Unlimited</td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Admin Users
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">1</td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Unlimited</td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Applicants & Contacts
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Limited</td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Unlimited</td>
                      </tr>

                      {/* Video Resume Features */}
                      <tr className="bg-muted/20">
                        <td className="p-4 font-semibold text-sm uppercase tracking-wide" colSpan={3}>
                          Video Resume Features
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Video className="h-4 w-4 text-muted-foreground" />
                          AI Video Script Generation
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Video className="h-4 w-4 text-muted-foreground" />
                          Video Resume Creation
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Basic</td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Advanced + Templates</td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          Video Analytics & Performance
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          Resume Optimization
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Basic</td>
                        <td className="text-center p-4 text-sm text-muted-foreground">AI-Powered</td>
                      </tr>

                      {/* AI-Powered Tools */}
                      <tr className="bg-muted/20">
                        <td className="p-4 font-semibold text-sm uppercase tracking-wide" colSpan={3}>
                          AI-Powered Tools
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Brain className="h-4 w-4 text-muted-foreground" />
                          Generative AI
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          Smart Job Matching
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Basic</td>
                        <td className="text-center p-4 text-sm text-muted-foreground">AI-Enhanced</td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-muted-foreground" />
                          Interview Simulator
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          Resume Scoring & Feedback
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          Salary Calculator
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>

                      {/* Recruitment & CRM */}
                      <tr className="bg-muted/20">
                        <td className="p-4 font-semibold text-sm uppercase tracking-wide" colSpan={3}>
                          Recruitment & CRM
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Recruiting & Sales CRM
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Handshake className="h-4 w-4 text-muted-foreground" />
                          Hiring & Onboarding
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          Interview Scheduling
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Basic</td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Advanced + Automation</td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          Performance Management
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>

                      {/* Communication & Outreach */}
                      <tr className="bg-muted/20">
                        <td className="p-4 font-semibold text-sm uppercase tracking-wide" colSpan={3}>
                          Communication & Outreach
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Send className="h-4 w-4 text-muted-foreground" />
                          Smart Outreach Campaigns
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-muted-foreground" />
                          AI Message Personalization
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          Automated Follow-ups
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Employee Community
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>

                      {/* Analytics & Reporting */}
                      <tr className="bg-muted/20">
                        <td className="p-4 font-semibold text-sm uppercase tracking-wide" colSpan={3}>
                          Analytics & Reporting
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          Dashboard Analytics
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Basic</td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Advanced + Insights</td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          Career Progress Tracking
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          Hiring Success Metrics
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          Time-to-hire Analytics
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>

                      {/* Productivity Features */}
                      <tr className="bg-muted/20">
                        <td className="p-4 font-semibold text-sm uppercase tracking-wide" colSpan={3}>
                          Productivity & Organization
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <CheckSquare className="h-4 w-4 text-muted-foreground" />
                          Task Management
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Basic</td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Advanced + Automation</td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          Calendar Integration
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Bell className="h-4 w-4 text-muted-foreground" />
                          Smart Notifications
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Basic</td>
                        <td className="text-center p-4 text-sm text-muted-foreground">AI-Powered + Prioritized</td>
                      </tr>

                      {/* Support & Security */}
                      <tr className="bg-muted/20">
                        <td className="p-4 font-semibold text-sm uppercase tracking-wide" colSpan={3}>
                          Support & Security
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          Data Security & Privacy
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-muted-foreground" />
                          Customer Support
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Email</td>
                        <td className="text-center p-4 text-sm text-muted-foreground">Priority + Live Chat</td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          API Access
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* FAQ & Support Section */}
            <div className="grid md:grid-cols-3 gap-8 mb-16">
              <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold text-lg mb-2">Need more information?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Our team is here to help you choose the right plan
                </p>
                <Button variant="outline">
                  Talk to us
                </Button>
              </Card>

              <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                <Play className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold text-lg mb-2">Not sure yet?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  See MyVideoResume in action with a personalized demo
                </p>
                <Button variant="outline">
                  Request a demo
                </Button>
              </Card>

              <Card className="text-center p-6 hover:shadow-lg transition-shadow border-green-200">
                <Heart className="h-12 w-12 mx-auto mb-4 text-green-600" />
                <h3 className="font-semibold text-lg mb-2">Start-up or non-profit?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  We offer special pricing for qualifying organizations
                </p>
                <Button variant="outline" className="border-green-200 text-green-700 hover:bg-green-50">
                  Contact us for reduced pricing
                </Button>
              </Card>
            </div>

            {/* Trust Signals */}
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">Trusted by thousands of companies</h3>
              <p className="text-muted-foreground mb-6">
                Join the growing community of businesses revolutionizing their talent management with our comprehensive HR platform
              </p>
              <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Enterprise Security
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  99.9% Uptime
                </div>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  4.9/5 Rating
                </div>
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}

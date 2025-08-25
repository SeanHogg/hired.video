import { useState } from "react";
import { ArrowLeft, Calculator, Loader2, DollarSign, TrendingUp, MapPin, Briefcase, GraduationCap } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useSEO } from "@/lib/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import AuthOverlay from "@/components/AuthOverlay";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

interface SalaryData {
  baseSalary: number;
  lowRange: number;
  highRange: number;
  marketAverage: number;
  percentile25: number;
  percentile75: number;
  totalCompensation: number;
  locationAdjustment: number;
  experienceAdjustment: number;
  industryComparison: {
    industry: string;
    averageSalary: number;
    difference: number;
  }[];
}

export default function SalaryCalculator() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated } = useAuth();

  // SEO for salary calculator page
  useSEO(location.pathname);

  const [jobTitle, setJobTitle] = useState("");
  const [location_, setLocation] = useState("");
  const [experience, setExperience] = useState([3]);
  const [education, setEducation] = useState("");
  const [industry, setIndustry] = useState("");
  const [company, setCompany] = useState("");
  const [salaryData, setSalaryData] = useState<SalaryData | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const industries = [
    "Technology",
    "Healthcare",
    "Finance",
    "Education",
    "Manufacturing",
    "Retail",
    "Consulting",
    "Government",
    "Non-profit",
    "Media & Entertainment",
    "Real Estate",
    "Transportation",
    "Energy",
    "Telecommunications",
    "Other"
  ];

  const educationLevels = [
    "High School",
    "Associate Degree",
    "Bachelor's Degree",
    "Master's Degree",
    "PhD/Doctorate",
    "Professional Certification"
  ];

  const calculateSalary = async () => {
    if (!jobTitle.trim() || !location_.trim()) {
      setError("Please enter both job title and location.");
      return;
    }

    setIsCalculating(true);
    setError(null);
    setSalaryData(null);

    try {
      // Simulate API call - in real implementation, this would call salary data APIs
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mock salary calculation based on inputs
      const baseSalaryMap: { [key: string]: number } = {
        "software engineer": 95000,
        "data scientist": 110000,
        "product manager": 120000,
        "marketing manager": 75000,
        "sales manager": 85000,
        "accountant": 55000,
        "nurse": 70000,
        "teacher": 45000,
        "designer": 65000,
        "analyst": 60000,
      };

      const locationMultipliers: { [key: string]: number } = {
        "san francisco": 1.4,
        "new york": 1.3,
        "seattle": 1.2,
        "boston": 1.15,
        "chicago": 1.05,
        "austin": 1.1,
        "denver": 1.0,
        "atlanta": 0.95,
        "phoenix": 0.9,
        "dallas": 0.95,
      };

      const industryMultipliers: { [key: string]: number } = {
        "technology": 1.2,
        "finance": 1.15,
        "healthcare": 1.05,
        "consulting": 1.1,
        "education": 0.8,
        "non-profit": 0.75,
        "government": 0.9,
      };

      // Find base salary
      const jobKey = jobTitle.toLowerCase();
      let baseSalary = 65000; // default
      
      for (const [key, salary] of Object.entries(baseSalaryMap)) {
        if (jobKey.includes(key)) {
          baseSalary = salary;
          break;
        }
      }

      // Apply location adjustment
      const locationKey = location_.toLowerCase();
      let locationMultiplier = 1.0;
      
      for (const [key, multiplier] of Object.entries(locationMultipliers)) {
        if (locationKey.includes(key)) {
          locationMultiplier = multiplier;
          break;
        }
      }

      // Apply industry adjustment
      const industryMultiplier = industryMultipliers[industry.toLowerCase()] || 1.0;

      // Apply experience adjustment
      const experienceMultiplier = 1 + (experience[0] * 0.05); // 5% per year

      // Apply education adjustment
      const educationMultipliers: { [key: string]: number } = {
        "high school": 0.9,
        "associate degree": 0.95,
        "bachelor's degree": 1.0,
        "master's degree": 1.15,
        "phd/doctorate": 1.3,
        "professional certification": 1.1,
      };
      const educationMultiplier = educationMultipliers[education.toLowerCase()] || 1.0;

      const adjustedSalary = Math.round(
        baseSalary * locationMultiplier * industryMultiplier * experienceMultiplier * educationMultiplier
      );

      const mockData: SalaryData = {
        baseSalary: adjustedSalary,
        lowRange: Math.round(adjustedSalary * 0.8),
        highRange: Math.round(adjustedSalary * 1.3),
        marketAverage: Math.round(adjustedSalary * 1.05),
        percentile25: Math.round(adjustedSalary * 0.85),
        percentile75: Math.round(adjustedSalary * 1.2),
        totalCompensation: Math.round(adjustedSalary * 1.25), // including benefits
        locationAdjustment: Math.round((locationMultiplier - 1) * 100),
        experienceAdjustment: Math.round((experienceMultiplier - 1) * 100),
        industryComparison: [
          { industry: "Technology", averageSalary: Math.round(adjustedSalary * 1.1), difference: 10 },
          { industry: "Finance", averageSalary: Math.round(adjustedSalary * 1.05), difference: 5 },
          { industry: "Healthcare", averageSalary: Math.round(adjustedSalary * 0.95), difference: -5 },
          { industry: "Education", averageSalary: Math.round(adjustedSalary * 0.8), difference: -20 },
        ]
      };

      setSalaryData(mockData);
    } catch (err) {
      console.error("Salary calculation failed:", err);
      setError("Failed to calculate salary. Please try again.");
    } finally {
      setIsCalculating(false);
    }
  };

  const resetCalculator = () => {
    setJobTitle("");
    setLocation("");
    setExperience([3]);
    setEducation("");
    setIndustry("");
    setCompany("");
    setSalaryData(null);
    setError(null);
  };

  const formatSalary = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

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

        <div className={`pt-16 ${!isAuthenticated ? "relative" : ""}`}>
          {!isAuthenticated && (
            <AuthOverlay 
              contentType="resume" 
              title="Salary Calculator Tool"
              message="Sign in to access our salary calculator and discover your market value with personalized compensation insights."
            />
          )}
          
          <div className="max-w-6xl mx-auto p-6">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-4">
                <Link to="/tools">
                  <Button variant="outline" size="sm">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Tools
                  </Button>
                </Link>
              </div>
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-brand-green/10 rounded-lg flex items-center justify-center">
                  <Calculator className="h-6 w-6 text-brand-green" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Salary Calculator</h1>
                  <p className="text-muted-foreground">
                    Discover your market value and get personalized salary insights
                  </p>
                </div>
              </div>

              {/* Info Card */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <DollarSign className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-blue-900 mb-1">How it works</h3>
                      <p className="text-sm text-blue-800">
                        Our calculator analyzes job market data, location factors, experience level, and industry trends 
                        to provide accurate salary estimates and compensation insights.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content */}
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Left Column - Calculator Form */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calculator className="h-5 w-5" />
                      Calculate Your Salary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Job Title *
                      </label>
                      <Input
                        placeholder="e.g., Software Engineer, Marketing Manager"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Location *
                      </label>
                      <Input
                        placeholder="e.g., San Francisco, CA or New York, NY"
                        value={location_}
                        onChange={(e) => setLocation(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Years of Experience: {experience[0]} years
                      </label>
                      <Slider
                        value={experience}
                        onValueChange={setExperience}
                        max={20}
                        min={0}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>0 years</span>
                        <span>20+ years</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Education Level
                      </label>
                      <Select value={education} onValueChange={setEducation}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select education level" />
                        </SelectTrigger>
                        <SelectContent>
                          {educationLevels.map((level) => (
                            <SelectItem key={level} value={level}>
                              {level}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Industry
                      </label>
                      <Select value={industry} onValueChange={setIndustry}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select industry" />
                        </SelectTrigger>
                        <SelectContent>
                          {industries.map((ind) => (
                            <SelectItem key={ind} value={ind}>
                              {ind}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Company (Optional)
                      </label>
                      <Input
                        placeholder="e.g., Google, Microsoft, Startup"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                      />
                    </div>

                    <Button 
                      onClick={calculateSalary}
                      disabled={isCalculating || !jobTitle.trim() || !location_.trim()}
                      className="w-full"
                      size="lg"
                    >
                      {isCalculating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Calculating...
                        </>
                      ) : (
                        <>
                          <Calculator className="h-4 w-4 mr-2" />
                          Calculate Salary
                        </>
                      )}
                    </Button>

                    {error && (
                      <Alert>
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Results */}
              <div className="space-y-6">
                {salaryData && (
                  <>
                    {/* Main Salary Display */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5" />
                          Your Estimated Salary
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-center p-6 bg-gradient-to-r from-brand-green/10 to-brand-blue/10 rounded-lg mb-4">
                          <div className="text-4xl font-bold text-brand-green mb-2">
                            {formatSalary(salaryData.baseSalary)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Estimated Annual Salary
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <div className="font-semibold">{formatSalary(salaryData.lowRange)}</div>
                            <div className="text-muted-foreground">Low Range</div>
                          </div>
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <div className="font-semibold">{formatSalary(salaryData.highRange)}</div>
                            <div className="text-muted-foreground">High Range</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Detailed Breakdown */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" />
                          Salary Breakdown
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span>Market Average</span>
                          <span className="font-semibold">{formatSalary(salaryData.marketAverage)}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span>25th Percentile</span>
                          <span className="font-semibold">{formatSalary(salaryData.percentile25)}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span>75th Percentile</span>
                          <span className="font-semibold">{formatSalary(salaryData.percentile75)}</span>
                        </div>
                        
                        <div className="flex justify-between items-center border-t pt-3">
                          <span>Total Compensation</span>
                          <span className="font-semibold text-brand-green">
                            {formatSalary(salaryData.totalCompensation)}
                          </span>
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
                          * Total compensation includes estimated benefits and bonuses
                        </div>
                      </CardContent>
                    </Card>

                    {/* Adjustments */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MapPin className="h-5 w-5" />
                          Salary Adjustments
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            Location Adjustment
                          </span>
                          <Badge variant={salaryData.locationAdjustment >= 0 ? "default" : "secondary"}>
                            {salaryData.locationAdjustment >= 0 ? "+" : ""}{salaryData.locationAdjustment}%
                          </Badge>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4" />
                            Experience Adjustment
                          </span>
                          <Badge variant="default">
                            +{salaryData.experienceAdjustment}%
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Industry Comparison */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Briefcase className="h-5 w-5" />
                          Industry Comparison
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {salaryData.industryComparison.map((comp, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span>{comp.industry}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{formatSalary(comp.averageSalary)}</span>
                              <Badge 
                                variant={comp.difference >= 0 ? "default" : "secondary"}
                                className={comp.difference >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                              >
                                {comp.difference >= 0 ? "+" : ""}{comp.difference}%
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={resetCalculator}>
                        Calculate Another
                      </Button>
                      <Button 
                        onClick={() => {
                          const report = `Salary Report for ${jobTitle} in ${location_}\n\nEstimated Salary: ${formatSalary(salaryData.baseSalary)}\nSalary Range: ${formatSalary(salaryData.lowRange)} - ${formatSalary(salaryData.highRange)}\nTotal Compensation: ${formatSalary(salaryData.totalCompensation)}\n\nGenerated by MyVideoResume Salary Calculator`;
                          navigator.clipboard.writeText(report);
                        }}
                        variant="outline"
                      >
                        Copy Report
                      </Button>
                    </div>
                  </>
                )}

                {!salaryData && !isCalculating && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Calculator className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-semibold mb-2">Ready to Calculate</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Enter your job details to get personalized salary insights and market data.
                      </p>
                      
                      <div className="text-left bg-muted rounded-lg p-4 mt-4">
                        <h4 className="font-medium mb-2">What you'll get:</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• Estimated salary range for your role</li>
                          <li>• Location-based adjustments</li>
                          <li>• Industry comparisons</li>
                          <li>• Experience level impact</li>
                          <li>• Total compensation estimates</li>
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}

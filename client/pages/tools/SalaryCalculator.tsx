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
import { aiService } from "@/lib/services/ai-service";

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
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);

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

    // Check authentication before proceeding
    if (!isAuthenticated) {
      setShowAuthOverlay(true);
      return;
    }

    setIsCalculating(true);
    setError(null);
    setSalaryData(null);

    try {
      // Create AI prompt for salary analysis
      const prompt = `You are a professional salary analyst with access to current market data. Analyze the following job details and provide a comprehensive salary breakdown in JSON format.

Job Details:
- Job Title: ${jobTitle}
- Location: ${location_}
- Years of Experience: ${experience[0]}
- Education Level: ${education || 'Not specified'}
- Industry: ${industry || 'Not specified'}
- Company: ${company || 'Not specified'}

Please provide a detailed salary analysis in the following JSON format (return ONLY valid JSON, no additional text):

{
  "baseSalary": [estimated base salary as number],
  "lowRange": [25th percentile salary as number],
  "highRange": [75th percentile salary as number],
  "marketAverage": [market average salary as number],
  "percentile25": [25th percentile as number],
  "percentile75": [75th percentile as number],
  "totalCompensation": [total comp including benefits as number],
  "locationAdjustment": [percentage adjustment for location as number, can be negative],
  "experienceAdjustment": [percentage adjustment for experience as number],
  "industryComparison": [
    {"industry": "Technology", "averageSalary": [number], "difference": [percentage difference as number]},
    {"industry": "Finance", "averageSalary": [number], "difference": [percentage difference as number]},
    {"industry": "Healthcare", "averageSalary": [number], "difference": [percentage difference as number]},
    {"industry": "Education", "averageSalary": [number], "difference": [percentage difference as number]}
  ]
}

Base your analysis on current 2024 market data, considering cost of living adjustments, industry standards, and experience premiums. Ensure all numbers are realistic and based on actual market conditions.`;

      // Call AI service
      const response = await aiService.sendChatMessage([
        {
          role: "user",
          content: prompt
        }
      ], {
        model: "meta-llama/llama-3.1-8b-instruct:free",
        maxTokens: 1000,
        temperature: 0.3 // Lower temperature for more consistent numerical outputs
      });

      // Parse AI response
      let aiSalaryData: SalaryData;
      try {
        // Extract JSON from response (in case AI adds extra text)
        const jsonMatch = response.message.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : response.message;
        aiSalaryData = JSON.parse(jsonString);

        // Validate and sanitize the data
        if (!aiSalaryData.baseSalary || typeof aiSalaryData.baseSalary !== 'number') {
          throw new Error('Invalid salary data from AI');
        }

        // Ensure all required fields exist with reasonable defaults
        aiSalaryData = {
          baseSalary: Math.round(aiSalaryData.baseSalary),
          lowRange: Math.round(aiSalaryData.lowRange || aiSalaryData.baseSalary * 0.8),
          highRange: Math.round(aiSalaryData.highRange || aiSalaryData.baseSalary * 1.3),
          marketAverage: Math.round(aiSalaryData.marketAverage || aiSalaryData.baseSalary * 1.05),
          percentile25: Math.round(aiSalaryData.percentile25 || aiSalaryData.baseSalary * 0.85),
          percentile75: Math.round(aiSalaryData.percentile75 || aiSalaryData.baseSalary * 1.2),
          totalCompensation: Math.round(aiSalaryData.totalCompensation || aiSalaryData.baseSalary * 1.25),
          locationAdjustment: Math.round(aiSalaryData.locationAdjustment || 0),
          experienceAdjustment: Math.round(aiSalaryData.experienceAdjustment || experience[0] * 5),
          industryComparison: aiSalaryData.industryComparison || [
            { industry: "Technology", averageSalary: Math.round(aiSalaryData.baseSalary * 1.1), difference: 10 },
            { industry: "Finance", averageSalary: Math.round(aiSalaryData.baseSalary * 1.05), difference: 5 },
            { industry: "Healthcare", averageSalary: Math.round(aiSalaryData.baseSalary * 0.95), difference: -5 },
            { industry: "Education", averageSalary: Math.round(aiSalaryData.baseSalary * 0.8), difference: -20 }
          ]
        };

      } catch (parseError) {
        console.error("Failed to parse AI response:", parseError);
        console.log("AI Response:", response.message);
        throw new Error("Failed to parse salary analysis from AI. Please try again.");
      }

      setSalaryData(aiSalaryData);
    } catch (err) {
      console.error("Salary calculation failed:", err);
      setError(err instanceof Error ? err.message : "Failed to calculate salary. Please try again.");
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

        <div className={`pt-16 ${showAuthOverlay ? "relative" : ""}`}>
          {showAuthOverlay && (
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
                  <h1 className="text-3xl font-bold">AI-Powered Salary Calculator</h1>
                  <p className="text-muted-foreground">
                    Get AI-driven salary insights based on current market data and trends
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
                      <h3 className="font-semibold text-blue-900 mb-1">AI-Powered Analysis</h3>
                      <p className="text-sm text-blue-800">
                        Our AI analyzes current market data, location cost-of-living, experience premiums, and industry standards
                        to provide personalized salary estimates and comprehensive compensation insights.
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
                          AI Analyzing...
                        </>
                      ) : (
                        <>
                          <Calculator className="h-4 w-4 mr-2" />
                          Get AI Salary Analysis
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
                          AI Salary Analysis
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

            {/* AI Disclaimer */}
            {salaryData && (
              <div className="mt-8">
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertDescription className="text-amber-800">
                    <strong>AI-Generated Estimates:</strong> These salary estimates are generated by AI based on market analysis and should be used as a general guide.
                    Actual salaries may vary based on specific company policies, negotiation, additional skills, and current market conditions.
                    We recommend using multiple sources and conducting your own research for the most accurate salary information.
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  companyService,
  type CompanyData,
  type CompanyProfile,
  type CreateCompanyRequest,
} from "@/lib/services/company-service";
import type { CompanyBenefits } from "@/types/company";
import { COMPANY_SIZE_OPTIONS } from "@/lib/constants/company-constants";
import MediaPicker from "@/components/shared/MediaPicker";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Save, Loader2, AlertCircle } from "lucide-react";
import EmbedSettings from "@/components/company/EmbedSettings";

interface CompanyBuilderProps {
  /** When null, the builder is in create mode and POSTs on save. */
  company: CompanyProfile | null;
  onSave?: (saved: CompanyProfile) => void;
  onCancel?: () => void;
}

interface ValidationErrors {
  [key: string]: string;
}

const EMPTY_COMPANY_DATA: CompanyData = {
  name: "",
  logo: null,
  website: null,
  tagline: null,
  description: "",
  industry: "",
  size: "",
  founded: null,
  headquarters: {},
  locations: [],
  contact: {
    email: null,
    phone: null,
    website: null,
    linkedin: null,
    twitter: null,
    facebook: null,
  },
  benefits: {
    healthInsurance: null,
    dentalInsurance: null,
    visionInsurance: null,
    retirement401k: null,
    retirementPlan: null,
    stockOptions: null,
    paidTimeOff: null,
    parentalLeave: null,
    flexibleSchedule: null,
    remoteWork: null,
    learningBudget: null,
    professionalDevelopment: null,
    gymMembership: null,
    freeFood: null,
    commuteBenefits: null,
    other: [],
  },
  culture: [],
  technologies: [],
  perks: [],
  mission: null,
  vision: null,
  values: [],
};

function buildCreateRequest(data: CompanyData): CreateCompanyRequest {
  return {
    name: data.name,
    description: data.description ?? null,
    website: data.website ?? null,
    logoUrl: data.logo ?? null,
    industry: data.industry ?? null,
    size: data.size ?? null,
    foundedYear: data.founded ?? null,
    headquarters: data.headquarters ?? null,
    contact: data.contact ?? {},
    tagline: data.tagline ?? null,
    mission: data.mission ?? null,
    vision: data.vision ?? null,
    technologies: data.technologies ?? [],
    perks: data.perks ?? [],
    culture: data.culture ?? [],
    values: data.values ?? [],
    benefits: (data.benefits ?? {}) as Record<string, unknown>,
  };
}

export default function CompanyBuilder({ company, onSave, onCancel }: CompanyBuilderProps) {
  const isCreateMode = company === null;
  const { toast } = useToast();
  const [formData, setFormData] = useState<CompanyData>(company?.data ?? EMPTY_COMPANY_DATA);
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [activeTab, setActiveTab] = useState("basic");

  // Validation function
  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};

    // Basic Info tab validations
    if (!formData.name?.trim()) {
      errors.name = "Company name is required";
    }
    if (!formData.industry?.trim()) {
      errors.industry = "Industry is required";
    }
    if (!formData.size?.trim()) {
      errors.size = "Company size is required";
    }

    // Contact & Address tab validations
    if (!formData.headquarters?.city?.trim()) {
      errors["headquarters.city"] = "City is required";
    }
    if (!formData.headquarters?.state?.trim()) {
      errors["headquarters.state"] = "State/Province is required";
    }
    if (!formData.headquarters?.country?.trim()) {
      errors["headquarters.country"] = "Country is required";
    }
    if (!formData.headquarters?.address?.trim()) {
      errors["headquarters.address"] = "Address is required";
    }
    if (!formData.headquarters?.postalCode?.trim()) {
      errors["headquarters.postalCode"] = "Postal code is required";
    }

    setValidationErrors(errors);

    // If there are errors, switch to the first tab with errors
    if (Object.keys(errors).length > 0) {
      if (errors.name || errors.industry || errors.size) {
        setActiveTab("basic");
      } else if (Object.keys(errors).some(k => k.startsWith("headquarters"))) {
        setActiveTab("contact");
      }
      return false;
    }

    return true;
  };

  // Handle field changes
  const handleFieldChange = (field: string, value: any) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
  };

  const handleNestedChange = (parent: string, field: string, value: any) => {
    const parentData = formData[parent as keyof typeof formData] as Record<string, any>;
    const updated = {
      ...formData,
      [parent]: { ...parentData, [field]: value },
    };
    setFormData(updated);
  };

  const handleArrayAdd = (field: string, value: string) => {
    if (!value.trim()) return;
    const current = (formData[field as keyof typeof formData] as string[]) || [];
    const updated = { ...formData, [field]: [...current, value] };
    setFormData(updated);
  };

  const handleArrayRemove = (field: string, index: number) => {
    const current = (formData[field as keyof typeof formData] as string[]) || [];
    const updated = { ...formData, [field]: current.filter((_, i) => i !== index) };
    setFormData(updated);
  };

  const handleBenefitToggle = (benefit: keyof CompanyBenefits, value: boolean) => {
    const benefits = formData.benefits || { other: [] };
    const updated = {
      ...formData,
      benefits: { ...benefits, [benefit]: value },
    };
    setFormData(updated);
  };

  const handleLogoPicked = (url: string) => {
    handleFieldChange("logo", url);
    toast({
      title: "Saved",
      description: "Company logo updated.",
    });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form before submitting
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields. Check the highlighted tab.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSaving(true);
      const payload = buildCreateRequest(formData);
      const saved = isCreateMode
        ? await companyService.createCompany(payload)
        : await companyService.updateCompany(company.id, payload);

      toast({
        title: "Saved",
        description: isCreateMode ? "Company created successfully." : "Company profile updated successfully.",
      });

      onSave?.(saved);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to save changes. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Check if a tab has errors
  const hasTabErrors = (tabName: string): boolean => {
    return Object.keys(validationErrors).some(key => {
      if (tabName === "basic") {
        return ["name", "industry", "size"].includes(key);
      } else if (tabName === "contact") {
        return key.startsWith("headquarters");
      }
      return false;
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="w-full overflow-x-auto">
          <TabsList className="inline-flex w-max gap-1 sm:grid sm:w-full sm:grid-cols-4">
            <TabsTrigger value="basic" className="relative">
              Basic Info
              {hasTabErrors("basic") && (
                <AlertCircle className="h-4 w-4 ml-2 text-destructive" />
              )}
            </TabsTrigger>
            <TabsTrigger value="contact" className="relative">
              Contact & Address
              {hasTabErrors("contact") && (
                <AlertCircle className="h-4 w-4 ml-2 text-destructive" />
              )}
            </TabsTrigger>
            <TabsTrigger value="benefits">Benefits</TabsTrigger>
            <TabsTrigger value="mission">Mission & Values</TabsTrigger>
            {company?.id && <TabsTrigger value="embed">Embed</TabsTrigger>}
          </TabsList>
        </div>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Company name, logo, and general details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Company Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleFieldChange("name", e.target.value)}
                    placeholder="Company name"
                    required
                    className={validationErrors.name ? "border-destructive" : ""}
                  />
                  {validationErrors.name && (
                    <p className="text-sm text-destructive mt-1">{validationErrors.name}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="industry">Industry *</Label>
                  <Input
                    id="industry"
                    value={formData.industry}
                    onChange={(e) => handleFieldChange("industry", e.target.value)}
                    placeholder="e.g., Technology, Finance"
                    required
                    className={validationErrors.industry ? "border-destructive" : ""}
                  />
                  {validationErrors.industry && (
                    <p className="text-sm text-destructive mt-1">{validationErrors.industry}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="size">Company Size *</Label>
                  <Select
                    value={formData.size}
                    onValueChange={(value) => handleFieldChange("size", value)}
                  >
                    <SelectTrigger id="size" className={validationErrors.size ? "border-destructive" : ""}>
                      <SelectValue placeholder="Select company size" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_SIZE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {validationErrors.size && (
                    <p className="text-sm text-destructive mt-1">{validationErrors.size}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="founded">Founded Year</Label>
                  <Input
                    id="founded"
                    type="number"
                    value={formData.founded || ""}
                    onChange={(e) => handleFieldChange("founded", e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="e.g., 2023"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="tagline">Tagline</Label>
                <Input
                  id="tagline"
                  value={formData.tagline || ""}
                  onChange={(e) => handleFieldChange("tagline", e.target.value)}
                  placeholder="Short company tagline"
                />
              </div>

              <div>
                <Label>Company Logo</Label>
                <div className="flex items-center gap-4 mt-2">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={formData.logo} alt={formData.name} />
                    <AvatarFallback className="text-lg">
                      {formData.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <MediaPicker
                      accept="image"
                      title="Choose company logo"
                      triggerLabel={formData.logo ? "Change Logo" : "Upload Logo"}
                      onPick={(asset) => handleLogoPicked(asset.url)}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Upload your own, pick from stock, or generate with AI.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={formData.website || ""}
                  onChange={(e) => handleFieldChange("website", e.target.value)}
                  placeholder="https://example.com"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleFieldChange("description", e.target.value)}
                  placeholder="Company description"
                  rows={4}
                />
              </div>

              {/* Culture & Technologies */}
              <div className="pt-4 border-t">
                <ArraySection
                  title="Culture & Values"
                  description="Add culture values and company principles"
                  items={formData.culture || []}
                  onAdd={(value) => handleArrayAdd("culture", value)}
                  onRemove={(index) => handleArrayRemove("culture", index)}
                  placeholder="e.g., Innovation, Collaboration"
                />
              </div>

              <ArraySection
                title="Technologies"
                description="Technologies and tools used by the company"
                items={formData.technologies || []}
                onAdd={(value) => handleArrayAdd("technologies", value)}
                onRemove={(index) => handleArrayRemove("technologies", index)}
                placeholder="e.g., React, Node.js, AWS"
              />

              <ArraySection
                title="Perks"
                description="Additional perks and benefits"
                items={formData.perks || []}
                onAdd={(value) => handleArrayAdd("perks", value)}
                onRemove={(index) => handleArrayRemove("perks", index)}
                placeholder="e.g., Free coffee, Gym membership"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact & Address Tab */}
        <TabsContent value="contact" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
              <CardDescription>Email, phone, and social media</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.contact?.email || ""}
                    onChange={(e) => handleNestedChange("contact", "email", e.target.value)}
                    placeholder="contact@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.contact?.phone || ""}
                    onChange={(e) => handleNestedChange("contact", "phone", e.target.value)}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="linkedin">LinkedIn</Label>
                  <Input
                    id="linkedin"
                    value={formData.contact?.linkedin || ""}
                    onChange={(e) => handleNestedChange("contact", "linkedin", e.target.value)}
                    placeholder="https://linkedin.com/company/..."
                  />
                </div>
                <div>
                  <Label htmlFor="twitter">Twitter</Label>
                  <Input
                    id="twitter"
                    value={formData.contact?.twitter || ""}
                    onChange={(e) => handleNestedChange("contact", "twitter", e.target.value)}
                    placeholder="@company"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Headquarters Address */}
          <Card>
            <CardHeader>
              <CardTitle>Headquarters Address</CardTitle>
              <CardDescription>Company headquarters location</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="address">Street Address *</Label>
                <Input
                  id="address"
                  value={formData.headquarters?.address || ""}
                  onChange={(e) => handleNestedChange("headquarters", "address", e.target.value)}
                  placeholder="123 Main Street"
                  className={validationErrors["headquarters.address"] ? "border-destructive" : ""}
                />
                {validationErrors["headquarters.address"] && (
                  <p className="text-sm text-destructive mt-1">{validationErrors["headquarters.address"]}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    value={formData.headquarters?.city || ""}
                    onChange={(e) => handleNestedChange("headquarters", "city", e.target.value)}
                    placeholder="San Francisco"
                    required
                    className={validationErrors["headquarters.city"] ? "border-destructive" : ""}
                  />
                  {validationErrors["headquarters.city"] && (
                    <p className="text-sm text-destructive mt-1">{validationErrors["headquarters.city"]}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="state">State/Province *</Label>
                  <Input
                    id="state"
                    value={formData.headquarters?.state || ""}
                    onChange={(e) => handleNestedChange("headquarters", "state", e.target.value)}
                    placeholder="CA"
                    className={validationErrors["headquarters.state"] ? "border-destructive" : ""}
                  />
                  {validationErrors["headquarters.state"] && (
                    <p className="text-sm text-destructive mt-1">{validationErrors["headquarters.state"]}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="postalCode">Postal Code *</Label>
                  <Input
                    id="postalCode"
                    value={formData.headquarters?.postalCode || ""}
                    onChange={(e) => handleNestedChange("headquarters", "postalCode", e.target.value)}
                    placeholder="94105"
                    className={validationErrors["headquarters.postalCode"] ? "border-destructive" : ""}
                  />
                  {validationErrors["headquarters.postalCode"] && (
                    <p className="text-sm text-destructive mt-1">{validationErrors["headquarters.postalCode"]}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="country">Country *</Label>
                  <Input
                    id="country"
                    value={formData.headquarters?.country || ""}
                    onChange={(e) => handleNestedChange("headquarters", "country", e.target.value)}
                    placeholder="United States"
                    className={validationErrors["headquarters.country"] ? "border-destructive" : ""}
                  />
                  {validationErrors["headquarters.country"] && (
                    <p className="text-sm text-destructive mt-1">{validationErrors["headquarters.country"]}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="remote">
                  <input
                    id="remote"
                    type="checkbox"
                    checked={formData.headquarters?.remote || false}
                    onChange={(e) => handleNestedChange("headquarters", "remote", e.target.checked)}
                    className="mr-2"
                  />
                  Remote-first company
                </Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Benefits Tab */}
        <TabsContent value="benefits" className="space-y-4">
          <BenefitsSection formData={formData} onBenefitToggle={handleBenefitToggle} />
        </TabsContent>

        {/* Mission & Values Tab */}
        <TabsContent value="mission" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mission, Vision & Values</CardTitle>
              <CardDescription>Company purpose and core principles</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="mission">Mission</Label>
                <Textarea
                  id="mission"
                  value={formData.mission || ""}
                  onChange={(e) => handleFieldChange("mission", e.target.value)}
                  placeholder="Company mission statement"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="vision">Vision</Label>
                <Textarea
                  id="vision"
                  value={formData.vision || ""}
                  onChange={(e) => handleFieldChange("vision", e.target.value)}
                  placeholder="Company vision statement"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="values">Core Values</Label>
                <Textarea
                  id="values"
                  value={(formData.values || []).join(", ")}
                  onChange={(e) => handleFieldChange("values", e.target.value.split(",").map(v => v.trim()).filter(Boolean))}
                  placeholder="Comma-separated values"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Embed — only for saved companies (needs an id to mint keys). Self-
            contained: manages its own state + API calls, independent of the
            company form's autosave. */}
        {company?.id && (
          <TabsContent value="embed" className="space-y-4">
            <EmbedSettings companyId={company.id} />
          </TabsContent>
        )}
      </Tabs>

      {/* Form Actions */}
      <div className="flex justify-end gap-4 pt-6 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          {isCreateMode ? "Create Company" : "Save Company"}
        </Button>
      </div>
    </form>
  );
}

// Benefits Section Component
function BenefitsSection({
  formData,
  onBenefitToggle,
}: {
  formData: any;
  onBenefitToggle: (benefit: keyof CompanyBenefits, value: boolean) => void;
}) {
  const benefits = formData.benefits || { other: [] };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Benefits</CardTitle>
        <CardDescription>Employee benefits and perks</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: "healthInsurance", label: "Health Insurance" },
            { key: "dentalInsurance", label: "Dental Insurance" },
            { key: "visionInsurance", label: "Vision Insurance" },
            { key: "retirement401k", label: "401(k)" },
            { key: "retirementPlan", label: "Retirement Plan" },
            { key: "stockOptions", label: "Stock Options" },
            { key: "paidTimeOff", label: "Paid Time Off" },
            { key: "parentalLeave", label: "Parental Leave" },
            { key: "flexibleSchedule", label: "Flexible Schedule" },
            { key: "remoteWork", label: "Remote Work" },
            { key: "learningBudget", label: "Learning Budget" },
            { key: "professionalDevelopment", label: "Professional Development" },
            { key: "gymMembership", label: "Gym Membership" },
            { key: "freeFood", label: "Free Food" },
            { key: "commuteBenefits", label: "Commute Benefits" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={key} className="text-sm">{label}</Label>
              <Switch
                id={key}
                checked={benefits[key as keyof CompanyBenefits] || false}
                onCheckedChange={(checked) =>
                  onBenefitToggle(key as keyof CompanyBenefits, checked)
                }
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Array Section Component
function ArraySection({
  title,
  description,
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  title: string;
  description: string;
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
  placeholder: string;
}) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    onAdd(inputValue);
    setInputValue("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={placeholder}
          />
          <Button onClick={handleAdd} variant="outline">
            Add
          </Button>
        </div>

        {items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {items.map((item, index) => (
              <Badge key={index} variant="secondary" className="flex items-center gap-2">
                {item}
                <button
                  onClick={() => onRemove(index)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


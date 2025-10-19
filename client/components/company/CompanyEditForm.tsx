import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { companyService, type CompanyProfile, type UpdateCompanyRequest } from "@/lib/services/company-service";
import type { CompanyBenefits } from "@/types/company";
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
import { X, Save, Loader2 } from "lucide-react";

interface CompanyEditFormProps {
  company: CompanyProfile;
  onSave?: (updated: CompanyProfile) => void;
  onCancel?: () => void;
}

export default function CompanyEditForm({ company, onSave, onCancel }: CompanyEditFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState(company.data);
  const [isSaving, setIsSaving] = useState(false);

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

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsSaving(true);
      const updateRequest: UpdateCompanyRequest = { data: formData };
      const updated = await companyService.updateCompany(company.id, updateRequest);

      toast({
        title: "Saved",
        description: "Company profile updated successfully.",
      });

      if (onSave) {
        onSave(updated);
      }
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="contact">Contact & Address</TabsTrigger>
          <TabsTrigger value="benefits">Benefits</TabsTrigger>
          <TabsTrigger value="mission">Mission & Values</TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Company name, logo, and general details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Company Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleFieldChange("name", e.target.value)}
                    placeholder="Company name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="industry">Industry *</Label>
                  <Input
                    id="industry"
                    value={formData.industry}
                    onChange={(e) => handleFieldChange("industry", e.target.value)}
                    placeholder="e.g., Technology, Finance"
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="size">Company Size *</Label>
                  <Input
                    id="size"
                    value={formData.size}
                    onChange={(e) => handleFieldChange("size", e.target.value)}
                    placeholder="e.g., 11-50, 51-200"
                    required
                  />
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
                <Label htmlFor="logo">Logo URL</Label>
                <Input
                  id="logo"
                  value={formData.logo || ""}
                  onChange={(e) => handleFieldChange("logo", e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
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
              <div className="grid md:grid-cols-2 gap-4">
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

              <div className="grid md:grid-cols-2 gap-4">
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
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  value={formData.headquarters?.address || ""}
                  onChange={(e) => handleNestedChange("headquarters", "address", e.target.value)}
                  placeholder="123 Main Street"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    value={formData.headquarters?.city || ""}
                    onChange={(e) => handleNestedChange("headquarters", "city", e.target.value)}
                    placeholder="San Francisco"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="state">State/Province</Label>
                  <Input
                    id="state"
                    value={formData.headquarters?.state || ""}
                    onChange={(e) => handleNestedChange("headquarters", "state", e.target.value)}
                    placeholder="CA"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input
                    id="postalCode"
                    value={formData.headquarters?.postalCode || ""}
                    onChange={(e) => handleNestedChange("headquarters", "postalCode", e.target.value)}
                    placeholder="94105"
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={formData.headquarters?.country || ""}
                    onChange={(e) => handleNestedChange("headquarters", "country", e.target.value)}
                    placeholder="United States"
                  />
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
      </Tabs>

      {/* Form Actions */}
      <div className="flex justify-end gap-4 pt-6 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          Save Company
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
        <div className="grid md:grid-cols-2 gap-4">
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


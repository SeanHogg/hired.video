import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import {
  CheckCircle,
  Building2,
  Users,
  Mail,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { accountService } from "@/lib/services/account-service";
import {
  InvitationDetailsResponse,
  AcceptInvitationResponse,
} from "@/types/account";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { toast } from "@/hooks/use-toast";
import { intlLocale } from "@shared/i18n";

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { t, i18n } = useTranslation();

  const [invitationDetails, setInvitationDetails] =
    useState<InvitationDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invitationId = searchParams.get("id");

  useEffect(() => {
    if (!invitationId) {
      setError(t("errors.invalidInvitationLink"));
      setLoading(false);
      return;
    }

    loadInvitationDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitationId]);

  const loadInvitationDetails = async () => {
    if (!invitationId) return;

    try {
      setLoading(true);
      const details = await accountService.getInvitationDetails(invitationId);
      setInvitationDetails(details);
      setError(null);
    } catch (err) {
      console.error("Error loading invitation details:", err);
      setError(t("errors.invitationLoadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async () => {
    if (!invitationId) return;

    try {
      setAccepting(true);
      const result = await accountService.acceptInvitation(invitationId);

      if (result.success) {
        toast({
          title: t("headings.invitationAccepted"),
          description: t("messages.invitationAcceptedDesc", { company: result.companyName }),
        });

        if (result.redirectUrl) {
          navigate(result.redirectUrl);
        } else {
          navigate("/dashboard");
        }
      } else {
        if (result.requiredRegistration && result.redirectUrl) {
          navigate(result.redirectUrl);
        } else if (result.redirectUrl) {
          navigate(result.redirectUrl);
        } else {
          setError(result.message || t("errors.invitationAcceptFailed"));
        }
      }
    } catch (err) {
      console.error("Error accepting invitation:", err);
      setError(t("errors.invitationAcceptFailed"));
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = () => {
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center p-8">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-gray-600">{t("status.loadingInvitation")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invitationDetails) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-xl">{t("headings.invalidInvitation")}</CardTitle>
            <CardDescription>
              {error || t("messages.invalidInvitationAlert")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full">
              {t("actions.backToHome")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            {invitationDetails.companyLogoUrl ? (
              <img
                src={invitationDetails.companyLogoUrl}
                alt={`${invitationDetails.companyName} logo`}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <Building2 className="h-8 w-8 text-blue-600" />
            )}
          </div>
          <CardTitle className="text-2xl">{t("headings.youreInvited")}</CardTitle>
          <CardDescription>
            <Trans
              i18nKey="messages.invitationSubtitle"
              values={{ inviter: invitationDetails.inviterName, company: invitationDetails.companyName }}
              components={{ inviter: <span />, company: <strong /> }}
            />
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Company Information */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {invitationDetails.companyName}
            </h3>
            {invitationDetails.companyDescription && (
              <p className="text-gray-600 mb-3">
                {invitationDetails.companyDescription}
              </p>
            )}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Mail className="h-4 w-4" />
                {t("labels.invited")}: {invitationDetails.invitedEmail}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {t("labels.from")}: {invitationDetails.inviterName}
              </span>
            </div>
          </div>

          {/* Roles */}
          <div>
            <h4 className="font-medium mb-3">
              {t("messages.invitationRolesHeading")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {invitationDetails.rolesToAssign.map((role) => (
                <Badge key={role} variant="secondary">
                  {getRoleDisplayLabel(role)}
                </Badge>
              ))}
            </div>
          </div>

          {/* Personal Message */}
          {invitationDetails.personalMessage && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
              <p className="text-blue-800 italic">
                "{invitationDetails.personalMessage}"
              </p>
            </div>
          )}

          {/* Authentication Status */}
          {!isAuthenticated && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {invitationDetails.userExists
                  ? t("messages.invitationLogin")
                  : t("messages.invitationSignup")}
              </AlertDescription>
            </Alert>
          )}

          {isAuthenticated &&
            user?.email !== invitationDetails.invitedEmail && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t("messages.invitationWrongAccount", { invited: invitationDetails.invitedEmail, current: user?.email ?? "" })}
                </AlertDescription>
              </Alert>
            )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleAcceptInvitation}
              disabled={accepting}
              className="flex-1"
            >
              {accepting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t("status.acceptingInvitation")}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t("actions.acceptInvitation")}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleDecline}
              disabled={accepting}
              className="flex-1"
            >
              {t("actions.decline")}
            </Button>
          </div>

          <p className="text-xs text-gray-500 text-center">
            {t("messages.invitedOn", {
              date: new Date(invitationDetails.invitedAt).toLocaleDateString(intlLocale(i18n.language)),
            })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

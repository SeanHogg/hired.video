import React, { useState, useEffect } from "react";
import { Building2, ChevronDown, Check, Crown, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useApiReady } from "@/lib/auth";
import { accountService } from "@/lib/services/account-service";
import { AccountOption } from "@/types/account";
import { getRoleDisplayLabel } from "@/lib/role-utils";

interface AccountSwitcherProps {
  className?: string;
}

export function AccountSwitcher({ className }: AccountSwitcherProps) {
  const apiReady = useApiReady();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Endpoint requires auth + verified account. `useApiReady` handles
    // anonymous (Login/Signup/Pricing/marketing) AND verification-limbo
    // (post-signup pre-confirm) in one predicate.
    if (!apiReady) return;
    loadAvailableAccounts();
    // Get current account from localStorage
    const savedAccountId = localStorage.getItem("currentAccountId");
    setCurrentAccountId(savedAccountId);
  }, [apiReady]);

  const loadAvailableAccounts = async () => {
    try {
      const availableAccounts = await accountService.getAvailableAccounts();
      setAccounts(availableAccounts);
    } catch (error) {
      console.error("Failed to load available accounts:", error);
      // Don't show error toast for this as it's not critical
    }
  };

  const handleAccountSwitch = async (accountId: string) => {
    if (accountId === currentAccountId) return;

    setLoading(true);
    try {
      await accountService.switchAccount(accountId);
      setCurrentAccountId(accountId);

      toast({
        title: "Account Switched",
        description: "Successfully switched to the selected account.",
      });

      // Refresh the page to update all data with new account context
      window.location.reload();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to switch account";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getCurrentAccount = (): AccountOption | null => {
    return accounts.find((account) => account.id === currentAccountId) || null;
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Crown className="h-3 w-3" />;
      case "employer":
        return <Shield className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getRoleBadgeColor = (role: string): string => {
    switch (role) {
      case "admin":
        return "bg-purple-100 text-purple-800";
      case "employer":
        return "bg-blue-100 text-blue-800";
      case "recruiter":
        return "bg-green-100 text-green-800";
      default:
        return "bg-muted text-foreground";
    }
  };

  // Don't render if no accounts available or only one account
  if (accounts.length <= 1) {
    return null;
  }

  const currentAccount = getCurrentAccount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={`flex items-center gap-2 ${className}`}
          disabled={loading}
        >
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={currentAccount?.logoUrl} />
              <AvatarFallback>
                <Building2 className="h-3 w-3" />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium">
                {currentAccount?.name || "Select Account"}
              </span>
              {currentAccount && (
                <Badge
                  variant="secondary"
                  className={`text-xs ${getRoleBadgeColor(currentAccount.role)}`}
                >
                  {getRoleIcon(currentAccount.role)}
                  <span className="ml-1">
                    {getRoleDisplayLabel(currentAccount.role)}
                  </span>
                </Badge>
              )}
            </div>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Switch Account</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {accounts.map((account) => (
          <DropdownMenuItem
            key={account.id}
            onClick={() => handleAccountSwitch(account.id)}
            className="flex items-center gap-3 p-3 cursor-pointer"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={account.logoUrl} />
              <AvatarFallback>
                <Building2 className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{account.name}</span>
                {account.id === currentAccountId && (
                  <Check className="h-4 w-4 text-green-600" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="secondary"
                  className={`text-xs ${getRoleBadgeColor(account.role)}`}
                >
                  {getRoleIcon(account.role)}
                  <span className="ml-1">
                    {getRoleDisplayLabel(account.role)}
                  </span>
                </Badge>
                {account.isOwner && (
                  <Badge variant="outline" className="text-xs">
                    Owner
                  </Badge>
                )}
              </div>
            </div>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem className="text-sm text-muted-foreground p-3">
          <div>
            <p className="font-medium">Need to create a new account?</p>
            <p className="text-xs mt-1">
              Contact support or upgrade your plan to create additional
              accounts.
            </p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

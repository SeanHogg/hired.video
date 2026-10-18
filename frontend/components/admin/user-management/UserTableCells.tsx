import { useTranslation } from "react-i18next";
import { Gift, UserPlus, Sparkles } from "lucide-react";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { ROLE_COLORS, formatTokens } from "./helpers";
import type { ApiUser, FormatDate } from "./types";

/** Name + email, plus the referral badge when the user signed up via an affiliate link. */
export function UserIdentityCell({ user }: { user: ApiUser }) {
  const { t } = useTranslation();
  return (
    <div>
      <p className="font-medium text-sm">{user.name}</p>
      <p className="text-xs text-muted-foreground">{user.email}</p>
      {/* Referral indicator — shown when this user signed up
          via an affiliate link. Tooltip carries the referrer
          + conversion status; the badge is the at-a-glance
          "this was a referral" cue. */}
      {user.referral && (
        <span
          className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200"
          title={
            t("messages.referredByTooltip", {
              name: user.referral.referrerName || user.referral.referrerEmail,
              code: user.referral.referralCode,
            }) +
            (user.referral.converted ? `\n${t("labels.converted")}` : "")
          }
        >
          <Gift className="h-2.5 w-2.5" />
          {t("labels.referredBy", { name: user.referral.referrerName || user.referral.referrerEmail })}
          {user.referral.converted && <UserPlus className="h-2.5 w-2.5 opacity-80" />}
        </span>
      )}
    </div>
  );
}

export function UserRoleCell({ user }: { user: ApiUser }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] ?? ""}`}>
        {user.isSuperAdmin ? t("labels.superAdmin") : getRoleDisplayLabel(user.role)}
      </span>
      {user.isSystem && (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-accent text-accent-foreground">
          <Sparkles className="h-2.5 w-2.5" />
          {t("labels.editorial")}
        </span>
      )}
    </div>
  );
}

function planBadgeClass(user: ApiUser): string {
  if (user.isUnlimited) return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
  if (user.isPaid) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
  return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200";
}

export function UserPlanCell({ user, formatDate }: { user: ApiUser; formatDate: FormatDate }) {
  const { t } = useTranslation();
  const override = user.planOverride;
  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex w-fit items-center rounded px-2 py-0.5 text-xs font-medium ${planBadgeClass(user)}`}>
        {user.isUnlimited ? t("marketing.pricing.value.unlimited") : user.isPaid ? user.planName : t("tiers.free.name")}
      </span>
      {override?.active && (
        <span
          className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
          title={
            t("admin.userManagement.overrideTooltip", {
              plan: override.originalPlanName,
              reason: override.reason,
            }) +
            "\n" +
            (override.expiresAt
              ? t("admin.userManagement.overrideExpires", {
                  date: formatDate(override.expiresAt, { year: "numeric", month: "short", day: "numeric" }),
                })
              : t("admin.userManagement.permanentOverride"))
          }
        >
          <Sparkles className="h-2.5 w-2.5" />
          {t("prompts.dialogPlanOverride")}
          {override.expiresAt && (
            <span className="opacity-80">
              {t("admin.userManagement.overrideUntil", {
                date: formatDate(override.expiresAt, { month: "short", day: "numeric" }),
              })}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export function UserTokensCell({ user }: { user: ApiUser }) {
  const { t } = useTranslation();
  if (user.isUnlimited) {
    return (
      <div className="leading-tight">
        <div className="font-medium">
          {formatTokens(user.monthlyUsed)}
          <span className="text-muted-foreground">{" / ∞"}</span>
        </div>
        <div className="text-xs text-muted-foreground">{t("labels.unlimitedLowercase")}</div>
      </div>
    );
  }
  return (
    <div className="leading-tight">
      <div className="font-medium">
        {formatTokens(user.monthlyUsed)}
        <span className="text-muted-foreground">
          {" / "}
          {user.monthlyLimit !== null ? formatTokens(user.monthlyLimit) : "∞"}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        {t("labels.tokensAvailable", { count: formatTokens(user.tokensAvailable ?? 0) })}
        {user.packBalance > 0 && ` ${t("labels.packSuffix", { count: formatTokens(user.packBalance) })}`}
      </div>
    </div>
  );
}

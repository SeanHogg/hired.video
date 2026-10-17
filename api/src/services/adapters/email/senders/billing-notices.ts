/** Billing notice senders: plan-upgrade confirmation. */

import { logger } from "../../../../lib/logger.js";
import { getEmailProvider } from "../transport.js";
import { buildPlanUpgradeEmail, type PlanUpgradeEmailParams } from "../templates/billing.js";

export async function sendPlanUpgradeEmail(params: PlanUpgradeEmailParams): Promise<void> {
  const provider = getEmailProvider();
  if (!provider) {
    logger.warn("[email]No provider configured — skipping plan upgrade email");
    return;
  }
  const { subject, html } = buildPlanUpgradeEmail(params);
  await provider.send({ to: params.to, subject, html });
}

/**
 * Production wiring for sendAgentDigest. Kept out of agent-digest.ts so
 * unit tests never import the DB, email adapter, or notification dispatcher.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { buildRepos } from "../../repositories/index.js";
import { emitNotification } from "../notifications/notificationService.js";
import { loadNotificationPreferences } from "../notifications/preferences.js";
import { getEmailProvider } from "../adapters/email/transport.js";
import { buildAgentPauseUrl } from "./agent-pause-token.js";
import { frontendBaseUrl } from "../../utils/public-urls.js";
import type { AgentDigestDeps } from "./agent-digest.js";

export function agentHubUrl(): string {
  return `${frontendBaseUrl()}/studio/distribution?tab=agent`;
}

export function liveAgentDigestDeps(): AgentDigestDeps {
  return {
    emitBell: async (input) => {
      await emitNotification(
        { repos: buildRepos(getDb()) },
        {
          recipientIds: [input.userId],
          type: input.type,
          actor: null,
          title: input.title,
          message: input.message,
          url: input.url,
          push: input.push,
          email: input.email,
        },
      );
    },
    loadPrefs: async (userId) => {
      const prefs = await loadNotificationPreferences(userId);
      return prefs as unknown as {
        emailWeeklyDigest: boolean;
        pushJobMatches: boolean;
        [k: string]: boolean;
      };
    },
    sendEmail: async (input) => {
      const provider = getEmailProvider();
      if (!provider) return;
      await provider.send(input);
    },
    loadUserEmail: async (userId) => {
      const [row] = await getDb()
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return row?.email ?? null;
    },
    buildPauseUrl: (userId) => buildAgentPauseUrl(frontendBaseUrl(), userId, new Date()),
  };
}

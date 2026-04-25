/**
 * New Relic Logs ingestion adapter.
 *
 * Posts structured log records to NR's HTTP log endpoint. Used by the
 * client-error report flow so that frontend crashes show up alongside
 * server logs in NR — handy when investigating "the user said it broke
 * but I see nothing in the API logs" tickets.
 *
 * Environment variables:
 *   NEW_RELIC_LICENSE_KEY  — required to enable shipping. When unset,
 *                            sendNewRelicLog() no-ops (logged once) so
 *                            local/dev stays frictionless.
 *   NEW_RELIC_LOG_ENDPOINT — optional override. Defaults to the US
 *                            ingest endpoint; set to the EU equivalent
 *                            (https://log-api.eu.newrelic.com/log/v1)
 *                            for EU accounts.
 *   NEW_RELIC_APP_NAME     — optional service name attribute. Defaults
 *                            to "hired-video-api".
 */

const DEFAULT_ENDPOINT = "https://log-api.newrelic.com/log/v1";
const DEFAULT_APP_NAME = "hired-video-api";

function getEnv(key: string): string {
  return process.env[key] || (globalThis as any).__ENV?.[key] || "";
}

export interface NewRelicLogRecord {
  /** Free-form message — appears as `message` in NR. */
  message: string;
  /** "info" | "warn" | "error" | "fatal" — folded into the `level` attribute. */
  level?: "info" | "warn" | "error" | "fatal";
  /** Arbitrary structured attributes attached to the log record. */
  attributes?: Record<string, unknown>;
  /** Override timestamp (ms). Defaults to now. */
  timestampMs?: number;
}

let _missingKeyWarned = false;

/** Ship a single log record to New Relic. Returns true if accepted (or
 *  if no license key is configured — treated as success since the call
 *  is a noop), false on transport / non-2xx response. Never throws. */
export async function sendNewRelicLog(record: NewRelicLogRecord): Promise<boolean> {
  const licenseKey = getEnv("NEW_RELIC_LICENSE_KEY");
  if (!licenseKey) {
    if (!_missingKeyWarned) {
      console.warn("[newrelic] NEW_RELIC_LICENSE_KEY not set — log ingestion disabled");
      _missingKeyWarned = true;
    }
    return true;
  }

  const endpoint = getEnv("NEW_RELIC_LOG_ENDPOINT") || DEFAULT_ENDPOINT;
  const appName = getEnv("NEW_RELIC_APP_NAME") || DEFAULT_APP_NAME;

  // NR's "common attributes" payload shape: a single object with `common`
  // attributes applied to every log in the batch + a `logs` array. Even
  // for one record, this format keeps the door open for batching.
  const body = [
    {
      common: {
        attributes: {
          service: appName,
          environment: getEnv("NODE_ENV") || "unknown",
        },
      },
      logs: [
        {
          timestamp: record.timestampMs ?? Date.now(),
          message: record.message,
          level: record.level ?? "error",
          attributes: record.attributes ?? {},
        },
      ],
    },
  ];

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // NR accepts either Api-Key or X-License-Key; license key is the
        // documented one for the log ingest API.
        "X-License-Key": licenseKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[newrelic] log ingest non-2xx:", res.status, text.slice(0, 500));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[newrelic] log ingest threw:", err);
    return false;
  }
}

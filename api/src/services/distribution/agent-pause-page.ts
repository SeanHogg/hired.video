/**
 * Localized confirm / result pages for the digest pause link.
 * GET renders confirm (no state change); the form POSTs the pause.
 */

import { escapeHtml } from "../../../../shared/html-escape.js";

export type PausePageLocale = "en" | "es" | "fr-CA";

const COPY: Record<
  PausePageLocale,
  {
    confirmTitle: string;
    confirmBody: string;
    confirmButton: string;
    invalidTitle: string;
    invalidBody: string;
    doneTitle: string;
    doneBody: string;
  }
> = {
  en: {
    confirmTitle: "Pause posting agent?",
    confirmBody:
      "This will pause your posting agent. Nothing will be drafted or posted until you start it again from Distribution.",
    confirmButton: "Pause agent",
    invalidTitle: "Invalid pause link",
    invalidBody:
      "This pause link is invalid or has expired. You can pause the agent from Distribution in hired.video.",
    doneTitle: "Posting agent paused",
    doneBody: "Your posting agent is paused. You can start it again from Distribution.",
  },
  es: {
    confirmTitle: "¿Pausar el agente de publicación?",
    confirmBody:
      "Esto pausará tu agente de publicación. No se crearán borradores ni se publicará nada hasta que lo vuelvas a activar en Distribución.",
    confirmButton: "Pausar agente",
    invalidTitle: "Enlace no válido",
    invalidBody:
      "Este enlace para pausar no es válido o ha caducado. Puedes pausar el agente desde Distribución en hired.video.",
    doneTitle: "Agente de publicación pausado",
    doneBody: "Tu agente de publicación está pausado. Puedes reactivarlo desde Distribución.",
  },
  "fr-CA": {
    confirmTitle: "Mettre l’agent de publication en pause?",
    confirmBody:
      "Cela mettra votre agent de publication en pause. Rien ne sera rédigé ni publié tant que vous ne le relancerez pas dans Distribution.",
    confirmButton: "Mettre en pause",
    invalidTitle: "Lien de pause invalide",
    invalidBody:
      "Ce lien de pause est invalide ou a expiré. Vous pouvez mettre l’agent en pause depuis Distribution dans hired.video.",
    doneTitle: "Agent de publication en pause",
    doneBody: "Votre agent de publication est en pause. Vous pouvez le relancer depuis Distribution.",
  },
};

export function localeFromAcceptLanguage(header: string | undefined | null): PausePageLocale {
  const raw = (header ?? "").toLowerCase();
  if (raw.includes("fr")) return "fr-CA";
  if (raw.includes("es")) return "es";
  return "en";
}

const PAGE_STYLES = `body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f4f5;margin:0;padding:0}
.card{max-width:480px;margin:64px auto;background:#fff;border-radius:12px;padding:32px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:20px;color:#18181b;margin:0 0 12px}
.copy{color:#52525b;line-height:1.6}
button{background:#18181b;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;cursor:pointer}
@media (prefers-color-scheme: dark){
  body{background:#18181b}
  .card{background:#27272a;box-shadow:none}
  h1{color:#fff}
  .copy{color:#a1a1aa}
  button{background:#fff;color:#18181b}
}`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${PAGE_STYLES}</style></head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <div class="copy">${body}</div>
  </div>
</body></html>`;
}

export function pauseConfirmPage(token: string, locale: PausePageLocale): string {
  const copy = COPY[locale];
  const action = `?token=${encodeURIComponent(token)}`;
  const body =
    `<p style="margin:0 0 16px;">${escapeHtml(copy.confirmBody)}</p>` +
    `<form method="post" action="${escapeHtml(action)}">` +
    `<button type="submit">${escapeHtml(copy.confirmButton)}</button>` +
    `</form>`;
  return page(copy.confirmTitle, body);
}

export function pauseInvalidPage(locale: PausePageLocale): string {
  const copy = COPY[locale];
  return page(copy.invalidTitle, `<p style="margin:0;">${escapeHtml(copy.invalidBody)}</p>`);
}

export function pauseDonePage(locale: PausePageLocale): string {
  const copy = COPY[locale];
  return page(copy.doneTitle, `<p style="margin:0;">${escapeHtml(copy.doneBody)}</p>`);
}

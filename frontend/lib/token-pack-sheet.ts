/**
 * Open the global "Buy AI tokens" sheet from anywhere (pill, banner, settings)
 * without prop-drilling. `<TokenPackSheetHost>` at the App root listens for
 * this event and decides for itself whether the viewer can buy packs.
 */
export const TOKEN_PACK_SHEET_OPEN_EVENT = "token-packs:open";

export function openTokenPackSheet(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOKEN_PACK_SHEET_OPEN_EVENT));
}

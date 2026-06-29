/**
 * Open a vendor's billing page in a popup window (like kaktus-muehle) so the user
 * can download the missing Beleg and drop it straight back onto Belegabgleich,
 * without losing the report tab. Falls back to a normal tab if the popup is
 * blocked. `noopener` keeps the opened page from reaching back into our window.
 */
export function openBeleg(url: string): void {
  // Top-right of the browser window, so it doesn't cover our centered picker.
  const margin = 24;
  const w = Math.min(900, Math.max(480, window.outerWidth - 2 * margin));
  const h = Math.max(480, window.outerHeight - 2 * margin);
  const left = Math.max(0, window.screenX + window.outerWidth - w - margin);
  const top = Math.max(0, window.screenY + margin);
  const features = `popup=yes,width=${Math.round(w)},height=${Math.round(h)},left=${Math.round(left)},top=${Math.round(top)},noopener,noreferrer`;
  const popup = window.open(url, "belegabgleich-beleg", features);
  if (!popup) window.open(url, "_blank", "noopener,noreferrer"); // popup blocked → tab
}

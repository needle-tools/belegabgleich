/**
 * Open a vendor's billing page so the user can download the missing Beleg and drop
 * it straight back onto Belegabgleich.
 *
 * A plain new tab, deliberately: this used to be a popup window, which strands you
 * the moment the vendor's site navigates (Amazon → Rechnung → no way back to the
 * order list without knowing the keyboard shortcuts). A tab keeps history, back and
 * the address bar, and the report stays open next to it. `noopener` keeps the opened
 * page from reaching back into our window.
 */
export function openBeleg(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Open an already-read PDF from its bytes in a new tab. Local only — the blob URL
 *  never leaves the browser, and is released again once the tab has had it. */
export function openPdfBytes(data: ArrayBuffer | undefined): void {
  if (!data) return;
  const url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

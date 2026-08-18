/**
 * Open a vendor's billing page so the user can download the missing Beleg and drop it
 * straight back onto Belegabgleich.
 *
 * Two ways, because both have a real drawback and which one hurts depends on the
 * vendor:
 *
 *  - a TAB (the default) keeps history, back/forward and the address bar, so a site
 *    that navigates — Amazon: orders → invoice → back to orders — stays usable;
 *  - a WINDOW sits beside Belegabgleich instead of hiding it, which is what you want
 *    when you are fetching one invoice after another. Chrome gives such a window no
 *    back button, which is exactly why it isn't the default.
 *
 * The choice is remembered locally. `noopener` keeps the opened page from reaching
 * back into our window either way.
 */
export type OpenMode = "tab" | "window";

const MODE_KEY = "kah.beleg-open-mode";

export function openMode(): OpenMode {
  try {
    return localStorage.getItem(MODE_KEY) === "window" ? "window" : "tab";
  } catch {
    return "tab"; // storage blocked (private mode) — the default is fine
  }
}

export function setOpenMode(mode: OpenMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* not remembering it is not worth an error */
  }
}

export function openBeleg(url: string, mode: OpenMode = openMode()): void {
  if (mode === "window") {
    // Beside our window, top-right, not covering it.
    const w = Math.min(1280, Math.max(720, Math.round(window.outerWidth * 0.68)));
    const h = Math.max(600, Math.round(window.outerHeight * 0.88));
    const left = Math.max(0, window.screenX + window.outerWidth - w - 32);
    const top = Math.max(0, window.screenY + 32);
    const features = `popup=yes,width=${w},height=${h},left=${left},top=${top},noopener,noreferrer`;
    if (window.open(url, "_blank", features)) return;
    // blocked → fall through to a plain tab rather than doing nothing
  }
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

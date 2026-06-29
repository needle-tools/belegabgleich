/**
 * Privacy-first usage analytics via Rybbit (https://rybbit.io) — an open-source,
 * cookieless, GDPR-friendly analytics platform.
 *
 * HARD RULE: this module may ONLY ever transmit anonymous usage signals (which
 * steps of the flow ran, and coarse counts). It must NEVER receive or send any
 * document content, filenames, vendor names, merchant strings, amounts, dates,
 * account numbers, or anything else derived from the user's financial data.
 *
 * To enforce that at the API boundary:
 *   - `track()` accepts only a fixed enum of event names.
 *   - event properties are restricted to a whitelist of NON-sensitive keys with
 *     numeric / enum values (e.g. a coarse count bucket, the bank parser id).
 *     Anything else is dropped before it reaches Rybbit.
 *
 * If no site id is configured (VITE_RYBBIT_SITE_ID), this is a no-op: the tool is
 * fully usable with zero analytics.
 */

/** The complete, fixed set of events we will ever emit. No free-form names. */
export type AnalyticsEvent =
  | "app_loaded"
  | "folder_selected"
  | "statement_detected"
  | "report_generated"
  | "invoice_link_opened"
  | "provider_link_opened"
  | "csv_exported"
  | "rename_applied"
  | "ai_fallback_used";

/** Non-sensitive properties only. Values are numbers or short enums — never data. */
export type SafeProps = {
  /** Coarse magnitude bucket, never an exact count of someone's transactions. */
  bucket?: "0" | "1-10" | "11-50" | "51-200" | "200+";
  /** Which bank parser handled it (e.g. "sparkasse"). Not user data. */
  parser?: string;
  /**
   * Public vendor brand from the static providers list (e.g. "Adobe") — used only
   * for the supported-providers links. NOT derived from the user's documents.
   */
  provider?: string;
};

const ALLOWED_PROP_KEYS: (keyof SafeProps)[] = ["bucket", "parser", "provider"];

type RybbitGlobal = { event?: (name: string, props?: Record<string, unknown>) => void };
function rybbit(): RybbitGlobal | undefined {
  return (globalThis as { rybbit?: RybbitGlobal }).rybbit;
}

let enabled = false;

export type AnalyticsConfig = {
  /** Rybbit site id. From VITE_RYBBIT_SITE_ID. When empty, analytics stays off. */
  siteId?: string;
  /** Rybbit host (self-hosted instance). Defaults to the hosted app.rybbit.io. */
  host?: string;
};

/**
 * Inject the Rybbit script once, if a site id is configured. Safe to call in any
 * environment — does nothing on the server or without a site id.
 */
export function initAnalytics(config: AnalyticsConfig): void {
  if (enabled) return;
  const siteId = (config.siteId || "").trim();
  if (!siteId) return; // analytics disabled — the default, privacy-preserving path
  if (typeof document === "undefined") return;

  const host = (config.host || "https://app.rybbit.io").replace(/\/$/, "");
  const s = document.createElement("script");
  s.src = `${host}/api/script.js`;
  s.defer = true;
  s.setAttribute("data-site-id", siteId);
  document.head.appendChild(s);
  enabled = true;
}

/** Coarse-grain a raw count into a privacy-safe bucket (never the exact value). */
export function bucket(n: number): NonNullable<SafeProps["bucket"]> {
  if (n <= 0) return "0";
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 200) return "51-200";
  return "200+";
}

/** Strip props down to the whitelisted, non-sensitive keys. Defense in depth. */
function sanitize(props?: SafeProps): Record<string, string> | undefined {
  if (!props) return undefined;
  const out: Record<string, string> = {};
  for (const k of ALLOWED_PROP_KEYS) {
    const v = props[k];
    if (typeof v === "string" && v) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Record an anonymous usage event. No-op unless analytics is enabled. Only the
 * fixed event names and whitelisted props above can ever be sent.
 */
export function track(event: AnalyticsEvent, props?: SafeProps): void {
  if (!enabled) return;
  try {
    rybbit()?.event?.(event, sanitize(props));
  } catch {
    /* analytics must never break the app */
  }
}

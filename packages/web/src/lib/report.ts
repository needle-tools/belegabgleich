/**
 * Report model shared by the live pipeline and the demo/mock data. Holds the
 * report-row shape, the summary roll-up, the de-DE formatters, and the
 * provider→invoice-URL lookup (from the repo-root providers.json). Building a
 * report from the matching engine lives in {@link buildReport}.
 */
import { canon, configureAliases, groupRelated, type MatchResult, type ChargeGroup } from "@kah/core";
import { expectsNoInvoiceAny } from "@kah/parsers";
import providersDoc from "../../../../providers.json";

type ProviderEntry = { name: string; aliases: string[]; invoiceUrl?: string };
const providers = providersDoc.providers as ProviderEntry[];

const invoiceUrlByProvider = new Map<string, string>(
  providers.filter((p) => p.invoiceUrl).map((p) => [p.name, p.invoiceUrl as string]),
);

export function invoiceUrlFor(provider: string): string | undefined {
  return invoiceUrlByProvider.get(provider);
}

/** Public, alphabetically-sorted vendor list for the "supported providers" section. */
export type SupportedProvider = { name: string; invoiceUrl?: string };
export const supportedProviders: SupportedProvider[] = providers
  .map((p) => ({ name: p.name, invoiceUrl: p.invoiceUrl || undefined }))
  .sort((a, b) => a.name.localeCompare(b.name, "de"));

/**
 * Teach the pure engine the community provider aliases so canon() resolves noisy
 * statement merchant strings (e.g. "CLOUDFLARE.COUS") to the brand. Idempotent;
 * call once at startup before any parsing.
 */
let aliasesConfigured = false;
export function configureProviderAliases(): void {
  if (aliasesConfigured) return;
  const extra: Record<string, string> = {};
  for (const p of providers) for (const a of p.aliases) extra[a.toLowerCase()] = p.name;
  configureAliases(extra);
  aliasesConfigured = true;
}

export type ReportStatus = "matched" | "missing" | "no_invoice";

export type ReportEntry = {
  provider: string;
  date: string; // YYYY-MM-DD
  amount: number; // original-currency principal
  currency: string;
  status: ReportStatus;
  /** display path of the matched invoice (status: matched) */
  invoice?: string;
  /** why no Beleg is expected (status: no_invoice) */
  note?: string;
  /** raw statement descriptor (carries the account id used for grouping) */
  merchant?: string;
};

/** A group of related report rows (recurring same-account or one-invoice). */
export type EntryGroup = ChargeGroup<ReportEntry & { merchant: string }>;

/**
 * Collapse rows that belong together (recurring same-account missing charges, or
 * matched charges paid by one invoice) into groups for the report. A group of one
 * renders as a normal row. Falls back to the canon'd provider when an entry has
 * no raw merchant (e.g. demo data), so those simply never group.
 */
export function groupEntries(entries: ReportEntry[]): EntryGroup[] {
  return groupRelated(entries.map((e) => ({ ...e, merchant: e.merchant ?? e.provider })));
}

export type Summary = {
  total: number; // charges expecting a Beleg
  matched: number;
  missing: number;
  noInvoice: number;
  coverage: number; // 0..1 over Beleg-expecting charges
};

export function summarize(entries: ReportEntry[]): Summary {
  const noInvoice = entries.filter((e) => e.status === "no_invoice").length;
  const matched = entries.filter((e) => e.status === "matched").length;
  const missing = entries.filter((e) => e.status === "missing").length;
  const total = matched + missing; // only charges that should have a Beleg
  return { total, matched, missing, noInvoice, coverage: total ? matched / total : 1 };
}

/** Short German reason a debit needs no vendor invoice (payroll, tax, card settlement). */
function noInvoiceNote(merchant: string): string {
  const m = (merchant || "").toLowerCase();
  if (/visa\s*nr|einzug/.test(m)) return "Kartenabrechnung";
  if (/lohnsteuer|\blst\b/.test(m)) return "Lohnsteuer";
  if (/umsatzsteuer/.test(m)) return "Umsatzsteuer";
  if (/gewerbesteuer/.test(m)) return "Gewerbesteuer";
  if (/lohn|gehalt/.test(m)) return "Gehalt";
  if (/bkk|knappschaft|rentenversicherung|krankenkasse/.test(m)) return "Sozialabgabe";
  if (/finanzamt|steuer/.test(m)) return "Steuer";
  return "kein Beleg nötig";
}

/**
 * Turn the engine's match result into report rows: matched charges first, then
 * the missing ones, with payroll/tax/card-settlement debits flagged as
 * "kein Beleg nötig" so they stay out of the Fehlend list. Unmatched invoices
 * are informational and not surfaced as rows.
 */
export function buildReport(match: MatchResult): ReportEntry[] {
  const entries: ReportEntry[] = [];

  for (const { charge, rows } of match.matched) {
    entries.push({
      provider: canon(charge.merchant),
      date: charge.date,
      amount: charge.amount,
      currency: charge.currency || "EUR",
      status: "matched",
      invoice: rows.map((r) => r.rel).join(", "),
      merchant: charge.merchant,
    });
  }

  for (const charge of match.missing) {
    const noInvoice = expectsNoInvoiceAny(charge.merchant);
    entries.push({
      provider: canon(charge.merchant),
      date: charge.date,
      amount: charge.amount,
      currency: charge.currency || "EUR",
      status: noInvoice ? "no_invoice" : "missing",
      ...(noInvoice ? { note: noInvoiceNote(charge.merchant) } : {}),
      merchant: charge.merchant,
    });
  }

  return entries;
}

const eur = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function money(amount: number, currency: string): string {
  const sym = currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "GBP" ? "£" : "";
  return sym ? `${eur.format(amount)} ${sym}` : `${eur.format(amount)} ${currency}`;
}

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short", year: "numeric" });
export function dDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  const [y, m, d] = iso.split("-").map(Number);
  return dateFmt.format(new Date(y, m - 1, d));
}

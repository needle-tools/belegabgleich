/**
 * Report model shared by the live pipeline and the demo/mock data. Holds the
 * report-row shape, the summary roll-up, the de-DE formatters, and the
 * provider→invoice-URL lookup (from the repo-root providers.json). Building a
 * report from the matching engine lives in {@link buildReport}.
 */
import { canon, configureAliases, eurValueOf, groupRelated, type Charge, type MatchResult, type ChargeGroup } from "@kah/core";
import { expectsNoInvoiceAny } from "@kah/parsers";
import providersDoc from "../../../../providers.json";

export type InvoicePortal = { label: string; url: string };
type ProviderEntry = { name: string; aliases: string[]; invoiceUrl?: string; invoiceUrls?: InvoicePortal[] };
const providers = providersDoc.providers as ProviderEntry[];

const invoiceUrlByProvider = new Map<string, string>(
  providers.filter((p) => p.invoiceUrl).map((p) => [p.name, p.invoiceUrl as string]),
);

export function invoiceUrlFor(provider: string): string | undefined {
  return invoiceUrlByProvider.get(provider);
}

// Some vendors bill through several portals (Google: Payments Center, Cloud,
// Ads, Workspace) and the statement descriptor rarely says which one — so offer
// them all rather than guessing. Vendors with a single link yield one portal,
// which the picker renders exactly as before.
const portalsByProvider = new Map<string, InvoicePortal[]>(
  providers
    .map((p) => [p.name, p.invoiceUrls?.length ? p.invoiceUrls : p.invoiceUrl ? [{ label: p.name, url: p.invoiceUrl }] : []] as const)
    .filter(([, portals]) => portals.length)
    .map(([name, portals]) => [name, portals as InvoicePortal[]]),
);

/** Every invoice portal known for a provider — empty when none is on file. */
export function invoicePortalsFor(provider: string): InvoicePortal[] {
  return portalsByProvider.get(provider) ?? [];
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
  /** why no Beleg is expected (status: no_invoice), or how a matched Beleg was
   *  linked when it took an exchange rate rather than an equal total */
  note?: string;
  /** what the bank actually debited in EUR — the only figure comparable across
   *  rows, since `amount` may be USD, GBP or JPY. Absent when unknown. */
  eur?: number;
  /** raw statement descriptor (carries the account id used for grouping) */
  merchant?: string;
  /** Position of the charge in the statement, so the report can be put back into
   *  the order the document prints it — absent on demo rows and older sessions. */
  order?: number;
};

/**
 * Biggest booking first — the point of sorting by amount is finding the Belege
 * worth chasing. Compares the EUR the bank actually booked, never the raw
 * `amount`: those are in whatever the vendor billed, so 3.000 ¥ beside 20 $ would
 * order by nothing at all. A foreign charge whose statement never printed the EUR
 * side keeps its own figure — imperfect, but better than dropping it out of order.
 */
export const byAmountDesc = (a: ReportEntry, b: ReportEntry): number =>
  (b.eur ?? b.amount) - (a.eur ?? a.amount);

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
export function buildReport(match: MatchResult, ordered?: readonly Charge[]): ReportEntry[] {
  const entries: ReportEntry[] = [];
  // Where each charge stands in the statement. The report groups matched before
  // missing, which loses that order — keeping the index lets the UI put it back.
  const position = new Map<Charge, number>();
  (ordered ?? []).forEach((c, i) => position.set(c, i));

  for (const { charge, rows, fx } of match.matched) {
    entries.push({
      provider: canon(charge.merchant),
      date: charge.date,
      amount: charge.amount,
      currency: charge.currency || "EUR",
      status: "matched",
      invoice: rows.map((r) => r.rel).join(", "),
      ...(eurValueOf(charge) != null ? { eur: eurValueOf(charge) as number } : {}),
      merchant: charge.merchant,
      ...(fx ? { note: `Rechnung lautet auf ${fx.currency} — über den Kurs zugeordnet (1 ${fx.currency} ≈ ${rateFmt.format(fx.rate)} €)` } : {}),
      ...(position.has(charge) ? { order: position.get(charge) } : {}),
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
      ...(eurValueOf(charge) != null ? { eur: eurValueOf(charge) as number } : {}),
      merchant: charge.merchant,
      ...(position.has(charge) ? { order: position.get(charge) } : {}),
    });
  }

  return entries;
}

const eur = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Rates need more than two decimals to stay meaningful (1 JPY ≈ 0,0065 €).
const rateFmt = new Intl.NumberFormat("de-DE", { maximumSignificantDigits: 4 });
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

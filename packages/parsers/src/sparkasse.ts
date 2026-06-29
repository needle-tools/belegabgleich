/**
 * Deterministic Sparkasse statement parsing (VISA Kreditkartenabrechnung +
 * Kontoauszug). These dense, column-offset statements confuse an LLM, and since
 * they're a fixed monthly format we parse them deterministically instead.
 *
 * Currently tuned to the Saalesparkasse layout; the address/footer skip list in
 * parseKontoauszug is the only branch-specific part. Other Sparkassen share the
 * same VISA/Kontoauszug structure and can be slotted in by generalizing that list.
 */
import type { Charge } from "@kah/core";
import type { BankParser, ParsedStatement } from "./types";

/** German money string → number ("1.234,56" → 1234.56, "-8.555,54" → -8555.54). */
function deNum(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

// VISA line: "DD.MM.  DD.MM.  <merchant + location>  <amount><+|->"
const VISA_TX = /^(\d{2})\.(\d{2})\.\s+(\d{2})\.(\d{2})\.\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*([+-])\s*$/;
// the original foreign principal, printed on the line below: "5,20  USD,  EURO-Kurs ..."
const USD_LINE = /(\d{1,3}(?:\.\d{3})*,\d{2})\s+USD,\s*EURO-?Kurs/i;
// Kontoauszug line: "DD.MM.YYYY <Erläuterung>  <signed amount>"
const KONTO_TX = /^(\d{2})\.(\d{2})\.(\d{4})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;

/** Parse a Sparkasse VISA credit-card statement into its purchases.
 *  `year` is the statement's END year (from "bis zum DD.MM.YYYY"). A statement
 *  period straddles a month boundary and can wrap the year-end, so a December
 *  transaction on a January statement belongs to the PREVIOUS year. */
export function parseVisaStatement(text: string, year: number): Charge[] {
  const endMonth = +(text.match(/bis zum \d{2}\.(\d{2})\.\d{4}/)?.[1] ?? "12");
  const lines = text.split(/\r?\n/);
  const out: Charge[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(VISA_TX);
    if (!m || m[7] === "+") continue; // skip credits/refunds; balance/Summe lines have no date prefix
    const merchant = m[5].replace(/\s+/g, " ").trim();
    const bookedEur = deNum(m[6]);
    let amount = bookedEur, currency = "EUR";
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      if (VISA_TX.test(lines[j])) break;
      const u = lines[j].match(USD_LINE);
      if (u) { amount = deNum(u[1]); currency = "USD"; break; } // match the invoice's original currency
    }
    const txMonth = +m[4];                                   // Belegtag month
    const txYear = txMonth > endMonth ? year - 1 : year;     // wrapped past year-end → previous year
    out.push({ date: `${txYear}-${m[4]}-${m[3]}`, merchant, amount, currency, ...(Math.abs(bookedEur - amount) > 0.01 ? { bookedEur } : {}) });
  }
  return out;
}

/** Parse a Sparkasse account statement (Kontoauszug); emits outgoing debits as charges. */
export function parseKontoauszug(text: string): Charge[] {
  const lines = text.split(/\r?\n/);
  const out: Charge[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(KONTO_TX);
    if (!m || /Kontostand|Saldo|Auszug\s*Nr|Rechnungsabschluss|^Abrechnung/i.test(m[4])) continue;
    const v = deNum(m[5]);
    if (!isFinite(v) || v >= 0) continue; // only debits (money out) can correspond to an invoice
    const payee: string[] = [];
    for (let j = i + 1; j < lines.length && payee.length < 1; j++) {
      const t = lines[j].trim();
      if (!t || KONTO_TX.test(lines[j])) break;
      // Branch-specific footer/address noise to skip (Saalesparkasse, Halle).
      if (/^(Sparkassen-Finanzgruppe|Kontoauszug \d|Datum Erläuterung|Gläubiger-ID|DE\d{2}\b|Rathausstra|06108 Halle|Saalesparkasse\s+(Rathaus|Amtsgericht|Telefon))/i.test(t)) continue;
      payee.push(t);
    }
    out.push({ date: `${m[3]}-${m[2]}-${m[1]}`, merchant: (payee[0] || m[4]).replace(/\s+/g, " ").slice(0, 90), amount: -v, currency: "EUR" });
  }
  return out;
}

/**
 * On a Kontoauszug, a credit-card statement is paid off by a debit like
 * "SAALESPARKASSE VISA NR. 123456XXXXXX1234 EINZUG DES RECHNUNGSB …". Returns the
 * card's last 4 digits ("1234") so the charge can be matched to that VISA
 * statement PDF, or null if the line isn't such a settlement.
 */
export function visaSettlementCard(merchant: string): string | null {
  if (!/VISA\s*NR/i.test(merchant)) return null;
  return merchant.match(/(\d{4})\s+EINZUG/i)?.[1] ?? null;
}

// Kontoauszug debits that intrinsically have NO vendor invoice to collect: payroll,
// taxes (wage/VAT/trade/income/corporate tax, and anything paid to the Finanzamt),
// statutory health & pension contributions, and the monthly credit-card settlement.
// Everything else IS a real expense whose Beleg we expect, so it counts as missing
// until matched. Extend as new categories show up.
const NO_INVOICE_RX =
  /\b(lohn|gehalt|lohnsteuer|lst|umsatzsteuer|gewerbesteuer|einkommensteuer|koerperschaftsteuer|körperschaftsteuer|kapitalertragsteuer|finanzamt|bkk|knappschaft|rentenversicherung|krankenkasse)\b/i;

/**
 * True when a Kontoauszug debit is one we never expect an invoice for (salary, any
 * tax / Finanzamt payment, social-insurance contribution, or a VISA card settlement).
 */
export function expectsNoInvoice(merchant: string): boolean {
  return visaSettlementCard(merchant) != null || NO_INVOICE_RX.test(merchant || "");
}

/** Detect + parse a Sparkasse statement. Returns null for unrecognized formats. */
function detect(text: string): boolean {
  if (/Kontoauszug/i.test(text)) return true;
  if (/VISA/.test(text) && /Saldovortrag|Kreditkartenabrechnung|Leistungsbeschreibung/i.test(text)) return true;
  return false;
}

function parse(text: string, filename = ""): ParsedStatement {
  if (/Kontoauszug/i.test(text)) return { kind: "konto", charges: parseKontoauszug(text) };
  const y = +(text.match(/bis zum \d{2}\.\d{2}\.(\d{4})/)?.[1] ?? filename.match(/(20\d{2})/)?.[1] ?? "2025");
  return { kind: "visa", charges: parseVisaStatement(text, y) };
}

export const sparkasseParser: BankParser = {
  id: "sparkasse",
  label: "Sparkasse",
  detect,
  parse,
  expectsNoInvoice,
};

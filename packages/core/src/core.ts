/**
 * Core naming + matching logic for Belegabgleich.
 *
 * This module is PURE and isomorphic: no Node, DOM, fetch, or filesystem
 * access. It runs unchanged in the Bun test runner and in the browser bundle.
 * Bank-statement parsing lives in a separate, pluggable package (@kah/parsers)
 * so new banks can be added without touching this engine.
 */

export type Fields = {
  provider: string;
  date: string; // YYYY-MM-DD (or "" )
  doc_type: string;
  invoice_number: string;
  currency: string;
  total: string;
};

/** Where a PDF physically lives — used to rename (file) or extract (zip) on apply. */
export type Src =
  | { kind: "file"; path: string }              // path: relative to scan root
  | { kind: "zip"; zip: string; entry: string }; // zip: relative to scan root; entry: name inside

export type Row = Fields & {
  rel: string;        // display path relative to scan root ("sub/foo.pdf" or "a.zip › foo.pdf")
  src: Src;
  proposed: string;
  hasText: boolean;
  dirId?: string;     // which selected folder this row came from (multi-folder scans)
};

export type ScanOpts = { depth?: number; zipMaxBytes?: number };

/**
 * True for credit-card/account statement filenames (Kreditkartenabrechnung /
 * Kontoauszug) like "1234_5678_ABRECHNUNG_2026-04-18_Mustermann_Max.PDF" —
 * leading numbers and trailing name vary. Such files are the matching INPUT, not
 * invoices, so the scanner skips them. The "ABRECHNUNG" token must be delimited,
 * so a vendor invoice named e.g. "Stromabrechnung_2026.pdf" is NOT excluded.
 */
export function isStatementFile(name: string): boolean {
  const base = (name.split(/[\/\\]/).pop() || name).replace(/\.[^.]+$/, "");
  return /kreditkartenabrechnung/i.test(base)
    || /(?:^|[_\-\s])abrechnung(?:[_\-\s]|$)/i.test(base)
    || /(?:^|[_\-\s])(konto)?auszug(?:[_\-\s]|$)/i.test(base); // Kontoauszug: "Konto_…-Auszug_2025_0010"
}

/** A discovered PDF plus a friendly relative label (produced by the UI fs layer). */
export type FoundPdf = { src: Src; rel: string };

/**
 * Brand canonicalization. Keys are matched as case-insensitive SUBSTRINGS against
 * the (often noisy/mangled) statement merchant string, so e.g. "CLOUDFLARE.COUS",
 * "WWW.HEROKU.COUS" and "BACKBLAZE.COMUS" all resolve to their brand. This is also
 * the key used to look up a provider's download URL.
 *
 * These are sensible built-in defaults so the pure engine works standalone. The
 * app extends them at startup from the repo's community-editable providers.json
 * via {@link configureAliases}.
 */
const DEFAULT_ALIASES: Record<string, string> = {
  backblaze: "Backblaze",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  ikea: "IKEA",
  gumroad: "Gumroad",
  discourse: "Discourse",
  cdck: "Discourse",
  "civilized discourse construction kit": "Discourse",
  anthropic: "Anthropic",
  "claude.ai": "Claude",
  claude: "Claude",
  // Specific Google products, checked before the generic "google" (canon uses
  // insertion order). Bank prints both "GOOGLE*ADS… CC" and "Google ADS… DUBLIN".
  "google*ads": "Google Ads",
  "google ads": "Google Ads",
  "google*cloud": "Google Cloud",
  "google cloud": "Google Cloud",
  google: "Google",
  amazon: "Amazon",
  apple: "Apple",   // "APPLE.COM/BILL", "ITUNES.COM" → App Store / media / subscription charges
  itunes: "Apple",
  "amazon web services": "AWS",
  aws: "AWS",
  github: "GitHub",
  cloudflare: "Cloudflare",
  heroku: "Heroku",
  hetzner: "Hetzner",
  byteplus: "BytePlus",
  slack: "Slack",
  resend: "Resend",
  stripe: "Stripe",
  paddle: "Paddle",
  tripo: "Tripo",
  notion: "Notion",
  vercel: "Vercel",
  netlify: "Netlify",
  figma: "Figma",
  elevenlabs: "ElevenLabs",
  mailchimp: "Mailchimp",
  "all-inkl": "ALL-INKL",
  "neue medien münnich": "ALL-INKL",
  "münnich": "ALL-INKL",
};

// Live alias table used by canon() when no explicit map is passed. The app may
// replace/extend it once at startup from providers.json. Default-param capture in
// canon() reads this at call time, so reassigning here affects internal callers too.
export let ALIASES: Record<string, string> = { ...DEFAULT_ALIASES };

/** Merge additional aliases (e.g. loaded from providers.json) into the live table. */
export function configureAliases(extra: Record<string, string>): void {
  ALIASES = { ...ALIASES, ...extra };
}

export function canon(raw: string, aliases: Record<string, string> = ALIASES): string {
  const k = (raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!k) return "Unknown";
  // placeholder / non-answers the model sometimes emits for non-invoices → treat as unidentified
  if (/^(n\/?a|n\.a\.|none|null|unknown|unbekannt|keine?|\?+|-+|—)$/.test(k)) return "Unknown";
  if (aliases[k]) return aliases[k];
  for (const [alias, name] of Object.entries(aliases)) {
    if (k.includes(alias)) return name;
  }
  const cleaned = raw.replace(/,?\s*(inc|gmbh|ltd|llc|co\.?\s*kg|ag|b\.v\.)\b.*/i, "").trim();
  return cleaned ? cleaned.replace(/\s+/g, "-") : "Unknown";
}

export function slug(s: string): string {
  return (s || "")
    .replace(/^rechnung[-_\s]*/i, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Filename schema: <Company>-<YYYY-MM-DD>[-<invoice#>].pdf
export function buildProposed(f: Fields): string {
  const provider = canon(f.provider);
  // If we couldn't identify the issuer the extraction effectively failed —
  // don't offer a meaningless "Unknown-…" name; the UI shows no suggestion.
  if (provider === "Unknown") return "";
  const date = ISO.test(f.date) ? f.date : f.date || "nodate";
  const parts = [provider, date];
  const num = slug(f.invoice_number);
  if (num) parts.push(num);
  return parts.join("-") + ".pdf";
}

// Payment aggregators whose statement descriptor carries the real seller in the
// "PROCESSOR* SELLER  <domain>  <country>" pattern (e.g. Gumroad sells for many
// creators). For these we surface the seller in the UI, not just the platform.
const MARKETPLACES = new Set(["Gumroad", "Paddle", "PayPal", "Stripe", "FastSpring", "Square", "Ko-fi", "Patreon", "Lemon Squeezy"]);

/** Seller behind a marketplace charge, e.g. "GUMROAD* JANE DOE GUMROAD.COM US"
 *  → "Jane Doe". Empty when the brand isn't a known aggregator or no seller is
 *  present (drops the trailing domain + 2-letter country tokens). */
export function marketplaceSeller(raw: string): string {
  if (!MARKETPLACES.has(canon(raw))) return "";
  const star = (raw || "").indexOf("*");
  if (star < 0) return "";
  const toks = raw.slice(star + 1).trim().split(/\s+/).filter(Boolean);
  while (toks.length > 1) {
    const last = toks[toks.length - 1];
    if (/\./.test(last) || /^[A-Z]{2}$/.test(last)) toks.pop(); else break;
  }
  const name = toks.join(" ").trim();
  if (!name || /\./.test(name)) return "";
  // title-case ALLCAPS tokens; leave already mixed-case ones alone
  return name.split(/\s+/).map(w => /^[A-Z0-9.&-]+$/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w).join(" ");
}

/** A stable account identifier embedded in a statement descriptor — the longest
 *  run of ≥8 digits (e.g. the Google Ads customer id "3332486474"). Used to group
 *  several charges from the same account. Empty when there's no such run (short,
 *  masked card numbers like "123456XXXXXX1234" don't qualify). */
export function merchantId(raw: string): string {
  const runs = (raw || "").match(/\d{8,}/g);
  return runs ? runs.sort((a, b) => b.length - a.length)[0] : "";
}

// ---------- deterministic invoice field extraction (no AI for the common case) ----------
//
// For recurring invoices from a KNOWN vendor set, the six fields are recoverable
// without a model: the provider is any brand token in the text (the same ALIASES
// table the statement matcher uses), and date/total/number/currency sit next to
// fixed German/English labels. This pure pass runs instantly and offline; the UI
// only falls back to the local model when `complete` is false.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  "mär": 3, mrz: 3, mai: 5, okt: 10, dez: 12, // German short forms that differ from English
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  januar: 1, februar: 2, "märz": 3, juni: 6, juli: 7, oktober: 10, dezember: 12,
};
function monthNum(tok: string): number {
  const k = tok.toLowerCase();
  return MONTHS[k] ?? MONTHS[k.slice(0, 3)] ?? 0;
}
function toISO(y: number, m: number, d: number): string {
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  if (y < 100) y += 2000;
  if (y < 1900 || y > 2999) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** First parseable date in a string → ISO. Tries ISO, D.M.Y, named-month, D/M/Y, D-M-Y. */
function parseDateAt(s: string): string {
  let m: RegExpExecArray | null;
  if ((m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s))) return toISO(+m[1], +m[2], +m[3]); // YMD with - or /
  if ((m = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})/.exec(s))) return toISO(+m[3], +m[2], +m[1]); // German D.M.Y
  if ((m = /(\d{1,2})\.?\s+([A-Za-zäöüÄÖÜ]{3,9})\.?\s+(\d{4})/.exec(s))) { const mo = monthNum(m[2]); if (mo) return toISO(+m[3], mo, +m[1]); } // 20 March 2026 / 20. März 2026
  if ((m = /([A-Za-zäöüÄÖÜ]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s))) { const mo = monthNum(m[1]); if (mo) return toISO(+m[3], mo, +m[2]); } // March 20, 2026
  if ((m = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(s))) return toISO(+m[3], +m[2], +m[1]); // EU order D/M/Y or D-M-Y
  return "";
}

/** Parse a money string in either German (1.234,56) or English (1,234.56) form. */
function parseMoney(raw: string): number | null {
  const s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  let dec = -1;
  if (lastComma >= 0 && lastDot >= 0) dec = Math.max(lastComma, lastDot);          // last separator is the decimal
  else if (lastComma >= 0) dec = s.length - lastComma - 1 <= 2 ? lastComma : -1;   // lone comma: decimal only if ≤2 trailing digits
  else if (lastDot >= 0) dec = s.length - lastDot - 1 <= 2 ? lastDot : -1;
  const intPart = (dec >= 0 ? s.slice(0, dec) : s).replace(/[.,]/g, "");
  const frac = dec >= 0 ? s.slice(dec + 1).replace(/[.,]/g, "") : "";
  const n = parseFloat(intPart + (frac ? "." + frac : ""));
  return isFinite(n) ? n : null;
}

const CUR_SYM: Record<string, string> = {
  "€": "EUR", "$": "USD", "£": "GBP", "¥": "JPY", "₹": "INR", "zł": "PLN", "kr": "SEK", "fr": "CHF",
  eur: "EUR", usd: "USD", gbp: "GBP", chf: "CHF", jpy: "JPY", inr: "INR", sek: "SEK", dkk: "DKK", nok: "NOK", pln: "PLN", cad: "CAD", aud: "AUD",
};
const CUR = "€|\\$|£|¥|₹|zł|kr|EUR|USD|GBP|CHF|JPY|INR|SEK|DKK|NOK|PLN|CAD|AUD"; // symbols + ISO codes
// amount with 2 decimals, currency optional on either side: "€ 1.234,56", "1,234.56 USD"
const MONEY_RX = new RegExp(`(${CUR})?\\s*(\\d{1,3}(?:[.,]\\d{3})*[.,]\\d{2})(?!\\d)\\s*(${CUR})?`, "gi");
// currency-MARKED amount, decimals optional: "$200", "€1.234" — the currency marker
// is required so we never mistake a quantity, year or "500 GB" for money.
const CUR_MONEY_RX = new RegExp(`(${CUR})\\s*(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})?)(?!\\d)|(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})?)\\s*(${CUR})\\b`, "gi");
const TOTAL_STRONG = /(zu zahlender betrag|gesamtbetrag|rechnungsbetrag|rechnungssumme|gesamtsumme|endbetrag|grand total|total due|total amount|amount due|balance due|amount payable|total payable|payment total|total \(?incl|total ttc|montant total|importe total|totale|total to pay|you paid|amount paid)/i;
const TOTAL_WEAK = /(gesamt|\btotal\b|\bsumme\b|brutto|zu zahlen|\bamount\b|\bpaid\b|\bbetrag\b)/i;
const TOTAL_NEG = /(netto|zwischensumme|sub-?total|mw-?st|u-?st\b|\bvat\b|\btax\b|steuer|excl|ohne|net amount|wechselkurs|exchange rate)/i;
// top-of-invoice "amount due" form many SaaS print before the line items (which may
// run past page 2): "$15.00 USD due August 21, 2025". The amount precedes "due".
const TOTAL_DUE = /\d[.,]\d{2}\s*(?:€|\$|£|eur|usd|gbp)?\s+due\b/i;

type MoneyHit = { amount: number; currency: string };
function moneyOnLine(line: string): MoneyHit[] {
  const out: MoneyHit[] = [];
  const push = (numStr: string | undefined, sym: string) => {
    if (numStr == null) return;
    const amt = parseMoney(numStr);
    if (amt != null) out.push({ amount: amt, currency: CUR_SYM[sym.toLowerCase()] || "" });
  };
  for (const m of line.matchAll(MONEY_RX)) push(m[2], m[1] || m[3] || "");
  for (const m of line.matchAll(CUR_MONEY_RX)) push(m[2] ?? m[3], m[1] || m[4] || "");
  return out;
}

/** Grand total + its currency, anchored on total-labels; the amount may sit on the
 *  next line (label/value split) and "$amount … due" headers count as strong. */
function findTotal(lines: string[]): MoneyHit | null {
  let best: { hit: MoneyHit; score: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A strong label ("Gesamtbetrag inkl. MwSt") IS the total even if it names tax;
    // the negative filter only demotes weak labels (net / subtotal / tax rows).
    const strong = TOTAL_STRONG.test(line) || TOTAL_DUE.test(line);
    if (!strong && (TOTAL_NEG.test(line) || !TOTAL_WEAK.test(line))) continue;
    const score = strong ? 3 : 2;
    let hits = moneyOnLine(line);
    if (!hits.length && i + 1 < lines.length) hits = moneyOnLine(lines[i + 1]); // value on the line below the label
    if (!hits.length) continue;
    const hit = hits.reduce((a, b) => (b.amount > a.amount ? b : a)); // grand total is the largest on its line
    // Prefer a strong-labelled total over a weak one; among equally-strong totals
    // keep the FIRST (the invoice's headline "Gesamtsumme"), so a later second-period
    // breakdown (another "Gesamtsumme") doesn't override it. Among weak ones, largest.
    let replace = false;
    if (!best) replace = true;
    else if (score > best.score) replace = true;
    else if (score === best.score) replace = score === 3 ? false : hit.amount > best.hit.amount;
    if (replace) best = { hit, score };
  }
  return best?.hit ?? null;
}

const INV_RX = /(?:rechnungs?-?\s*(?:nummer|nr)\.?|invoice\s*(?:number|no|#)\.?|beleg-?\s*(?:nummer|nr)\.?|rg-?\s*nr\.?|document\s*(?:number|no)\.?|receipt\s*(?:number|no)\.?|order\s*(?:number|no|#)\.?|facture\s*(?:n[o°]|#)?|ref(?:erence)?\.?\s*(?:no|number|#)?)\s*[:#.]?\s*([A-Za-z0-9][A-Za-z0-9/_.\-]{1,40})/i;
const DATE_STRONG = /(rechnungsdatum|datum der rechnung|rechnung vom|invoice date|bill date|date of issue|date paid|belegdatum|ausstellungsdatum|issued on|issue date|date de facture|fecha)\s*[:#]?\s*([^\n]{0,28})/i;
const DATE_WEAK = /\b(datum|date|vom)\b\s*[:#]?\s*([^\n]{0,28})/i;

/** Brand from any known ALIASES token in the text (longest match wins: AWS over Amazon). */
function detectProvider(text: string, aliases: Record<string, string> = ALIASES): string {
  const hay = text.toLowerCase();
  for (const k of Object.keys(aliases).sort((a, b) => b.length - a.length)) {
    if (hay.includes(k)) return aliases[k];
  }
  return "";
}

// Lines in an invoice header that are NOT the issuer's name: document titles,
// the bill-to block, labels, addresses, contact/tax lines.
const HEADER_SKIP = /\b(invoice|rechnung|receipt|quittung|bill(?:ing|ed)?|kunde|customer|sold to|ship to|rechnung an|rechnungsempf|datum|date|page|seite|vat|ust|tax|tel\.?|fax|e-?mail|iban|bic|swift|order|bestell|amount|total|betrag|summe)\b/i;
// A legal form in a header line is a strong signal it's the issuer's name.
const COMPANY_HINT = /\b(gmbh|mbh|inc|incorporated|ltd|limited|llc|l\.l\.c|co\.|kg|ohg|gbr|ag|s\.?a\.?|b\.?v\.?|n\.?v\.?|sarl|s\.r\.l|s\.l|ug|e\.k|plc|oy|ab|as|pte|corporation|company)\b/i;
/**
 * Best-effort issuer name for a vendor not in ALIASES: the first near-the-top line
 * that NAMES A LEGAL ENTITY (carries GmbH/Inc/Ltd/…) and isn't the bill-to party.
 * Only a FALLBACK for the filename — it never marks extraction `complete`.
 */
// A German street line ("Musterstrasse 1", "Bahnhofstraße 12a"): a street
// keyword + house number, optionally followed by a "12345 City" block. Used to peel
// an address off the front of a header line so it doesn't become the company name.
const STREET_RX = /^.*?(?:stra(?:ß|ss)e|str\.?|weg|allee|platz|ring|gasse|damm|ufer|chaussee)\s*\d+[a-z]?\b\s*,?\s*/i;
const ZIP_CITY_RX = /^\d{5}\s+[A-Za-zÄÖÜäöüß.\-]+(?:\s+(?:am|an|der|ob|im)\s+[A-Za-zÄÖÜäöüß.\-]+)?\s+/;

/** Strip a leading street and/or "12345 City" block from a header fragment. */
function stripAddress(s: string): string {
  return s.replace(STREET_RX, "").replace(ZIP_CITY_RX, "").trim();
}

function guessProviderFromHeader(lines: string[], customer: string): string {
  const cust = customer ? canon(customer).toLowerCase() : "";
  for (const raw of lines.slice(0, 14)) {
    // Scan every whitespace-separated column, not just the first: the issuer name
    // can sit beside or right after the bill-to address on the same line.
    for (const col of raw.trim().split(/\s{2,}/)) {
      const name = stripAddress(col.trim()) || col.trim();     // peel a leading address ("…-Str. 7 Acme GmbH" → "Acme GmbH")
      if (name.length < 3 || name.length > 50) continue;
      if (!COMPANY_HINT.test(name)) continue;                  // require a legal-entity signal
      if (/@|https?:|www\./i.test(name)) continue;             // email / url line
      if (HEADER_SKIP.test(name)) continue;                    // title / bill-to / meta line
      if (cust && canon(name).toLowerCase() === cust) continue; // the recipient, not the issuer
      return name;
    }
  }
  return "";
}

const CUR_FALLBACK: [RegExp, string][] = [
  [/€|\beur\b/i, "EUR"], [/\$|\busd\b/i, "USD"], [/£|\bgbp\b/i, "GBP"],
  [/\bchf\b|\bfr\.?\b/i, "CHF"], [/¥|\bjpy\b/i, "JPY"], [/₹|\binr\b/i, "INR"],
];

export type Extraction = { fields: Fields; complete: boolean };

/**
 * Best-effort deterministic extraction of the six invoice fields from PDF text.
 * `complete` is true only when provider (a recognized brand), date and total were
 * all found — the signal the UI uses to skip the model. `customer` is excluded so
 * the bill-to party is never mistaken for the provider.
 */
export function extractFields(text: string, customer = ""): Extraction {
  const lines = text.split(/\r?\n/);

  // A recognized brand is the "known" provider; only this gates `complete`.
  let known = detectProvider(text);
  if (known && customer && known === canon(customer)) known = ""; // never the bill-to party
  // For unknown vendors fall back to a header guess so the filename is still useful;
  // because `complete` ignores the guess, the model (when on) still runs to do better.
  const provider = known || guessProviderFromHeader(lines, customer);

  const dateStrong = DATE_STRONG.exec(text);
  const dateWeak = dateStrong ? null : DATE_WEAK.exec(text);
  let date = dateStrong ? parseDateAt(dateStrong[2]) : dateWeak ? parseDateAt(dateWeak[2]) : "";
  if (!date) date = parseDateAt(text); // any date as a last resort

  const total = findTotal(lines);

  const invM = INV_RX.exec(text);
  let invoice_number = invM ? invM[1].replace(/[.,;:]+$/, "") : "";
  // Reject digit-less captures — these are label fragments (e.g. "IN" grabbed from
  // "Invoice number IN…"), never real invoice numbers, which always carry a digit.
  if (invoice_number && !/\d/.test(invoice_number)) invoice_number = "";

  const doc_type =
    /gutschrift|credit note|credit memo/i.test(text) ? "credit_note" :
    /quittung|\breceipt\b|kassenbon/i.test(text) ? "receipt" :
    /kontoauszug|account statement/i.test(text) ? "statement" : "invoice";

  const currency = total?.currency || (CUR_FALLBACK.find(([rx]) => rx.test(text))?.[1] ?? "");

  const fields: Fields = {
    provider,
    date,
    doc_type,
    invoice_number,
    currency,
    total: total ? String(total.amount) : "",
  };
  const complete = !!known && !!date && !!fields.total;
  return { fields, complete };
}

/**
 * Destination relative path for a renamed/extracted PDF: a file is renamed
 * within its own (sub)folder; a zip entry is extracted next to the .zip.
 * `sep` lets us unit-test Windows + POSIX joining deterministically.
 */
export function targetPath(root: string, src: Src, proposed: string, sep = "/"): string {
  const j = (...parts: string[]) => parts.filter(Boolean).join(sep).replace(/[\/\\]+/g, sep);
  const originRel = src.kind === "file" ? src.path : src.zip;
  const folder = originRel.includes("/") || originRel.includes("\\")
    ? originRel.replace(/[\/\\][^\/\\]*$/, "")
    : "";
  return folder ? j(root, folder, proposed) : j(root, proposed);
}

/**
 * Collision-safe target names: appends -2, -3, … when two rows
 * would land on the same filename (e.g. a re-downloaded duplicate).
 */
export function dedupeNames(proposed: string[]): string[] {
  const seen = new Map<string, number>();
  return proposed.map((name) => {
    if (!name) return name;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n === 0) return name;
    const dot = name.lastIndexOf(".");
    return `${name.slice(0, dot)}-${n + 1}${name.slice(dot)}`;
  });
}

export type MissingEntry = {
  provider: string;
  first: string;
  last: string;
  have: string[];
  missing: string[];
  cadenceKnown: boolean;
};

/**
 * Monthly-cadence gap detection per provider over the rows we extracted.
 * This is the FALLBACK "missing" heuristic, used only when no statement is
 * selected. The statement-driven matcher (matchStatement) is the primary signal.
 */
export function inferMissing(rows: Pick<Row, "provider" | "date">[]): MissingEntry[] {
  const byProvider = new Map<string, Set<string>>();
  for (const r of rows) {
    const ym = (r.date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    if (!byProvider.has(r.provider)) byProvider.set(r.provider, new Set());
    byProvider.get(r.provider)!.add(ym);
  }
  const out: MissingEntry[] = [];
  for (const [provider, set] of [...byProvider].sort()) {
    const have = [...set].sort();
    if (have.length < 2) {
      out.push({ provider, first: have[0] ?? "", last: have[0] ?? "", have, missing: [], cadenceKnown: false });
      continue;
    }
    const first = have[0], last = have[have.length - 1];
    const missing: string[] = [];
    let [y, m] = first.split("-").map(Number);
    while (`${y}-${String(m).padStart(2, "0")}` <= last) {
      const ym = `${y}-${String(m).padStart(2, "0")}`;
      if (!set.has(ym)) missing.push(ym);
      m++; if (m > 12) { m = 1; y++; }
    }
    out.push({ provider, first, last, have, missing, cadenceKnown: true });
  }
  return out;
}

// ---------- credit-card / account statement matching (the primary "missing" signal) ----------

/** One transaction line parsed from a statement (by a @kah/parsers bank parser). */
export type Charge = {
  date: string;        // YYYY-MM-DD (or "")
  merchant: string;    // raw description as printed on the statement
  amount: number;      // principal in the merchant's original currency — matches the invoice
  currency: string;    // 3-letter code or ""
  bookedEur?: number;  // EUR actually booked incl. fees (foreign charges); fallback for matching
};

export type MatchResult = {
  /** a charge linked to one or more invoice PDFs (split); `fx` is set only when
   *  the link rests on a plausible exchange rate rather than an equal total */
  matched: { charge: Charge; rows: Row[]; fx?: { currency: string; rate: number } }[];
  missing: Charge[];          // on the statement, but no invoice PDF in the folder
  unmatchedInvoices: Row[];   // invoice PDFs in the folder not tied to any charge (informational)
};

/**
 * Drop duplicate statement charges. Two charges are "the same" when provider
 * (canon'd merchant), date and amount match — and, if both carry a transaction
 * id, that id too. The first occurrence wins, preserving statement order and
 * object identity so existing per-charge lookups keep working.
 */
export function dedupeCharges<T extends Charge>(charges: T[]): T[] {
  const seen = new Map<string, T>();
  const out: T[] = [];
  for (const c of charges) {
    const id = (c as { id?: string }).id;
    const base = `${canon(c.merchant)}|${c.date}|${c.amount.toFixed(2)}|${c.currency}`;
    const key = id ? `${base}|#${id}` : base;
    if (seen.has(key)) continue;
    seen.set(key, c);
    out.push(c);
  }
  return out;
}

/**
 * Find a subset (size 2..maxSize) of `vals` summing to `target` (±0.01), e.g. an
 * Amazon charge split across two invoices. Returns the chosen indices or null.
 */
function findCombo(vals: number[], target: number, maxSize = 4): number[] | null {
  const order = vals.map((_, i) => i).sort((a, b) => vals[b] - vals[a]); // desc → prune overshoot early
  const dfs = (pos: number, picked: number[], sum: number): number[] | null => {
    if (picked.length >= 2 && Math.abs(sum - target) <= 0.01) return picked.slice();
    if (picked.length >= maxSize) return null;
    for (let p = pos; p < order.length; p++) {
      const i = order[p];
      if (sum + vals[i] > target + 0.01) continue; // all positive → overshoot can't recover
      picked.push(i);
      const r = dfs(p + 1, picked, sum + vals[i]);
      if (r) return r;
      picked.pop();
    }
    return null;
  };
  return dfs(0, [], 0);
}

function tokens(s: string): string[] {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((t) => t.length > 1);
}

/** Fraction of the provider's tokens that also appear in the (raw + canon'd) merchant string. */
function merchantProviderScore(merchant: string, provider: string): number {
  const hay = new Set([...tokens(merchant), ...tokens(canon(merchant))]);
  const need = tokens(provider);
  if (!hay.size || !need.length) return 0;
  let hit = 0;
  for (const t of need) if (hay.has(t)) hit++;
  return hit / need.length;
}

/**
 * Plausible EUR value of one unit of a foreign currency. A foreign charge is
 * often booked in EUR only — the statement never prints the original principal —
 * so no total can ever line up with an invoice denominated in USD/GBP/…. The
 * implied rate is then the only link left. Bands are deliberately wide: they
 * exist to rule out nonsense (a 25 USD invoice for an 18 EUR charge), not to pin
 * down the day's rate, and they must absorb the card's ~1.5% Fremdwährungsentgelt,
 * which pushes the booked EUR above a clean conversion.
 */
const FX_BAND: Record<string, [number, number]> = {
  USD: [0.78, 1.05], GBP: [1.00, 1.35], CHF: [0.85, 1.15],
  CAD: [0.58, 0.82], AUD: [0.50, 0.75], NZD: [0.48, 0.72],
  JPY: [0.0050, 0.0090], SEK: [0.075, 0.110], NOK: [0.075, 0.110],
  DKK: [0.128, 0.142], PLN: [0.19, 0.27], CZK: [0.034, 0.046],
  HUF: [0.0021, 0.0031], INR: [0.0090, 0.0140], SGD: [0.58, 0.78],
};
// Unknown currency: only rule out the absurd. Safe because an FX link also
// demands a provider hit and a nearby date.
const FX_FALLBACK: [number, number] = [0.5, 1.5];

/** What the bank actually debited in EUR, if we know it at all. Null for a
 *  foreign charge whose statement never printed the EUR side. */
export function eurValueOf(c: Charge): number | null {
  if (c.bookedEur != null) return c.bookedEur;
  return (c.currency || "EUR").toUpperCase() === "EUR" ? c.amount : null;
}

function daysApart(a: string, b: string): number {
  if (!ISO.test(a) || !ISO.test(b)) return 365; // unknown dates: neutral, capped
  return Math.min(365, Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000);
}

/**
 * Match each statement charge to at most one folder invoice. The amount is the
 * primary key (statement merchant strings are noisy, e.g. "PADDLE.NET* ANTHROPIC"),
 * so a candidate must have an equal total (±0.01) and a compatible currency.
 * Among equal-amount candidates, the best provider/merchant token overlap wins,
 * tie-broken by date proximity. Charges with no candidate are reported missing.
 */
export function matchStatement(charges: Charge[], rows: Row[]): MatchResult {
  const consumed = new Set<number>();
  const matched: MatchResult["matched"] = [];
  const pending: Charge[] = [];

  // Pass 1 — single invoice with an equal total (amount or, for foreign charges,
  // the booked EUR). Build every candidate (charge, invoice) pair, then assign
  // greedily by BEST score first (not charge order).
  const edges: { ci: number; ri: number; score: number }[] = [];
  charges.forEach((charge, ci) => {
    rows.forEach((r, ri) => {
      const total = parseFloat(r.total);
      if (!isFinite(total)) return;
      const hit = Math.abs(total - charge.amount) <= 0.01
        || (charge.bookedEur != null && Math.abs(total - charge.bookedEur) <= 0.01);
      if (!hit) return;
      const sameCur = !!charge.currency && !!r.currency && charge.currency.toUpperCase() === r.currency.toUpperCase();
      const diffCur = !!charge.currency && !!r.currency && !sameCur;
      const score = merchantProviderScore(charge.merchant, r.provider) * 10
        + (sameCur ? 2 : 0) - (diffCur ? 1 : 0)
        - daysApart(charge.date, r.date) / 365;
      edges.push({ ci, ri, score });
    });
  });
  edges.sort((a, b) => b.score - a.score);
  const chargeUsed = new Set<number>();
  for (const e of edges) {
    if (chargeUsed.has(e.ci) || consumed.has(e.ri)) continue;
    chargeUsed.add(e.ci); consumed.add(e.ri);
    matched.push({ charge: charges[e.ci], rows: [rows[e.ri]] });
  }
  charges.forEach((c, ci) => { if (!chargeUsed.has(ci)) pending.push(c); });

  // Pass 2 — split charges: a subset of the SAME provider's remaining invoices
  // summing to the charge (e.g. one Amazon charge = two Amazon invoices).
  let stillMissing: Charge[] = [];
  for (const charge of pending) {
    const provider = canon(charge.merchant);
    const cand = rows.map((r, i) => i).filter(i => !consumed.has(i) && rows[i].provider === provider && isFinite(parseFloat(rows[i].total)));
    let combo: number[] | null = null;
    if (cand.length >= 2) {
      const vals = cand.map(i => parseFloat(rows[i].total));
      for (const target of [charge.amount, ...(charge.bookedEur != null ? [charge.bookedEur] : [])]) {
        combo = findCombo(vals, target, 4);
        if (combo) break;
      }
    }
    if (combo) {
      const chosen = combo.map(k => cand[k]);
      chosen.forEach(i => consumed.add(i));
      matched.push({ charge, rows: chosen.map(i => rows[i]) });
    } else {
      stillMissing.push(charge);
    }
  }

  // Pass 3 — one invoice covering SEVERAL same-provider charges that sum to its
  // total (threshold billing, e.g. one monthly Google Ads invoice paid off by
  // several card debits). Links that single invoice to each charge it covers.
  for (let ri = 0; ri < rows.length; ri++) {
    if (consumed.has(ri)) continue;
    const inv = rows[ri];
    const total = parseFloat(inv.total);
    if (!isFinite(total) || inv.provider === "Unknown") continue;
    const candK = stillMissing.map((c, k) => k).filter(k => canon(stillMissing[k].merchant) === inv.provider);
    if (candK.length < 2) continue;
    let combo: number[] | null = null;
    for (const valOf of [(c: Charge) => c.amount, (c: Charge) => c.bookedEur ?? c.amount]) {
      combo = findCombo(candK.map(k => valOf(stillMissing[k])), total, 4);
      if (combo) break;
    }
    if (!combo) continue;
    consumed.add(ri);
    const chosen = new Set(combo.map(j => candK[j]));
    chosen.forEach(k => matched.push({ charge: stillMissing[k], rows: [inv] }));
    stillMissing = stillMissing.filter((_, k) => !chosen.has(k));
  }

  // Pass 4 — foreign-currency fallback, LAST so every exact reading wins first.
  // The charge carries EUR only (18,15 €) while the invoice is denominated in
  // another currency (20 $), so no total can ever line up. Link them when the
  // implied rate is plausible — but only with a provider hit and a nearby date,
  // because a rate band alone is far too weak to link on.
  const fxEdges: { k: number; ri: number; score: number; rate: number }[] = [];
  stillMissing.forEach((charge, k) => {
    const eur = eurValueOf(charge);
    if (eur == null || eur <= 0) return;
    const chargeCur = (charge.currency || "EUR").toUpperCase();
    rows.forEach((r, ri) => {
      if (consumed.has(ri)) return;
      const total = parseFloat(r.total);
      if (!isFinite(total) || total <= 0) return;
      const cur = (r.currency || "").toUpperCase();
      if (!cur || cur === "EUR" || cur === chargeCur) return; // same currency → pass 1 already had its chance
      const prov = merchantProviderScore(charge.merchant, r.provider);
      if (prov <= 0) return;                                  // never guess across vendors
      const days = daysApart(charge.date, r.date);
      if (days > 40) return;
      const rate = eur / total;
      const [lo, hi] = FX_BAND[cur] ?? FX_FALLBACK;
      if (rate < lo || rate > hi) return;
      fxEdges.push({ k, ri, score: prov * 10 - days / 40, rate });
    });
  });
  fxEdges.sort((a, b) => b.score - a.score);
  const fxUsed = new Set<number>();
  for (const e of fxEdges) {
    if (fxUsed.has(e.k) || consumed.has(e.ri)) continue;
    fxUsed.add(e.k); consumed.add(e.ri);
    const inv = rows[e.ri];
    matched.push({ charge: stillMissing[e.k], rows: [inv], fx: { currency: (inv.currency || "").toUpperCase(), rate: e.rate } });
  }
  stillMissing = stillMissing.filter((_, k) => !fxUsed.has(k));

  const unmatchedInvoices = rows.filter((_, i) => !consumed.has(i));
  return { matched, missing: stillMissing, unmatchedInvoices };
}

// ---------- grouping: collapse charges that belong together ----------

export type ChargeStatusKind = "matched" | "missing" | "no_invoice";

/** Minimal shape needed to group report rows that belong together. */
export interface Groupable {
  merchant: string; // raw statement descriptor (carries any account id)
  amount: number;
  currency: string;
  status: ChargeStatusKind;
  /** identifier of the matched invoice(s); a shared value groups matched charges. */
  invoice?: string;
}

export interface ChargeGroup<T extends Groupable> {
  key: string;
  items: T[];
  sum: number; // summed original-currency amount
  currency: string;
  status: ChargeStatusKind | "mixed";
}

/**
 * Collapse items that clearly belong together so recurring split payments read as
 * one line: matched charges paid by the SAME invoice PDF(s), or still-missing
 * charges that share a provider + embedded account id (e.g. several Google Ads
 * debits across different months under the same customer number). Everything else
 * stays a group of one. Statement order is preserved (first occurrence wins).
 */
export function groupRelated<T extends Groupable>(items: T[]): ChargeGroup<T>[] {
  const groups: ChargeGroup<T>[] = [];
  const byKey = new Map<string, ChargeGroup<T>>();
  for (const item of items) {
    let key = "";
    if (item.status === "matched" && item.invoice) key = `inv:${item.invoice}`;
    else if (item.status === "missing") {
      const id = merchantId(item.merchant);
      if (id) key = `id:${canon(item.merchant)}:${id}`;
    }
    const existing = key ? byKey.get(key) : undefined;
    if (existing) {
      existing.items.push(item);
      existing.sum += item.amount;
      continue;
    }
    const g: ChargeGroup<T> = {
      key: key || `solo:${groups.length}`,
      items: [item],
      sum: item.amount,
      currency: item.currency,
      status: item.status,
    };
    groups.push(g);
    if (key) byKey.set(key, g);
  }
  for (const g of groups) {
    g.status = g.items.every((i) => i.status === "matched")
      ? "matched"
      : g.items.every((i) => i.status === "no_invoice")
        ? "no_invoice"
        : g.items.every((i) => i.status !== "matched")
          ? "missing"
          : "mixed";
  }
  return groups;
}

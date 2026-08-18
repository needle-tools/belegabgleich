import { test, expect } from "bun:test";
import { canon, slug, buildProposed, dedupeNames, dedupeCharges, inferMissing, targetPath, matchStatement, isStatementFile, marketplaceSeller, merchantId, extractFields, groupRelated, findDuplicates, chargeKey, type Row, type Charge, type Groupable } from "./core";

// Minimal Row factory for matching tests (only the matched fields matter).
const row = (p: Partial<Row> & { provider: string; total: string }): Row => ({
  date: "", doc_type: "invoice", invoice_number: "", currency: "EUR",
  rel: `${p.provider}.pdf`, src: { kind: "file", path: `${p.provider}.pdf` },
  proposed: "", hasText: true, ...p,
});

test("canon maps known aliases incl. legal-entity drift", () => {
  expect(canon("Backblaze")).toBe("Backblaze");
  expect(canon("OpenRouter, Inc")).toBe("OpenRouter");
  expect(canon("Civilized Discourse Construction Kit, Inc.")).toBe("Discourse");
  expect(canon("CDCK")).toBe("Discourse");
  expect(canon("IKEA Deutschland GmbH & Co. KG")).toBe("IKEA");
});

test("canon resolves noisy/mangled statement merchant strings to brands", () => {
  expect(canon("CLOUDFLARE.COUS")).toBe("Cloudflare");
  expect(canon("WWW.HEROKU.COUS")).toBe("Heroku");
  expect(canon("BACKBLAZE.COMUS")).toBe("Backblaze");
  expect(canon("BYTEPLUS BYTEPLUS.COM SG")).toBe("BytePlus");
  expect(canon("GITHUB, INC. GITHUB.COM")).toBe("GitHub");
  expect(canon("SLACK T05MN2LUCUE DUBLIN IE")).toBe("Slack");
  expect(canon("CLAUDE.AI SUBSCRIPTION")).toBe("Claude");
  expect(canon("Hetzner Online GmbH")).toBe("Hetzner");
  expect(canon("APPLE.COM/BILL-ITUNES.COM-IE")).toBe("Apple");
});

test("merchantId extracts a shared account id (and ignores masked card numbers)", () => {
  expect(merchantId("GOOGLE*ADS1234567890 CC GOOGLE.COMIE")).toBe("1234567890");
  expect(merchantId("Google ADS1234567890 DUBLIN 4 IE")).toBe("1234567890");      // same id, different text
  expect(merchantId("SAALESPARKASSE VISA NR. 123456XXXXXX1234 EINZUG")).toBe(""); // masked → no 8+ run
  expect(merchantId("RESEND RESEND.COM US")).toBe("");
});

test("marketplaceSeller surfaces the creator behind an aggregator charge", () => {
  expect(marketplaceSeller("GUMROAD* JANE DOE GUMROAD.COM US")).toBe("Jane Doe");
  expect(marketplaceSeller("GUMROAD* GUMROAD.COM US")).toBe("");        // no seller token
  expect(marketplaceSeller("GITHUB, INC. GITHUB.COM")).toBe("");        // not a marketplace
  expect(marketplaceSeller("CLOUDFLARE.COUS")).toBe("");
});

test("canon separates Google Ads / Google Cloud (both bank text variants) from generic Google", () => {
  expect(canon("GOOGLE*ADS1234567890 CC GOOGLE.COMIE")).toBe("Google Ads");
  expect(canon("Google ADS1234567890 DUBLIN 4 IE")).toBe("Google Ads");
  expect(canon("GOOGLE*CLOUD ABCDEF CC GOOGLE.COMIE")).toBe("Google Cloud");
  expect(canon("Google CLOUD ABCDEF Dublin IE")).toBe("Google Cloud");
});

test("extractFields pulls provider/date/total from a German invoice (no AI)", () => {
  const text = [
    "GitHub, Inc.",
    "88 Colin P Kelly Jr Street, San Francisco",
    "Rechnung an: Muster GmbH",
    "Rechnungsnummer: INV-2026-0042",
    "Rechnungsdatum: 20.03.2026",
    "Fälligkeitsdatum: 03.04.2026",
    "Zwischensumme (netto): 100,00 EUR",
    "MwSt 19%: 19,00 EUR",
    "Gesamtbetrag: 119,00 EUR",
  ].join("\n");
  const { fields, complete } = extractFields(text, "Muster");
  expect(fields.provider).toBe("GitHub");
  expect(fields.date).toBe("2026-03-20");          // invoice date, not the due date
  expect(fields.total).toBe("119");                // grand total, not the net or the tax line
  expect(fields.currency).toBe("EUR");
  expect(fields.invoice_number).toBe("INV-2026-0042");
  expect(complete).toBe(true);
});

test("extractFields keeps a strong total line even when it names the tax", () => {
  const text = "Cloudflare\nRechnungsdatum: 02.05.2026\nNettobetrag: 50,00 EUR\nGesamtbetrag inkl. 19% MwSt: 59,50 EUR";
  const { fields } = extractFields(text);
  expect(fields.total).toBe("59.5");   // not the 50,00 net line
});

test("extractFields handles an English invoice with $ and named month", () => {
  const text = [
    "Stripe Payments Europe, Ltd.",
    "Invoice number  ABC-001",
    "Date of issue  March 5, 2026",
    "Subtotal  $1,200.00",
    "Total  $1,234.56",
  ].join("\n");
  const { fields, complete } = extractFields(text);
  expect(fields.provider).toBe("Stripe");
  expect(fields.date).toBe("2026-03-05");
  expect(fields.total).toBe("1234.56");
  expect(fields.currency).toBe("USD");
  expect(complete).toBe(true);
});

test("extractFields reads a top-of-invoice 'amount due' line (total runs past page 2)", () => {
  const text = "Cloudflare, Inc.\nDate of issue August 21, 2025\n$15.00 USD due August 21, 2025\nContainer Egress  0 $0.00";
  const { fields, complete } = extractFields(text);
  expect(fields.provider).toBe("Cloudflare");
  expect(fields.total).toBe("15");
  expect(fields.currency).toBe("USD");
  expect(complete).toBe(true);
});

test("extractFields reads an integer currency total on the line below the label", () => {
  const text = "Gumroad, Inc.\nDate\nMar 17, 2025\nPro Plugin License\n$200\nPayment Total\n$200\nVISA *7890";
  const { fields, complete } = extractFields(text);
  expect(fields.provider).toBe("Gumroad");
  expect(fields.total).toBe("200");
  expect(fields.currency).toBe("USD");
  expect(complete).toBe(true);
});

test("extractFields picks the headline Gesamtsumme, not a later second-period one (Google Ads invoice)", () => {
  const text = "Google Ireland Limited\nRechnung\nRechnungsnummer: 5594725016\nDetails    Google Ads\nRechnungsdatum: 31. Mai 2026\nGesamtsumme in EUR\n1,85 €\nÜbersicht\nBetrag in EUR    1,79 €\nGesamtsumme in EUR    1,85 €\nZwischensumme in EUR    8,65 €\nGesamtsumme in EUR\n8,65 €";
  const { fields } = extractFields(text);
  expect(fields.provider).toBe("Google Ads");
  expect(fields.total).toBe("1.85");           // headline total, not the 8.65 breakdown
  expect(fields.invoice_number).toBe("5594725016");
});

test("extractFields ignores a digit-less invoice-number fragment (Cloudflare 'Invoice number IN')", () => {
  const text = "Cloudflare\nInvoice\nInvoice number IN    \nJan 21, 2026\nTotal $15.00 USD";
  const { fields } = extractFields(text);
  expect(fields.invoice_number).toBe("");           // "IN" rejected (no digit)
  expect(fields.provider).toBe("Cloudflare");
});

test("extractFields reads the total of an already-settled invoice, not its zero balance", () => {
  // A usage invoice that was paid on issue: the amount owed now is 0,00, but what
  // the bank debited is the invoice total. Taking the zero left every such Beleg
  // unmatchable, whatever its date.
  const text = [
    "INVOICE",
    "Notion Labs, Inc.    Invoice # INV-000000001",
    "Invoice Date  Feb 09, 2026",
    "Terms Due Upon Receipt",
    "Currency USD",
    "QUANTITY DESCRIPTION RATE AMOUNT",
    "Automation Usage    11.11 $1.00 $11.11",
    "SUBTOTAL: $11.11",
    "TAX: $0.00",
    "INVOICE TOTAL: $11.11",
    "APPLIED TRANSACTIONS:",
    "P-00000001 Feb 16, 2026 -$11.11",
    "BALANCE DUE: $0.00",
  ].join("\n");
  const { fields, complete } = extractFields(text);
  expect(fields.provider).toBe("Notion");
  expect(fields.date).toBe("2026-02-09");
  expect(fields.total).toBe("11.11");   // not the 0.00 balance due
  expect(fields.currency).toBe("USD");
  expect(complete).toBe(true);

  // …and with that figure the charge links, even 10 days off the invoice date.
  const rows = [row({ ...fields, provider: "Notion", date: fields.date })];
  const r = matchStatement([{ date: "2026-02-19", merchant: "NOTION LABS NOTION.SO US", amount: 11.11, currency: "USD" }], rows);
  expect(r.matched).toHaveLength(1);
  expect(r.missing).toHaveLength(0);
});

test("extractFields marks unknown-vendor / missing fields incomplete (→ AI fallback)", () => {
  const a = extractFields("Some random text with no recognizable brand or amounts.");
  expect(a.complete).toBe(false);
  const b = extractFields("GitHub\nRechnungsdatum: 01.02.2026\nVielen Dank!");
  expect(b.fields.provider).toBe("GitHub");
  expect(b.complete).toBe(false);
});

test("extractFields guesses an unknown issuer from a legal-entity header (fallback name, not complete)", () => {
  const text = "Musterhosting GmbH    Bill to\nFriedrichstr. 1, Berlin\nRechnungsdatum: 04.06.2026\nGesamtbetrag: 49,90 EUR";
  const { fields, complete } = extractFields(text, "Muster");
  expect(fields.provider).toBe("Musterhosting GmbH"); // header fallback fills the name…
  expect(fields.total).toBe("49.9");
  expect(complete).toBe(false);                        // …but unknown brand → model still runs
  expect(extractFields("Acme Tagline\nTotal 10,00 EUR\nDatum 04.06.2026").fields.provider).toBe("");
});

test("extractFields handles GBP and DD/MM/YYYY", () => {
  const text = "Hetzner Online GmbH\nInvoice date 04/06/2026\nTotal due £1,234.56";
  const { fields } = extractFields(text);
  expect(fields.provider).toBe("Hetzner");
  expect(fields.date).toBe("2026-06-04");
  expect(fields.total).toBe("1234.56");
  expect(fields.currency).toBe("GBP");
});

test("dedupeCharges drops provider+date+amount repeats, keeps the first", () => {
  const c = (m: string, date: string, amount: number, extra: Partial<Charge> = {}): Charge =>
    ({ merchant: m, date, amount, currency: "EUR", ...extra });
  const dupAcrossStatements = [
    c("GITHUB, INC. GITHUB.COM", "2026-04-01", 10),
    c("Acme GmbH", "2026-04-02", 5),
    c("GitHub", "2026-04-01", 10), // same provider (canon'd)/date/amount → duplicate
  ];
  const out = dedupeCharges(dupAcrossStatements);
  expect(out.length).toBe(2);
  expect(out[0].merchant).toBe("GITHUB, INC. GITHUB.COM"); // first occurrence wins
  expect(out.map(x => x.merchant)).not.toContain("GitHub");

  const withIds = [
    { ...c("Amazon", "2026-04-03", 20), id: "A1" },
    { ...c("Amazon", "2026-04-03", 20), id: "A2" },
  ];
  expect(dedupeCharges(withIds).length).toBe(2);
  expect(dedupeCharges([withIds[0], { ...withIds[0] }]).length).toBe(1);

  expect(dedupeCharges([c("Stripe", "2026-04-04", 9), c("Stripe", "2026-04-04", 9.5)]).length).toBe(2);
});

test("canon strips legal suffixes for unknown vendors", () => {
  expect(canon("Acme Widgets GmbH")).toBe("Acme-Widgets");
  expect(canon("")).toBe("Unknown");
});

test("canon maps placeholder/non-answers to Unknown (no bogus 'N/A-…' name)", () => {
  for (const v of ["N/A", "n/a", "NA", "N.A.", "none", "null", "unknown", "Unbekannt", "keine", "-", "?"])
    expect(canon(v)).toBe("Unknown");
  expect(buildProposed({ provider: "N/A", date: "2023-12-04", doc_type: "", invoice_number: "", currency: "", total: "" })).toBe("");
});

test("slug drops Rechnung label and sanitizes", () => {
  expect(slug("Rechnung-ABC123_45")).toBe("ABC123_45");
  expect(slug("INV-0004")).toBe("INV-0004");
});

test("buildProposed: <Company>-<date>-<invoice#>", () => {
  expect(buildProposed({ provider: "OpenRouter", date: "2026-02-18", doc_type: "invoice", invoice_number: "INV-0003", currency: "USD", total: "10.80" }))
    .toBe("OpenRouter-2026-02-18-INV-0003.pdf");
});

test("buildProposed: no invoice number → just <Company>-<date>", () => {
  expect(buildProposed({ provider: "GitHub", date: "2025-09-21", doc_type: "receipt", invoice_number: "", currency: "USD", total: "5.20" }))
    .toBe("GitHub-2025-09-21.pdf");
});

test("buildProposed: missing date falls back to nodate", () => {
  expect(buildProposed({ provider: "IKEA", date: "", doc_type: "invoice", invoice_number: "", currency: "EUR", total: "32.97" }))
    .toBe("IKEA-nodate.pdf");
});

test("buildProposed returns no suggestion when the provider is unknown", () => {
  expect(buildProposed({ provider: "", date: "2025-09-21", doc_type: "invoice", invoice_number: "", currency: "EUR", total: "5" }))
    .toBe("");
});

test("targetPath: file renames within its own (sub)folder", () => {
  expect(targetPath("C:\\root", { kind: "file", path: "a.pdf" }, "new.pdf", "\\"))
    .toBe("C:\\root\\new.pdf");
  expect(targetPath("C:\\root", { kind: "file", path: "sub\\a.pdf" }, "new.pdf", "\\"))
    .toBe("C:\\root\\sub\\new.pdf");
});

test("targetPath: zip entry is extracted next to the .zip", () => {
  expect(targetPath("C:\\root", { kind: "zip", zip: "sub\\arch.zip", entry: "x.pdf" }, "new.pdf", "\\"))
    .toBe("C:\\root\\sub\\new.pdf");
  expect(targetPath("/root", { kind: "zip", zip: "arch.zip", entry: "x.pdf" }, "new.pdf", "/"))
    .toBe("/root/new.pdf");
});

test("findDuplicates spots one invoice filed into two month folders", () => {
  const rows = [
    row({ provider: "Hetzner", total: "188.01", date: "2026-03-19", invoice_number: "R0001", rel: "03/Hetzner.pdf" }),
    row({ provider: "Hetzner", total: "188.01", date: "2026-03-19", invoice_number: "R0001", rel: "04/Hetzner.pdf" }),
    row({ provider: "Hetzner", total: "188.01", date: "2026-04-19", invoice_number: "R0002", rel: "04/Hetzner-April.pdf" }),
  ];
  const dups = findDuplicates(rows);
  expect(dups).toHaveLength(1);
  expect(dups[0].map((r) => r.rel)).toEqual(["03/Hetzner.pdf", "04/Hetzner.pdf"]);
});

test("findDuplicates ignores the same file seen twice, and won't guess", () => {
  const same = row({ provider: "GitHub", total: "21", date: "2026-02-01", rel: "a/x.pdf" });
  expect(findDuplicates([same, { ...same }])).toEqual([]);       // one file, read twice
  // Nothing identifying extracted → never called a duplicate.
  const vague = row({ provider: "", total: "", date: "", rel: "b/y.pdf" });
  expect(findDuplicates([vague, { ...vague, rel: "c/z.pdf" }])).toEqual([]);
});

test("dedupeNames suffixes collisions", () => {
  expect(dedupeNames(["a.pdf", "a.pdf", "b.pdf", "a.pdf"]))
    .toEqual(["a.pdf", "a-2.pdf", "b.pdf", "a-3.pdf"]);
});

test("inferMissing finds monthly gaps", () => {
  const m = inferMissing([
    { provider: "OpenRouter", date: "2026-01-19" },
    { provider: "OpenRouter", date: "2026-02-18" },
    { provider: "OpenRouter", date: "2026-03-03" },
    { provider: "OpenRouter", date: "2026-06-08" },
  ]);
  expect(m).toHaveLength(1);
  expect(m[0].missing).toEqual(["2026-04", "2026-05"]);
  expect(m[0].cadenceKnown).toBe(true);
});

test("inferMissing flags single-statement providers as unknown cadence", () => {
  const m = inferMissing([{ provider: "IKEA", date: "2026-01-22" }]);
  expect(m[0].cadenceKnown).toBe(false);
  expect(m[0].missing).toEqual([]);
});

test("matchStatement: equal amount + currency links a charge to its invoice", () => {
  const rows = [row({ provider: "OpenRouter", total: "10.80", currency: "USD", date: "2026-02-18" })];
  const r = matchStatement([{ date: "2026-02-17", merchant: "OPENROUTER INC", amount: 10.8, currency: "USD" }], rows);
  expect(r.matched).toHaveLength(1);
  expect(r.matched[0].rows[0].rel).toBe("OpenRouter.pdf");
  expect(r.missing).toHaveLength(0);
  expect(r.unmatchedInvoices).toHaveLength(0);
});

test("matchStatement: recurring same-amount charges pair by date (Feb invoice → Feb charge, not Jan)", () => {
  const rows = [row({ provider: "Resend", total: "20.00", currency: "USD", date: "2026-02-15" })];
  const charges: Charge[] = [
    { date: "2026-01-15", merchant: "RESEND RESEND.COM US", amount: 20, currency: "USD" },
    { date: "2026-02-15", merchant: "RESEND RESEND.COM US", amount: 20, currency: "USD" },
  ];
  const r = matchStatement(charges, rows);
  expect(r.matched).toHaveLength(1);
  expect(r.matched[0].charge.date).toBe("2026-02-15"); // the Feb charge wins the only Feb invoice
  expect(r.missing.map(c => c.date)).toEqual(["2026-01-15"]);
});

test("matchStatement: a charge splits across multiple same-provider invoices (89 + 84.68 = 173.68)", () => {
  const rows = [
    row({ provider: "Amazon", total: "89", date: "2025-10-14", rel: "a1.pdf", src: { kind: "file", path: "a1.pdf" } }),
    row({ provider: "Amazon", total: "84.68", date: "2025-10-09", rel: "a2.pdf", src: { kind: "file", path: "a2.pdf" } }),
  ];
  const r = matchStatement([{ date: "2025-10-08", merchant: "WWW.AMAZON.* LUXEMBOURG LU", amount: 173.68, currency: "EUR" }], rows);
  expect(r.matched).toHaveLength(1);
  expect(r.matched[0].rows).toHaveLength(2);
  expect(r.missing).toHaveLength(0);
  expect(r.unmatchedInvoices).toHaveLength(0);
});

test("matchStatement: one invoice covers several same-provider charges summing to its total (Google Ads 12.50 + 7.50 = 20)", () => {
  const rows = [row({ provider: "Google Ads", total: "20", currency: "EUR", date: "2026-03-01", rel: "ads.pdf", src: { kind: "file", path: "ads.pdf" } })];
  const charges = [
    { date: "2026-03-01", merchant: "GOOGLE*ADS1234567890 CC GOOGLE.COMIE", amount: 12.5, currency: "EUR" },
    { date: "2026-02-26", merchant: "Google ADS1234567890 DUBLIN 4 IE", amount: 7.5, currency: "EUR" },
  ];
  const r = matchStatement(charges, rows);
  expect(r.missing).toHaveLength(0);
  expect(r.matched).toHaveLength(2);                                  // both charges linked…
  expect(r.matched.every(m => m.rows.length === 1 && m.rows[0].rel === "ads.pdf")).toBe(true); // …to the one invoice
  expect(r.unmatchedInvoices).toHaveLength(0);
});

test("matchStatement: foreign charge matches the invoice's original-currency principal", () => {
  const rows = [row({ provider: "GitHub", total: "5.20", currency: "USD" })];
  const charge: Charge = { date: "2026-09-22", merchant: "GITHUB, INC. GITHUB.COM", amount: 5.2, currency: "USD", bookedEur: 4.5 };
  expect(matchStatement([charge], rows).matched).toHaveLength(1);
});

test("matchStatement: bookedEur is a fallback when the model swaps the two amounts", () => {
  const rows = [row({ provider: "GitHub", total: "5.20", currency: "USD" })];
  const charge: Charge = { date: "2026-09-22", merchant: "GITHUB", amount: 4.5, currency: "EUR", bookedEur: 5.2 };
  expect(matchStatement([charge], rows).matched).toHaveLength(1);
});

test("matchStatement: a charge with no matching invoice is reported missing", () => {
  const rows = [row({ provider: "IKEA", total: "32.97" })];
  const r = matchStatement([{ date: "2026-03-01", merchant: "ANTHROPIC", amount: 18.0, currency: "EUR" }], rows);
  expect(r.missing).toHaveLength(1);
  expect(r.missing[0].merchant).toBe("ANTHROPIC");
  expect(r.matched).toHaveLength(0);
  expect(r.unmatchedInvoices).toHaveLength(1); // the IKEA invoice was never claimed
});

test("matchStatement: equal-amount tie is broken by merchant/provider overlap", () => {
  const rows = [
    row({ provider: "Anthropic", total: "20.00", date: "2026-05-10" }),
    row({ provider: "Backblaze", total: "20.00", date: "2026-05-10" }),
  ];
  const r = matchStatement([{ date: "2026-05-09", merchant: "PADDLE.NET* ANTHROPIC", amount: 20, currency: "EUR" }], rows);
  expect(r.matched).toHaveLength(1);
  expect(r.matched[0].rows[0].provider).toBe("Anthropic");
  expect(r.unmatchedInvoices.map((x) => x.provider)).toEqual(["Backblaze"]);
});

test("matchStatement: currency is a preference, not a hard gate (EUR/USD may differ)", () => {
  const rows = [row({ provider: "Gumroad", total: "9.00", currency: "USD" })];
  const r = matchStatement([{ date: "2026-01-05", merchant: "GUMROAD", amount: 9, currency: "EUR" }], rows);
  expect(r.matched).toHaveLength(1);
  expect(r.missing).toHaveLength(0);
});

test("matchStatement: same-currency invoice wins over a differing-currency one", () => {
  const rows = [
    row({ provider: "Gumroad A", total: "9.00", currency: "USD" }),
    row({ provider: "Gumroad B", total: "9.00", currency: "EUR" }),
  ];
  const r = matchStatement([{ date: "2026-01-05", merchant: "GUMROAD", amount: 9, currency: "EUR" }], rows);
  expect(r.matched[0].rows[0].provider).toBe("Gumroad B");
});

// --- running accounts: the debit settles the PREVIOUS period ---

const GCLOUD = `Google Cloud
Zusammenfassung für den Zeitraum 1. Juli 2026–31. Juli 2026
Anfangsguthaben vom 1. Juli 2026    22,33 €
Neue Aktivitäten insgesamt    24,01 €
Erhaltene Zahlungen insgesamt    -22,33 €
Endsaldo in EUR    24,01 €`;

test("extractFields keeps the settled prior balance alongside the total", () => {
  const { fields, altTotals } = extractFields(GCLOUD);
  expect(fields.total).toBe("24.01");   // the document's own figure is unchanged
  expect(altTotals).toEqual([22.33]);   // …and the balance it pays off is kept too
});

test("extractFields reports no carried amount for an ordinary invoice", () => {
  const { altTotals } = extractFields("Hetzner Online GmbH\nRechnungsdatum 04.06.2026\nGesamtbetrag 188,01 €");
  expect(altTotals).toEqual([]);
});

test("matchStatement links a charge that pays off the prior balance", () => {
  const { fields, altTotals } = extractFields(GCLOUD);
  const rows = [row({ ...fields, provider: "Google Cloud", date: "2026-07-31", altTotals })];
  const r = matchStatement(
    [{ date: "2026-07-01", merchant: "GOOGLE*CLOUD 1234 CC GOOGLE.COMIE", amount: 22.33, currency: "EUR" }],
    rows,
  );
  expect(r.matched).toHaveLength(1);
  expect(r.missing).toHaveLength(0);
});

test("matchStatement prefers the invoice whose OWN total is the charge", () => {
  // Both July's PDF (carries 22,33 as a prior balance) and June's (total 22,33)
  // are in the folder. June's must win — it is what that debit actually paid.
  const rows = [
    row({ provider: "Google Cloud", total: "24.01", date: "2026-07-31", rel: "juli.pdf", altTotals: [22.33] }),
    row({ provider: "Google Cloud", total: "22.33", date: "2026-06-30", rel: "juni.pdf" }),
  ];
  const r = matchStatement(
    [{ date: "2026-07-01", merchant: "GOOGLE*CLOUD 1234 CC GOOGLE.COMIE", amount: 22.33, currency: "EUR" }],
    rows,
  );
  expect(r.matched[0].rows[0].rel).toBe("juni.pdf");
});

test("matchStatement will not link a carried balance across vendors", () => {
  const rows = [row({ provider: "Backblaze", total: "24.01", date: "2026-07-31", altTotals: [22.33] })];
  const r = matchStatement(
    [{ date: "2026-07-01", merchant: "GOOGLE*CLOUD 1234 CC GOOGLE.COMIE", amount: 22.33, currency: "EUR" }],
    rows,
  );
  expect(r.matched).toHaveLength(0);
  expect(r.missing).toHaveLength(1);
});

// --- foreign currency the statement never spelled out (pass 4) ---

test("matchStatement: EUR-only charge links to a USD invoice via a plausible rate", () => {
  const rows = [row({ provider: "fal.ai", total: "20.00", currency: "USD", date: "2026-06-18" })];
  const r = matchStatement([{ date: "2026-06-18", merchant: "FAL-FEATURES-LABELS-FAL.AI-US", amount: 18.15, currency: "EUR" }], rows);
  expect(r.matched).toHaveLength(1);
  expect(r.matched[0].fx?.currency).toBe("USD");
  expect(r.matched[0].fx?.rate).toBeCloseTo(0.9075, 4);
  expect(r.missing).toHaveLength(0);
});

test("matchStatement: an implausible rate is left missing rather than force-matched", () => {
  const rows = [row({ provider: "fal.ai", total: "60.00", currency: "USD", date: "2026-06-18" })];
  const r = matchStatement([{ date: "2026-06-18", merchant: "FAL.AI", amount: 18.15, currency: "EUR" }], rows);
  expect(r.matched).toHaveLength(0);      // 0,3025 €/USD is nonsense
  expect(r.missing).toHaveLength(1);
});

test("matchStatement: a rate link never crosses vendors", () => {
  const rows = [row({ provider: "Backblaze", total: "20.00", currency: "USD", date: "2026-06-18" })];
  const r = matchStatement([{ date: "2026-06-18", merchant: "FAL.AI", amount: 18.15, currency: "EUR" }], rows);
  expect(r.matched).toHaveLength(0);
  expect(r.unmatchedInvoices).toHaveLength(1);
});

test("matchStatement: a rate link needs a nearby date", () => {
  const rows = [row({ provider: "fal.ai", total: "20.00", currency: "USD", date: "2026-01-02" })];
  const r = matchStatement([{ date: "2026-06-18", merchant: "FAL.AI", amount: 18.15, currency: "EUR" }], rows);
  expect(r.matched).toHaveLength(0);
});

test("matchStatement: an exact total beats a merely plausible rate", () => {
  const rows = [
    row({ provider: "fal.ai", total: "20.00", currency: "USD", date: "2026-06-18", rel: "rate.pdf" }),
    row({ provider: "fal.ai", total: "18.15", currency: "EUR", date: "2026-06-18", rel: "exact.pdf" }),
  ];
  const r = matchStatement([{ date: "2026-06-18", merchant: "FAL.AI", amount: 18.15, currency: "EUR" }], rows);
  expect(r.matched).toHaveLength(1);
  expect(r.matched[0].rows[0].rel).toBe("exact.pdf");
  expect(r.matched[0].fx).toBeUndefined();
});

test("matchStatement: JPY and GBP invoices use their own rate bands", () => {
  const gbp = matchStatement(
    [{ date: "2026-06-18", merchant: "MONZO", amount: 23.4, currency: "EUR" }],
    [row({ provider: "Monzo", total: "20.00", currency: "GBP", date: "2026-06-18" })],
  );
  expect(gbp.matched).toHaveLength(1);   // 1,17 €/GBP
  const jpy = matchStatement(
    [{ date: "2026-06-18", merchant: "PIXIV", amount: 19.5, currency: "EUR" }],
    [row({ provider: "Pixiv", total: "3000", currency: "JPY", date: "2026-06-18" })],
  );
  expect(jpy.matched).toHaveLength(1);   // 0,0065 €/JPY
});

test("isStatementFile recognizes Kontoauszug + ABRECHNUNG names", () => {
  expect(isStatementFile("Konto_1234567890-Auszug_2025_0010.pdf")).toBe(true);
  expect(isStatementFile("1234_7890_ABRECHNUNG_2025-10-18_Name.PDF")).toBe(true);
  expect(isStatementFile("github-receipt.pdf")).toBe(false);
});

test("isStatementFile matches Kreditkartenabrechnung names, not vendor invoices", () => {
  expect(isStatementFile("1234_5678_ABRECHNUNG_2026-04-18_Mustermann_Max.PDF")).toBe(true);
  expect(isStatementFile("a.zip › 0001_9999_ABRECHNUNG_2026-01-02_Mustermann.pdf")).toBe(true);
  expect(isStatementFile("Kreditkartenabrechnung_2026-03.pdf")).toBe(true);
  expect(isStatementFile("Abrechnung_Q1.pdf")).toBe(true);
  expect(isStatementFile("Stromabrechnung_2026.pdf")).toBe(false);
  expect(isStatementFile("2026-05-18_Discourse_invoice_184C7AD0.pdf")).toBe(false);
});

// --- links the user drew by hand ---

test("matchStatement: a manual link beats the amount, which is the point of it", () => {
  // The invoice says 16,05 (its own total); the booking is 14,90 because a credit
  // was applied. No automatic reading can pair these — the user can.
  const rows = [row({ provider: "GitHub", total: "16.05", currency: "USD", date: "2026-04-22", rel: "gh.pdf" })];
  const charge: Charge = { date: "2026-05-02", merchant: "GITHUB, INC. GITHUB.COM", amount: 14.9, currency: "USD" };
  const auto = matchStatement([charge], rows);
  expect(auto.matched).toHaveLength(0);

  const linked = matchStatement([charge], rows, [{ charge: chargeKey(charge), rel: "gh.pdf" }]);
  expect(linked.matched).toHaveLength(1);
  expect(linked.matched[0].manual).toBe(true);
  expect(linked.missing).toHaveLength(0);
  expect(linked.unmatchedInvoices).toHaveLength(0);
});

test("matchStatement: a manual link takes its invoice away from the automatic match", () => {
  const rows = [row({ provider: "Resend", total: "20.00", currency: "USD", date: "2026-02-15", rel: "r.pdf" })];
  const feb: Charge = { date: "2026-02-15", merchant: "RESEND RESEND.COM US", amount: 20, currency: "USD" };
  const jan: Charge = { date: "2026-01-15", merchant: "RESEND RESEND.COM US", amount: 20, currency: "USD" };
  // Left alone, the invoice goes to the February charge (same date). Told otherwise,
  // it goes to January and February is the one reported missing.
  expect(matchStatement([jan, feb], rows).matched[0].charge.date).toBe("2026-02-15");
  const linked = matchStatement([jan, feb], rows, [{ charge: chargeKey(jan), rel: "r.pdf" }]);
  expect(linked.matched).toHaveLength(1);
  expect(linked.matched[0].charge.date).toBe("2026-01-15");
  expect(linked.missing.map((c) => c.date)).toEqual(["2026-02-15"]);
});

test("matchStatement: a stale manual link is ignored, not fatal", () => {
  const rows = [row({ provider: "Hetzner", total: "188.01", rel: "h.pdf" })];
  const charge: Charge = { date: "2026-03-19", merchant: "HETZNER ONLINE GMBH", amount: 188.01, currency: "EUR" };
  // Points at a file that is no longer loaded → the automatic match still happens.
  const r = matchStatement([charge], rows, [{ charge: chargeKey(charge), rel: "weg.pdf" }]);
  expect(r.matched).toHaveLength(1);
  expect(r.matched[0].manual).toBeUndefined();
});

test("matchStatement: one invoice is consumed by only one charge", () => {
  const rows = [row({ provider: "AWS", total: "5.00", currency: "USD" })];
  const charges = [
    { date: "2026-01-10", merchant: "AWS", amount: 5, currency: "USD" },
    { date: "2026-02-10", merchant: "AWS", amount: 5, currency: "USD" },
  ];
  const r = matchStatement(charges, rows);
  expect(r.matched).toHaveLength(1);
  expect(r.missing).toHaveLength(1); // second identical charge has no invoice left
});

// ---------- groupRelated ----------

const g = (merchant: string, amount: number, status: Groupable["status"], invoice?: string): Groupable =>
  ({ merchant, amount, currency: "EUR", status, ...(invoice ? { invoice } : {}) });

test("groupRelated combines recurring same-account missing charges across months", () => {
  const groups = groupRelated([
    g("GOOGLE*ADS1234567890 CC GOOGLE.COMIE", 100, "missing"),
    g("Google ADS1234567890 DUBLIN 4 IE", 50, "missing"), // same account id, different month/text
    g("RESEND RESEND.COM US", 20, "missing"),
  ]);
  expect(groups).toHaveLength(2); // the two Google Ads collapse; Resend stays solo
  const combined = groups.find((x) => x.items.length > 1)!;
  expect(combined.items).toHaveLength(2);
  expect(combined.sum).toBeCloseTo(150);
  expect(combined.status).toBe("missing");
});

test("groupRelated groups matched charges paid by one shared invoice", () => {
  const groups = groupRelated([
    g("GOOGLE*ADS1 CC", 30, "matched", "Google-Ads-2026-03.pdf"),
    g("GOOGLE*ADS1 CC", 70, "matched", "Google-Ads-2026-03.pdf"),
    g("Hetzner", 50, "matched", "Hetzner-2026-03.pdf"),
  ]);
  expect(groups).toHaveLength(2);
  expect(groups[0].items).toHaveLength(2);
  expect(groups[0].sum).toBeCloseTo(100);
  expect(groups[0].status).toBe("matched");
});

test("groupRelated keeps no_invoice and one-off rows solo", () => {
  const groups = groupRelated([
    g("LOHN / GEHALT", 3000, "no_invoice"),
    g("LOHN / GEHALT", 3000, "no_invoice"), // payroll is never chased for a Beleg
    g("OPENAI OPENAI.COM US", 24, "missing"), // only one of its vendor
  ]);
  expect(groups).toHaveLength(3);
});

test("groupRelated collects a vendor's open charges even without an account id", () => {
  // Five months of the same subscription: one group you can drop five PDFs onto,
  // not five rows to click through. No id in the descriptor is no longer a reason
  // to leave them scattered.
  const groups = groupRelated([
    g("OPENAI OPENAI.COM US", 20, "missing"),
    g("HETZNER ONLINE GMBH hetzner.com", 188.01, "missing"),
    g("OPENAI OPENAI.COM US", 20, "missing"),
    g("OPENAI OPENAI.COM US", 40, "missing"),
  ]);
  expect(groups).toHaveLength(2);
  const openai = groups.find((x) => x.items.length > 1)!;
  expect(openai.items).toHaveLength(3);
  expect(openai.sum).toBeCloseTo(80);
});

test("groupRelated still splits one vendor's charges across different accounts", () => {
  const groups = groupRelated([
    g("GOOGLE*ADS1111111111 CC GOOGLE.COMIE", 10, "missing"),
    g("GOOGLE*ADS1111111111 CC GOOGLE.COMIE", 20, "missing"),
    g("GOOGLE*ADS2222222222 CC GOOGLE.COMIE", 30, "missing"),
  ]);
  expect(groups).toHaveLength(2);
  expect(groups.map((x) => x.items.length)).toEqual([2, 1]);
});

test("groupRelated never lumps unidentified vendors together", () => {
  const groups = groupRelated([
    g("N/A", 10, "missing"),
    g("keine", 20, "missing"),
  ]);
  expect(groups).toHaveLength(2);
});

test("extractFields strips a street address glued onto the header company name", () => {
  const text = "Musterstrasse 1 Muster GmbH\nRechnungsdatum: 10.03.2026\nGesamtbetrag: 17,00 EUR";
  expect(extractFields(text).fields.provider).toBe("Muster GmbH"); // not "Musterstrasse 1 Muster GmbH"
});

test("extractFields strips street + zip/city before the issuer (Logitech invoice)", () => {
  // single-column join
  expect(extractFields("Musterstrasse 1 LOGITECH UK LIMITED\nRechnungsdatum: 06.03.2026\nGesamtbetrag: 12,00 EUR").fields.provider)
    .toBe("LOGITECH UK LIMITED");
  // address with zip + city in front of the issuer
  expect(extractFields("Musterstrasse 1, 12345 Musterstadt LOGITECH UK LIMITED\nRechnungsdatum: 06.03.2026\nTotal 12,00 EUR").fields.provider)
    .toBe("LOGITECH UK LIMITED");
});

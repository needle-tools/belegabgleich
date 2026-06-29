/**
 * Generates the two demo statement PDFs in public/demo/.
 *
 * FAITHFUL REPLICAS of a Saalesparkasse Kontoauszug / VISA Kreditkartenabrechnung:
 * the layout mirrors the originals (reproduced from their extracted text
 * geometry), but the document is rebuilt from scratch — it contains NONE of the
 * original content stream — and every personal field is FABRICATED.
 *
 * Numbers are chosen to read like a healthy, growing company and are computed
 * here so the statements always balance (credits − debits, VISA total = the
 * card settlement on the account statement). Still parses via @kah/parsers.
 *
 * Run:  node packages/web/scripts/gen-demo-pdfs.mjs
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "public", "demo");
mkdirSync(outDir, { recursive: true });

const W = 595.28, H = 841.89;
const dark = rgb(0.1, 0.1, 0.1);
const gray = rgb(0.42, 0.45, 0.42);
const green = rgb(0.34, 0.6, 0.2);
const line = rgb(0.74, 0.79, 0.74);

// ---- number helpers (German formatting; everything computed so it balances) --
const round2 = (n) => Math.round(n * 100) / 100;
function de(n) {
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + d;
}
const kontoAmt = (n) => (n < 0 ? "-" : "") + de(n);        // credit: "28.500,00"  debit: "-2.400,00"
const visaAmt = (n) => de(n) + (n < 0 ? "-" : "+");        // "676,53-" / "0,00+"
const kurs = (k) => k.toFixed(6).replace(".", ",");

// foreign card charge: EUR booked = conversion + 1.5% Auslandseinsatz fee
function foreign(usd, k) {
  const conv = round2(usd / k);
  const fee = round2(conv * 0.015);
  return { usd, k, fee, line: round2(conv + fee) };
}

async function newDoc() {
  const doc = await PDFDocument.create();
  return { doc, HE: await doc.embedFont(StandardFonts.Helvetica), HB: await doc.embedFont(StandardFonts.HelveticaBold) };
}
function mk(page, HE, HB) {
  const L = (x, y, t, o = {}) => page.drawText(t, { x, y, size: o.size ?? 9, font: o.bold ? HB : HE, color: o.color ?? dark });
  const R = (xr, y, t, o = {}) => { const f = o.bold ? HB : HE; L(xr - f.widthOfTextAtSize(t, o.size ?? 9), y, t, o); };
  const rule = (x1, x2, y, c = line) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: c });
  const logo = (x, y) => page.drawRectangle({ x, y, width: 13, height: 16, color: green, opacity: 0.9 });
  return { L, R, rule, logo };
}

// ---- VISA charges (public SaaS vendors; amounts fabricated) -----------------
const visaCharges = [
  { bd: "19.09.", ld: "18.09.", m: "GITHUB, INC. GITHUB.COM US", f: foreign(21.0, 1.142) },
  { bd: "22.09.", ld: "19.09.", m: "HETZNER ONLINE GMBH hetzner.com", eur: 188.01 },
  { bd: "22.09.", ld: "21.09.", m: "CLOUDFLARE CLOUDFLARE.COUS", f: foreign(25.0, 1.16) },
  { bd: "22.09.", ld: "21.09.", m: "CLAUDE.AI SUBSCRIPTION ANTHROPIC.COMUS", eur: 100.0 },
  { bd: "29.09.", ld: "26.09.", m: "BACKBLAZE INC BACKBLAZE.COMUS", f: foreign(41.2, 1.15) },
  { bd: "02.10.", ld: "01.10.", m: "GOOGLE*CLOUD 3QVCTG CC GOOGLE.COMIE", eur: 142.8 },
  { bd: "09.10.", ld: "08.10.", m: "OPENAI OPENAI.COM US", f: foreign(120.0, 1.118) },
  { bd: "17.10.", ld: "17.10.", m: "CLOUDFLARE CLOUDFLARE.COUS", f: foreign(80.0, 1.164) },
];
const visaSum = round2(visaCharges.reduce((s, c) => s + (c.f ? c.f.line : c.eur), 0));

// ---- Kontoauszug entries (a healthy October: solid income, real payroll) ----
const opening = 142380.55;
const kontoEntries = [
  { d: "01.10.2025", t: "Ueberweisungsgutschr.", a: 2776.38, det: ["STRIPE PAYOUT DEMO-REF-0001"] },
  { d: "02.10.2025", t: "Ueberweisungsgutschr.", a: 28500.0, det: ["ACME GMBH RECHNUNG R-2025-0142 PROJEKT DEMO"] },
  { d: "06.10.2025", t: "Lastschrifteinloesung", a: -149.9, det: ["Muster Hosting GmbH", "Rechnung DEMO-0064  Glaeubiger-ID: DE00ZZZ00000000000"] },
  { d: "08.10.2025", t: "Ueberweisungsgutschr.", a: 19750.0, det: ["CONTOSO AG PROJEKT DEMO-2025-09 ABSCHLAG"] },
  { d: "10.10.2025", t: "Lastschrifteinloesung", a: -179.0, det: ["Stadtwerke Musterstadt GmbH", "Vielen Dank DEMO-0064"] },
  { d: "15.10.2025", t: "Ueberweisung", a: -2400.0, det: ["Muster Immobilien GmbH", "Miete Buero 10/25 DEMO"] },
  { d: "20.10.2025", t: "Sammelueberw. Onl-Bank", a: -14800.0, det: ["LOHN / GEHALT 10/25 ANZAHL 6", "DATUM 20.10.2025, 15.13 UHR PMT-DEMO-000001"] },
  { d: "20.10.2025", t: "Sammelueberw. Onl-Bank", a: -772.13, det: ["Muster BKK Beitrag Oktober 2025 DEMO"] },
  { d: "20.10.2025", t: "Ueberweisungsgutschr.", a: 12300.0, det: ["GLOBEX SARL LIZENZ DEMO-2025 EU"] },
  { d: "22.10.2025", t: "Ueberweisung", a: -4980.0, det: ["FINANZAMT MUSTERSTADT 000/000/00000, 10/25 LST."] },
  { d: "23.10.2025", t: "Lastschrifteinloesung", a: -visaSum, det: ["SPARKASSE VISA NR. 0000 00XX XXXX 0000 EINZUG DES RECHNUNGSB 17.10"] },
];
const closing = round2(kontoEntries.reduce((s, e) => s + e.a, opening));

// ---------------------------------------------------------------- Kontoauszug
async function kontoauszug() {
  const { doc, HE, HB } = await newDoc();
  const page = doc.addPage([W, H]);
  const { L, R, rule, logo } = mk(page, HE, HB);
  const RX = 569;

  logo(44, 786);
  L(70.8, 788, "Sparkasse Musterstadt", { size: 16, bold: true });

  L(68.6, 650, "Muster GmbH", { size: 10 });
  L(68.6, 639, "Musterstrasse 1", { size: 10 });
  L(68.6, 628, "12345 Musterstadt", { size: 10 });

  for (const [i, t] of [
    "Ihr Ansprechpartner:", "Max Berater", "Abt. Firmenkundenmanagement",
    "Grosse Strasse 1", "12345 Musterstadt", "Telefon 0000 000-0000",
  ].entries()) L(385.5, 660 - i * 10.4, t, { size: 8, color: gray });
  L(385.5, 587.2, "service@sparkasse-muster.de", { size: 8, color: gray });

  L(486.5, 556.6, "1. November 2025", { size: 10 });
  L(68, 545.3, "Kontoauszug 10/2025", { size: 10, bold: true });
  L(512.3, 545.3, "Seite 1 von 1", { size: 10 });
  L(68, 533, "Geschaeftsgirokonto 1234567890, DE00 0000 0000 0000 0000 00", { size: 10 });

  L(70.9, 512, "Datum", { size: 10, bold: true });
  L(123.1, 512, "Erlaeuterung", { size: 10, bold: true });
  R(RX, 512, "Betrag EUR", { size: 10, bold: true });
  rule(68, RX, 507);

  let y = 495.7;
  L(123.3, y, "Kontostand am 30.09.2025, Auszug Nr. 9", { size: 10 });
  R(RX, y, de(opening), { size: 10 });
  y -= 21;

  for (const e of kontoEntries) {
    L(69.9, y, `${e.d} ${e.t}`, { size: 10 });
    R(RX, y, kontoAmt(e.a), { size: 10 });
    y -= 10.7;
    for (const d of e.det) { L(123.3, y, d, { size: 9, color: gray }); y -= 8.6; }
    y -= 6;
  }
  rule(68, RX, y + 2);
  y -= 12;
  L(123.3, y, "Kontostand am 30.10.2025", { size: 10, bold: true });
  R(RX, y, de(closing), { size: 10, bold: true });

  rule(68, RX, 60, line);
  const f = [
    ["Sparkasse Musterstadt", "Amtsgericht Musterstadt", "Telefon 0000 000-00", "SWIFT-Adresse (BIC): MUSTDEM0XXX"],
    ["Musterstrasse 5", "HRA 00000", "Telefax 0000 000-0000", "BLZ: 000 000 00"],
    ["12345 Musterstadt", "USt-ID: DE 000000000", "info@sparkasse-muster.de", "www.sparkasse-muster.de"],
  ];
  const fc = [69.4, 195.6, 344.4, 443.6];
  f.forEach((row, ri) => row.forEach((c, ci) => L(fc[ci], 52.7 - ri * 7.8, c, { size: 7.5, color: gray })));

  writeFileSync(resolve(outDir, "Kontoauszug-Demo.pdf"), await doc.save());
  console.log("wrote Kontoauszug-Demo.pdf  (opening", de(opening), "-> closing", de(closing) + ")");
}

// ---------------------------------------------------------- Kreditkarte (VISA)
async function visa() {
  const { doc, HE, HB } = await newDoc();
  const page = doc.addPage([W, H]);
  const { L, R, rule, logo } = mk(page, HE, HB);
  const RX = 563;

  logo(44, 786);
  L(70.8, 788, "Sparkasse Musterstadt", { size: 16, bold: true });
  L(70.8, 712, "Kreditkartenabrechnung - Sparkasse Musterstadt - 12345 Musterstadt", { size: 7, color: gray });

  L(354.3, 669.6, "Bitte pruefen Sie diese Abrechnung und teilen Sie uns", { size: 8, color: gray });
  L(354.3, 661.2, "Einwaende unverzueglich mit. Vielen Dank.", { size: 8, color: gray });
  L(354.3, 652.8, "Unsere Preise und Entgelte sind steuerbefreite", { size: 8, color: gray });
  L(354.3, 644.4, "Finanzdienstleistungen.", { size: 8, color: gray });

  L(70.8, 655.5, "Herrn", { size: 9 });
  L(202.8, 655.5, "00000/0", { size: 9 });
  L(70.8, 645.9, "Max Mustermann", { size: 9 });
  L(70.8, 636.3, "Musterstrasse 1", { size: 9 });
  L(70.8, 626.7, "12345 Musterstadt", { size: 9 });

  L(325.8, 588.9, "Ihre Umsaetze seit der letzten Jahres-", { size: 7, color: gray });
  L(325.8, 579.9, "preisberechnung: 7.640 EUR", { size: 7, color: gray });

  L(70.8, 542.1, "Duplikat der Abrechnung/Saldenmitteilung bis zum 18.10.2025", { size: 12, bold: true });
  L(70.8, 530.1, "VISA 0000 00XX XXXX 0000 - MAX MUSTERMANN MUSTER GMBH", { size: 9 });
  L(503.7, 492.9, "in EUR", { size: 9 });

  L(70.8, 516.6, "Buchungs-", { size: 6, color: gray });
  L(118.8, 516.6, "Kauf/Beleg-", { size: 6, color: gray });
  L(161.4, 513.6, "Leistungsbeschreibung", { size: 6, color: gray });
  L(334.2, 513.6, "Ort", { size: 6, color: gray });
  R(RX, 513.6, "Betrag", { size: 6, color: gray });
  L(70.8, 510.3, "Datum", { size: 6, color: gray });
  L(118.8, 510.3, "Datum", { size: 6, color: gray });
  rule(70.8, RX, 505);

  L(167.7, 474.9, "Saldovortrag vom 18.09.2025", { size: 9 });
  R(RX, 474.9, visaAmt(0), { size: 9 });

  let y = 456.9;
  for (const e of visaCharges) {
    const lineEur = e.f ? e.f.line : e.eur;
    L(77.7, y, e.bd, { size: 9 });
    L(119.7, y, e.ld, { size: 9 });
    L(167.7, y, e.m, { size: 9 });
    R(RX, y, visaAmt(-lineEur), { size: 9 });
    y -= 9;
    if (e.f) {
      L(191.7, y, `${de(e.f.usd)} USD, EURO-Kurs ${kurs(e.f.k)}`, { size: 9, color: gray }); y -= 9;
      L(191.7, y, `inkl. 1,50% Einsatz in Fremdwaehr. EUR ${de(e.f.fee)}`, { size: 9, color: gray }); y -= 9;
    }
    y -= 9;
  }

  L(479.7, y + 4, "--------------", { size: 9 });
  y -= 6;
  L(401.7, y, "VISA Summe", { size: 9, bold: true });
  R(RX, y, visaAmt(-visaSum), { size: 9, bold: true });
  y -= 9;
  L(167.7, y, "Einzug von Kto. 1234567890 BLZ 00000000", { size: 9 });
  R(RX, y, visaAmt(visaSum), { size: 9 });
  y -= 6;
  L(479.7, y, "--------------", { size: 9 });
  y -= 9;
  L(329.7, y, "Neuer VISA Gesamtsaldo", { size: 9 });
  R(RX, y, visaAmt(0), { size: 9 });

  L(70.8, 71.4, "USt-ID der Sparkasse: DE 000 000 000", { size: 9, color: gray });
  L(70.8, 61.8, "Bei Rueckfragen wenden Sie sich bitte an:", { size: 9, color: gray });
  L(70.8, 52.2, "qards GmbH, Postfach 000000, 00000 Musterstadt", { size: 9, color: gray });
  L(70.8, 23.4, "Telefon: 0000/0000-0000", { size: 9, color: gray });
  L(328.8, 15, "INT. ABRECHNUNGS-NR.: DEMO-0001", { size: 9, color: gray });

  writeFileSync(resolve(outDir, "Kreditkartenabrechnung-Demo.pdf"), await doc.save());
  console.log("wrote Kreditkartenabrechnung-Demo.pdf  (VISA Summe", de(visaSum) + ")");
}

// ----------------------------------------------- demo invoices (the matched set)
// Simple, parseable vendor invoices whose totals equal a demo charge, so the demo
// report shows a realistic mix (these matched, the rest still missing). All data
// fabricated. The remaining charges (OpenAI, the 2nd Cloudflare, Muster Hosting,
// Miete) are intentionally left WITHOUT an invoice so the picker has something to
// assign interactively.
const demoInvoices = [
  { file: "GitHub-2025-09-18.pdf", lines: ["GitHub, Inc.", "88 Colin P Kelly Jr Street, San Francisco, CA", "Receipt", "Receipt number DEMO-GH-0918", "Date paid September 18, 2025", "GitHub Team", "Total paid $21.00"] },
  { file: "Hetzner-2025-09-19.pdf", lines: ["Hetzner Online GmbH", "Industriestr. 25, 91710 Gunzenhausen", "Rechnung", "Rechnungsnummer: DEMO-HZ-0919", "Rechnungsdatum: 19.09.2025", "Dedicated Server", "Gesamtbetrag: 188,01 EUR"] },
  { file: "Cloudflare-2025-09-21.pdf", lines: ["Cloudflare, Inc.", "101 Townsend St, San Francisco, CA", "Invoice", "Invoice number DEMO-CF-0921", "Date September 21, 2025", "Pro Plan", "Total $25.00 USD"] },
  { file: "Anthropic-2025-09-21.pdf", lines: ["Anthropic, PBC", "Receipt", "Receipt number DEMO-AN-0921", "Date paid September 21, 2025", "Claude Max", "Amount paid 100,00 EUR"] },
  { file: "Backblaze-2025-09-25.pdf", lines: ["Backblaze, Inc.", "500 Ben Franklin Ct, San Mateo, CA", "Invoice number DEMO-BB-0925", "Date of issue September 25, 2025", "B2 Cloud Storage", "Total due $41.20"] },
  { file: "GoogleCloud-2025-10-01.pdf", lines: ["Google Cloud EMEA Limited", "Velasco, Clanwilliam Place, Dublin 2, Ireland", "Rechnung", "Rechnungsnummer: DEMO-GC-1001", "Rechnungsdatum: 01.10.2025", "Compute Engine", "Gesamtsumme in EUR 142,80 EUR"] },
  { file: "Stadtwerke-2025-10-10.pdf", lines: ["Stadtwerke Musterstadt GmbH", "Musterplatz 1, 12345 Musterstadt", "Rechnung", "Rechnungsnummer: DEMO-SW-1010", "Rechnungsdatum: 10.10.2025", "Strom & Wasser 10/2025", "Gesamtbetrag: 179,00 EUR"] },
];

async function invoices() {
  const dir = resolve(outDir, "invoices");
  mkdirSync(dir, { recursive: true });
  for (const inv of demoInvoices) {
    const { doc, HE } = await newDoc();
    const page = doc.addPage([W, H]);
    let y = 760;
    for (const l of inv.lines) { page.drawText(l, { x: 56, y, size: 11, font: HE, color: dark }); y -= 20; }
    writeFileSync(resolve(dir, inv.file), await doc.save());
  }
  console.log(`wrote ${demoInvoices.length} demo invoices -> ${dir}`);
}

await kontoauszug();
await visa();
await invoices();
console.log("done ->", outDir);

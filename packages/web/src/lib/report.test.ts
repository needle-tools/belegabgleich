import { test, expect } from "bun:test";
import { byAmountDesc, descriptorOf, fillInvoiceUrl, statementLabels, type ReportEntry } from "./report";

const row = (p: Partial<ReportEntry> & { provider: string; amount: number }): ReportEntry => ({
  date: "2026-06-18",
  currency: "EUR",
  status: "missing",
  ...p,
});

const order = (rows: ReportEntry[]) => [...rows].sort(byAmountDesc).map((r) => r.provider);

test("byAmountDesc puts the biggest booking first", () => {
  expect(order([
    row({ provider: "klein", amount: 18.15 }),
    row({ provider: "gross", amount: 2400 }),
    row({ provider: "mittel", amount: 149.9 }),
  ])).toEqual(["gross", "mittel", "klein"]);
});

test("byAmountDesc ranks by the booked EUR, not the vendor's currency", () => {
  // 3.000 ¥ is ~19 € — by raw amount it would tower over everything here.
  const rows = [
    row({ provider: "yen", amount: 3000, currency: "JPY", eur: 19.5 }),
    row({ provider: "euro", amount: 25, currency: "EUR", eur: 25 }),
    row({ provider: "dollar", amount: 20, currency: "USD", eur: 18.15 }),
  ];
  expect(order(rows)).toEqual(["euro", "yen", "dollar"]);
});

test("byAmountDesc falls back to the raw amount when no EUR side was printed", () => {
  const rows = [
    row({ provider: "bekannt", amount: 900, currency: "USD", eur: 40 }),
    row({ provider: "unbekannt", amount: 50, currency: "USD" }),
  ];
  expect(order(rows)).toEqual(["unbekannt", "bekannt"]);
});

test("statementLabels names a lone document by its kind", () => {
  const labels = statementLabels([{ rel: "Belege/10/Konto_1234567890-Auszug_2025_0010.pdf", label: "Kontoauszug" }]);
  expect(labels.get("Belege/10/Konto_1234567890-Auszug_2025_0010.pdf")).toBe("Kontoauszug");
});

test("statementLabels tells two same-kind statements apart by their trailing tokens", () => {
  // Both are "VISA-Abrechnung"; what distinguishes them is the cardholder at the end
  // of the filename, which is precisely what a leading truncation would eat.
  const labels = statementLabels([
    { rel: "1111_2222_ABRECHNUNG_2026-04-18_Mustermann_Max.pdf", label: "VISA-Abrechnung" },
    { rel: "3333_4444_ABRECHNUNG_2026-04-18_Beispiel_Erika.pdf", label: "VISA-Abrechnung" },
    { rel: "Konto_9999-Auszug_2026_0004.pdf", label: "Kontoauszug" },
  ]);
  expect(labels.get("1111_2222_ABRECHNUNG_2026-04-18_Mustermann_Max.pdf")).toBe("Mustermann Max");
  expect(labels.get("3333_4444_ABRECHNUNG_2026-04-18_Beispiel_Erika.pdf")).toBe("Beispiel Erika");
  expect(labels.get("Konto_9999-Auszug_2026_0004.pdf")).toBe("Kontoauszug"); // alone in its kind
});

test("statementLabels falls back to the filename when same-kind names are identical", () => {
  const labels = statementLabels([
    { rel: "a/Auszug.pdf", label: "Kontoauszug" },
    { rel: "b/Auszug.pdf", label: "Kontoauszug" },
  ]);
  expect(labels.get("a/Auszug.pdf")).toBe("Auszug");
});

test("descriptorOf keeps the statement's own words, but not a repeat of the brand", () => {
  expect(descriptorOf(row({ provider: "Google Ads", amount: 10, merchant: "GOOGLE*ADS1234567890 CC GOOGLE.COMIE" })))
    .toBe("GOOGLE*ADS1234567890 CC GOOGLE.COMIE");
  expect(descriptorOf(row({ provider: "Hetzner", amount: 10, merchant: "hetzner" }))).toBe("");
  expect(descriptorOf(row({ provider: "Hetzner", amount: 10 }))).toBe("");
});

test("fillInvoiceUrl aims a templated vendor link at the booking's date", () => {
  const amazon = "https://www.amazon.de/your-orders/orders?timeFilter=year-{YYYY}";
  expect(fillInvoiceUrl(amazon, "2026-03-14")).toBe("https://www.amazon.de/your-orders/orders?timeFilter=year-2026");
  expect(fillInvoiceUrl("https://x.test/{YYYY-MM}/{MM}", "2026-03-14")).toBe("https://x.test/2026-03/03");
  // no placeholder → untouched, and an unusable date still yields a valid link
  expect(fillInvoiceUrl("https://x.test/bills", "")).toBe("https://x.test/bills");
  expect(fillInvoiceUrl(amazon, "kaputt")).toContain("year-" + new Date().getFullYear());
});

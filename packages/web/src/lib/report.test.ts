import { test, expect } from "bun:test";
import { byAmountDesc, type ReportEntry } from "./report";

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

/**
 * Removing a single loaded document, without re-reading any PDF.
 *
 * These build a RunResult by hand rather than going through run(), which needs
 * real PDFs — removeDocument only reads statementSources/invoices/emptyPdfs and
 * rebuilds everything else, so that is exactly the surface worth pinning down.
 */
import { expect, test } from "bun:test";
import { removeDocument, type RunResult } from "./engine";

const charge = (merchant: string, date: string, amount: number) => ({
  merchant,
  date,
  amount,
  currency: "EUR",
});

const invoice = (provider: string, date: string, total: string, rel: string) => ({
  row: {
    provider,
    date,
    doc_type: "invoice",
    invoice_number: "1",
    currency: "EUR",
    total,
    rel,
    src: { kind: "file" as const, path: rel },
    proposed: rel,
    hasText: true,
  },
});

function base(): RunResult {
  return {
    entries: [],
    statements: [],
    parserIds: [],
    period: "",
    invoiceCount: 0,
    statementFiles: [],
    emptyPdfs: ["scan.pdf"],
    renames: [],
    charges: [],
    invoices: [],
    statementSources: [
      {
        rel: "konto.pdf",
        label: "Kontoauszug",
        parserId: "sparkasse",
        charges: [charge("HETZNER", "2026-03-14", 12.9)],
      },
      {
        rel: "visa.pdf",
        label: "VISA-Abrechnung",
        parserId: "sparkasse",
        charges: [charge("CLOUDFLARE", "2026-03-20", 25)],
      },
    ],
  } as RunResult;
}

test("removing a statement takes its own bookings with it", () => {
  const r = removeDocument(base(), "konto.pdf")!;
  expect(r.statementFiles).toEqual(["visa.pdf"]);
  expect(r.statements).toEqual(["VISA-Abrechnung"]);
  expect(r.charges.map((c) => c.merchant)).toEqual(["CLOUDFLARE"]);
  expect(r.entries.some((e) => e.merchant === "HETZNER")).toBe(false);
});

test("the other statement's bookings survive untouched", () => {
  const r = removeDocument(base(), "konto.pdf")!;
  expect(r.entries.some((e) => e.merchant === "CLOUDFLARE")).toBe(true);
});

test("removing the last statement returns null so the caller resets", () => {
  const one = removeDocument(base(), "konto.pdf")!;
  expect(removeDocument(one, "visa.pdf")).toBeNull();
});

test("removing an invoice releases the booking it covered", () => {
  const withInvoice = base();
  withInvoice.invoices = [invoice("Hetzner", "2026-03-14", "12.90", "hetzner.pdf")];

  // sanity: with the invoice present the charge is matched
  const before = removeDocument(withInvoice, "nothing-here.pdf")!;
  expect(before.entries.find((e) => e.merchant === "HETZNER")?.status).toBe("matched");

  const after = removeDocument(withInvoice, "hetzner.pdf")!;
  expect(after.invoiceCount).toBe(0);
  expect(after.entries.find((e) => e.merchant === "HETZNER")?.status).toBe("missing");
});

test("removing a text-less PDF drops it from the skipped list", () => {
  const r = removeDocument(base(), "scan.pdf")!;
  expect(r.emptyPdfs).toEqual([]);
  expect(r.statementFiles).toHaveLength(2); // nothing else disturbed
});

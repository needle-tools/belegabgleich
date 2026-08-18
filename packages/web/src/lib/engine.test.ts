/**
 * Removing a single loaded document, without re-reading any PDF.
 *
 * These build a RunResult by hand rather than going through run(), which needs
 * real PDFs — removeDocument only reads statementSources/invoices/emptyPdfs and
 * rebuilds everything else, so that is exactly the surface worth pinning down.
 */
import { expect, test } from "bun:test";
import { chargeKey } from "@kah/core";
import { linkManually, removeDocument, repointResult, unmatchEntry, type RunResult } from "./engine";
import type { CollectedPdf } from "./collect";

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

test("filing a dropped Beleg moves its row instead of adding a second one", () => {
  const dropped = base();
  dropped.invoices = [invoice("Hetzner", "2026-03-14", "12.90", "Rechnung.pdf")];
  const filed: CollectedPdf = {
    rel: "Belege/03/Hetzner-2026-03-14.pdf",
    src: { kind: "file", path: "Belege/03/Hetzner-2026-03-14.pdf" },
    data: new ArrayBuffer(0),
  };

  const r = repointResult(dropped, [{ from: "Rechnung.pdf", to: filed }]);
  expect(r.invoiceCount).toBe(1); // moved, not duplicated
  expect(r.invoices[0].row.rel).toBe("Belege/03/Hetzner-2026-03-14.pdf");
  expect(r.entries.find((e) => e.merchant === "HETZNER")?.invoice).toBe("Belege/03/Hetzner-2026-03-14.pdf");
});

test("a hand-drawn link follows its Beleg into the folder", () => {
  const dropped = base();
  // A Beleg whose total nothing on the statement equals: only a manual link holds it.
  dropped.invoices = [invoice("Hetzner", "2026-03-14", "99.00", "Rechnung.pdf")];
  const entry = { ...dropped.entries[0], provider: "Hetzner", date: "2026-03-14", amount: 12.9, merchant: "HETZNER" };
  const linked = linkManually(
    { ...dropped, charges: [charge("HETZNER", "2026-03-14", 12.9)] } as RunResult,
    entry as never,
    ["Rechnung.pdf"],
  );
  expect(linked.entries.find((e) => e.merchant === "HETZNER")?.manual).toBe(true);
  expect(linked.manualLinks[0].charge).toBe(chargeKey(charge("HETZNER", "2026-03-14", 12.9)));

  const filed: CollectedPdf = {
    rel: "Belege/03/Hetzner-2026-03-14.pdf",
    src: { kind: "file", path: "Belege/03/Hetzner-2026-03-14.pdf" },
    data: new ArrayBuffer(0),
  };
  const moved = repointResult(linked, [{ from: "Rechnung.pdf", to: filed }]);
  expect(moved.manualLinks[0].rel).toBe("Belege/03/Hetzner-2026-03-14.pdf");
  expect(moved.entries.find((e) => e.merchant === "HETZNER")?.status).toBe("matched");
});

test("releasing a match keeps it released across the re-match", () => {
  const withInvoice = base();
  withInvoice.invoices = [invoice("Hetzner", "2026-03-14", "12.90", "hetzner.pdf")];
  withInvoice.charges = [charge("HETZNER", "2026-03-14", 12.9)];
  const matchedRow = removeDocument(withInvoice, "nothing.pdf")!.entries.find((e) => e.merchant === "HETZNER")!;
  expect(matchedRow.status).toBe("matched");

  const released = unmatchEntry({ ...withInvoice, entries: [matchedRow] } as RunResult, matchedRow);
  const row = released.entries.find((e) => e.merchant === "HETZNER")!;
  expect(row.status).toBe("missing");                        // the booking is open again…
  expect(released.extras.map((x) => x.rel)).toEqual(["hetzner.pdf"]); // …and its Beleg is free
  expect(released.manualLinks[0].mode).toBe("reject");       // …and it stays that way
});

test("removing a text-less PDF drops it from the skipped list", () => {
  const r = removeDocument(base(), "scan.pdf")!;
  expect(r.emptyPdfs).toEqual([]);
  expect(r.statementFiles).toHaveLength(2); // nothing else disturbed
});

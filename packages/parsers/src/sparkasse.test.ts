import { test, expect } from "bun:test";
import { canon } from "@kah/core";
import { parseVisaStatement, parseKontoauszug, parseBankStatement, visaSettlementCard, expectsNoInvoice } from "./index";

// Synthetic fixtures that mimic the Saalesparkasse layout (no real personal data).
const VISA_FIXTURE = `VISA  1234  56XX  XXXX  7890  -  TEST  CARDHOLDER
Leistungsbeschreibung     Ort     Betrag
Saldovortrag  vom  18.09.2025     0,00+
22.09.  21.09.  GITHUB,  INC.     GITHUB.COM     US     4,50-
5,20  USD,  EURO-Kurs  1,172800
inkl.  1,50%  Einsatz  in  Fremdwähr.  EUR  0,07
02.10.  01.10.  SLACK  T05MN2LUCUE     DUBLIN     IE     8,25-
14.10.  08.10.  WWW.AMAZON.*  AB1     LUXEMBOURG     LU     173,68-
VISA  Summe     186,43-
Einzug  von  Kto.  1234567890  BLZ  12345678     186,43+`;

const KONTO_FIXTURE = `Kontoauszug 10/2025
Datum Erläuterung Betrag EUR
Kontostand am 30.09.2025, Auszug Nr. 9 64.562,43
01.10.2025 Überweisungsgutschr.    2.776,38
ACME PAYOUT REF-123
10.10.2025 Lastschrifteinlösung    -179,00
EXAMPLE UTILITY GMBH Vielen Dank 0064
Kontostand am 30.10.2025    55.222,26`;

test("parseVisaStatement: clean rows, USD principal + booked EUR, skips Saldovortrag/Summe", () => {
  const c = parseVisaStatement(VISA_FIXTURE, 2025);
  expect(c).toHaveLength(3);
  expect(c[0]).toMatchObject({ amount: 5.2, currency: "USD", bookedEur: 4.5, date: "2025-09-21" });
  expect(c[1]).toMatchObject({ amount: 8.25, currency: "EUR" }); // domestic, no USD line
  expect(c[1].bookedEur).toBeUndefined();
  expect(c[2].amount).toBe(173.68);
  expect(canon(c[0].merchant)).toBe("GitHub");
});

test("parseVisaStatement: year-end wrap — December tx on a January statement is the previous year", () => {
  const fixture = `VISA  1234  56XX  XXXX  7890  -  TEST
Duplikat der Abrechnung/Saldenmitteilung bis zum 18.01.2026
Saldovortrag  vom  18.12.2025     0,00+
29.12.  26.12.  BACKBLAZE  INC     BACKBLAZE.COM     US     4,30-
5,00  USD,  EURO-Kurs  1,160000
16.01.  15.01.  RESEND     RESEND.COM     US     10,30-
12,00  USD,  EURO-Kurs  1,160000
VISA  Summe     14,60-`;
  const c = parseVisaStatement(fixture, 2026);
  expect(c[0]).toMatchObject({ amount: 5, currency: "USD", date: "2025-12-26" });  // December → 2025
  expect(c[1]).toMatchObject({ amount: 12, currency: "USD", date: "2026-01-15" }); // January → 2026
});

test("parseKontoauszug: emits debits only, abs amount, skips credits + balances", () => {
  const c = parseKontoauszug(KONTO_FIXTURE);
  expect(c).toHaveLength(1); // the credit (Überweisungsgutschr.) and balance lines are skipped
  expect(c[0]).toMatchObject({ amount: 179, currency: "EUR", date: "2025-10-10" });
  expect(c[0].merchant).toContain("EXAMPLE UTILITY");
});

test("visaSettlementCard: extracts the card last-4 from a Kontoauszug settlement", () => {
  expect(visaSettlementCard("SAALESPARKASSE VISA NR. 123456XXXXXX4321 EINZUG DES RECHNUNGSB 18.11")).toBe("4321");
  expect(visaSettlementCard("SAALESPARKASSE VISA NR. 123456XXXXXX7890 EINZUG DES RECHNUNGSB 18.11")).toBe("7890");
  expect(visaSettlementCard("Muster Energie GmbH Vielen Dank")).toBeNull();
});

test("expectsNoInvoice: only no-document Kontoauszug categories; real vendors stay missing", () => {
  expect(expectsNoInvoice("MUSTERMANN MAX LOHN / GEHALT 02/26")).toBe(true);
  expect(expectsNoInvoice("FINANZAMT MUSTERSTADT 000/000/00000, 02/26 LST. 1.662,16")).toBe(true);
  expect(expectsNoInvoice("Muster BKK Beitrag Februar 2026 00000000")).toBe(true);
  expect(expectsNoInvoice("Knappschaft-Bahn-See Deutsche Rentenversicherung")).toBe(true);
  expect(expectsNoInvoice("SAALESPARKASSE VISA NR. 123456XXXXXX1234 EINZUG DES RECHNUNGSB 18.02")).toBe(true);
  // taxes paid to the Finanzamt / Stadt need no vendor invoice
  expect(expectsNoInvoice("FINANZAMT MUSTERSTADT Umsatzsteuer 4.VJ.2025, 000/000/00000")).toBe(true);
  expect(expectsNoInvoice("Stadt Musterstadt 0.0000.000000.0 Gewerbesteuer 01.2026")).toBe(true);
  // a real vendor whose Beleg we DO expect stays missing
  expect(expectsNoInvoice("Muster Verlag GmbH Rechnungsnummer DEMO-0001")).toBe(false);
  expect(expectsNoInvoice("Rechnung AZV Zahlung Betrag: 1.000,00 EUR Debt: Acme Software Incorporated")).toBe(false);
});

test("parseBankStatement: detects kind from content; unknown → null", () => {
  expect(parseBankStatement(VISA_FIXTURE, "x.PDF")?.kind).toBe("visa");
  expect(parseBankStatement(KONTO_FIXTURE, "x.pdf")?.kind).toBe("konto");
  expect(parseBankStatement("just some random invoice text", "y.pdf")).toBeNull();
  expect(parseBankStatement(VISA_FIXTURE, "x.PDF")?.parserId).toBe("sparkasse");
});

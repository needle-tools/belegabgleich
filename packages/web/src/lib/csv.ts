/**
 * CSV export of the report — for handing the Steuerberater a list of which
 * bookings have a Beleg and which are still missing. Generated and downloaded
 * entirely in the browser; nothing leaves the page. Semicolon-separated and
 * UTF-8 BOM-prefixed so Excel (de-DE) opens it with correct columns and umlauts.
 */
import type { ReportEntry, ReportStatus } from "./report";

const STATUS_DE: Record<ReportStatus, string> = {
  matched: "Beleg vorhanden",
  missing: "Beleg fehlt",
  no_invoice: "kein Beleg nötig",
};

/** Quote a field for CSV (RFC-4180 style), escaping embedded quotes. */
function cell(v: string | number): string {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(entries: ReportEntry[]): string {
  // Quelldokument and Auszugstext ride along: they are what makes a row traceable
  // back to the page it was read from, which is the first thing anyone checking the
  // list asks about a gap.
  const header = ["Datum", "Anbieter", "Betrag", "Währung", "Status", "Beleg/Hinweis", "Quelldokument", "Auszugstext"];
  const rows = entries.map((e) => [
    e.date,
    e.provider,
    e.amount.toFixed(2).replace(".", ","), // de-DE decimal comma
    e.currency,
    STATUS_DE[e.status],
    e.invoice ?? e.note ?? "",
    e.source?.rel ?? "",
    e.merchant ?? "",
  ]);
  return [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}

/** Trigger a browser download of the report as a .csv file. */
export function downloadCsv(entries: ReportEntry[], filename = "beleg-abgleich.csv"): void {
  const blob = new Blob(["﻿" + toCsv(entries)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

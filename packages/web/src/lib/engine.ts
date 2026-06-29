/**
 * The live pipeline: collected PDFs → text → (statements ∪ invoices) → match →
 * report. Runs entirely in the browser. Statements are recognized by content
 * (any registered bank parser claims them); everything else is treated as an
 * invoice and run through the deterministic field extractor.
 */
import {
  extractFields,
  buildProposed,
  matchStatement,
  dedupeCharges,
  type Charge,
  type Row,
} from "@kah/core";
import { parseBankStatement } from "@kah/parsers";
import { dedupeNames } from "@kah/core";
import type { CollectedPdf } from "./collect";
import { pdfToText } from "./pdf";
import { buildReport, configureProviderAliases, type ReportEntry } from "./report";
import type { RenamePlan } from "./rename";

/** A parsed invoice row plus the PDF it came from (kept so new invoices can be
 *  matched later without re-reading the original statement). `pdf` is dropped when
 *  the result is persisted to the session (bytes/handles aren't cloneable / are
 *  heavy), so it's optional — a restored invoice can still be re-matched by row. */
export type InvoiceItem = { row: Row; pdf?: CollectedPdf };

export type RunResult = {
  entries: ReportEntry[];
  /** Friendly label per detected statement, e.g. "Kontoauszug", "VISA-Abrechnung". */
  statements: string[];
  /** Bank parser ids that fired (for analytics; e.g. ["sparkasse"]). */
  parserIds: string[];
  /** Billing period derived from the charge dates, e.g. "Oktober 2025". */
  period: string;
  invoiceCount: number;
  /** Display paths of the detected statement PDFs (e.g. "10/Konto_…-Auszug.pdf"). */
  statementFiles: string[];
  /** PDFs whose bytes had no extractable text (likely scans needing OCR). */
  emptyPdfs: string[];
  /** Invoices that can be renamed to the canonical schema (current ≠ proposed). */
  renames: RenamePlan[];
  /** Deduped statement charges — retained so a later invoice can be re-matched
   *  against them (e.g. from the "Beleg zuordnen" picker) without the statement
   *  PDF still being in memory. Structured-cloned into the session. */
  charges: Charge[];
  /** Parsed invoices retained for the same reason. */
  invoices: InvoiceItem[];
};

/** Final path segment of a display rel ("a/b.pdf" or "x.zip › b.pdf" → "b.pdf"). */
function baseName(rel: string): string {
  return rel.split(/[/\\]|\s›\s/).pop() ?? rel;
}

/** ZIP target path for a renamed invoice — subfolders preserved for real files,
 *  zip entries flattened to the archive root. */
function targetPathFor(pdf: CollectedPdf, proposed: string): string {
  if (pdf.src.kind === "file") {
    const dir = pdf.src.path.replace(/[^/\\]*$/, "").replace(/[/\\]+$/, "");
    return dir ? `${dir}/${proposed}` : proposed;
  }
  return proposed;
}

const KIND_LABEL: Record<string, string> = { konto: "Kontoauszug", visa: "VISA-Abrechnung" };

const monthFmt = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
/** Most common YYYY-MM among the charges → "Oktober 2025". */
function dominantPeriod(charges: Charge[]): string {
  const counts = new Map<string, number>();
  for (const c of charges) {
    const ym = (c.date || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) counts.set(ym, (counts.get(ym) ?? 0) + 1);
  }
  if (!counts.size) return "";
  const [ym] = [...counts].sort((a, b) => b[1] - a[1])[0];
  const [y, m] = ym.split("-").map(Number);
  return monthFmt.format(new Date(y, m - 1, 1));
}

export type RunError = { code: "no_statement"; invoiceCount: number };

/** Per-PDF progress while reading. `name` is the file currently finished. */
export type RunProgress = { done: number; total: number; name: string };
type OnProgress = (p: RunProgress) => void;

type Parsed =
  | { kind: "statement"; charges: Charge[]; label: string; parserId: string; rel: string }
  | { kind: "invoice"; item: InvoiceItem }
  | { kind: "empty"; rel: string };

/** Read one PDF and classify it as a bank statement, an invoice, or empty/scan. */
async function parsePdf(pdf: CollectedPdf): Promise<Parsed> {
  let text = "";
  try {
    text = await pdfToText(pdf.data);
  } catch {
    return { kind: "empty", rel: pdf.rel };
  }
  if (!text.trim()) return { kind: "empty", rel: pdf.rel };

  const statement = parseBankStatement(text, pdf.rel);
  if (statement) {
    return {
      kind: "statement",
      charges: statement.charges,
      label: KIND_LABEL[statement.kind] ?? statement.kind,
      parserId: statement.parserId,
      rel: pdf.rel,
    };
  }
  const { fields } = extractFields(text);
  return {
    kind: "invoice",
    item: { row: { ...fields, rel: pdf.rel, src: pdf.src, proposed: buildProposed(fields), hasText: true }, pdf },
  };
}

/** Match retained charges against retained invoices and build the full result. */
function assemble(
  charges: Charge[],
  invoices: InvoiceItem[],
  statements: string[],
  statementFiles: string[],
  parserIds: string[],
  emptyPdfs: string[],
): RunResult {
  const deduped = dedupeCharges(charges);
  const rows = invoices.map((i) => i.row);
  const match = matchStatement(deduped, rows);

  // Rename plans: every invoice with a confident proposed name that differs from
  // its current name. dedupeNames keeps two same-named targets collision-safe.
  const proposedBasenames = dedupeNames(rows.map((r) => r.proposed));
  const renames: RenamePlan[] = [];
  invoices.forEach((inv, i) => {
    const base = proposedBasenames[i];
    if (!base || base === baseName(inv.row.rel)) return;
    if (!inv.pdf) return; // restored-from-session invoice: no bytes → can't rename
    renames.push({
      from: inv.row.rel,
      to: targetPathFor(inv.pdf, base),
      base,
      data: inv.pdf.data,
      handle: inv.pdf.handle,
      root: inv.pdf.root,
    });
  });

  return {
    entries: buildReport(match),
    statements: [...new Set(statements)],
    statementFiles: [...new Set(statementFiles)],
    parserIds,
    period: dominantPeriod(deduped),
    invoiceCount: rows.length,
    emptyPdfs,
    renames,
    charges: deduped,
    invoices,
  };
}

/** Run the full reconciliation from scratch. Throws {@link RunError} when no
 *  statement is present (an invoice on its own has nothing to match against). */
export async function run(pdfs: CollectedPdf[], onProgress?: OnProgress): Promise<RunResult> {
  configureProviderAliases();

  const charges: Charge[] = [];
  const statements: string[] = [];
  const statementFiles: string[] = [];
  const parserIds = new Set<string>();
  const invoices: InvoiceItem[] = [];
  const emptyPdfs: string[] = [];

  for (let i = 0; i < pdfs.length; i++) {
    const pdf = pdfs[i];
    const p = await parsePdf(pdf);
    if (p.kind === "statement") {
      charges.push(...p.charges);
      statements.push(p.label);
      statementFiles.push(p.rel);
      parserIds.add(p.parserId);
    } else if (p.kind === "invoice") {
      invoices.push(p.item);
    } else {
      emptyPdfs.push(p.rel);
    }
    onProgress?.({ done: i + 1, total: pdfs.length, name: pdf.rel });
  }

  if (!statements.length) {
    const err: RunError = { code: "no_statement", invoiceCount: invoices.length };
    throw err;
  }

  return assemble(charges, invoices, statements, statementFiles, [...parserIds], emptyPdfs);
}

/**
 * Add invoices (or further statements) to an EXISTING result and re-match. Used by
 * the "Beleg zuordnen" picker and by adding more files to a live report: the new
 * invoice is matched against the charges already parsed from the statement, so the
 * statement PDF need not still be loaded (works after a session restore too).
 * Never throws no_statement — the previous run already established the charges.
 */
export async function addInvoices(
  prev: RunResult,
  pdfs: CollectedPdf[],
  onProgress?: OnProgress,
): Promise<RunResult> {
  configureProviderAliases();

  const charges: Charge[] = [...(prev.charges ?? [])];
  const invoices: InvoiceItem[] = [...(prev.invoices ?? [])];
  const seen = new Set(invoices.map((i) => i.row.rel));
  const statements = [...prev.statements];
  const statementFiles = [...(prev.statementFiles ?? [])];
  const parserIds = new Set(prev.parserIds);
  const emptyPdfs = [...prev.emptyPdfs];

  for (let i = 0; i < pdfs.length; i++) {
    const pdf = pdfs[i];
    const p = await parsePdf(pdf);
    if (p.kind === "statement") {
      charges.push(...p.charges);
      statements.push(p.label);
      statementFiles.push(p.rel);
      parserIds.add(p.parserId);
    } else if (p.kind === "invoice") {
      if (!seen.has(p.item.row.rel)) {
        invoices.push(p.item);
        seen.add(p.item.row.rel);
      }
    } else {
      emptyPdfs.push(p.rel);
    }
    onProgress?.({ done: i + 1, total: pdfs.length, name: pdf.rel });
  }

  return assemble(charges, invoices, statements, statementFiles, [...parserIds], emptyPdfs);
}

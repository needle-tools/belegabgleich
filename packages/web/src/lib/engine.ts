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

/**
 * One loaded statement PDF, with the charges it contributed.
 *
 * Keeping charges attributed to the file they came from is what makes removing a
 * single document possible: {@link removeDocument} drops the source and rebuilds
 * from the rest, with no re-reading of any PDF.
 */
export type StatementSource = {
  rel: string;
  /** "Kontoauszug", "VISA-Abrechnung", … */
  label: string;
  parserId: string;
  charges: Charge[];
};

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
  /** The statements with their own charges, so one can be removed on its own.
   *  Absent on sessions restored from before this existed — the UI then simply
   *  offers no remove button for statements rather than guessing provenance. */
  statementSources?: StatementSource[];
  /** PDFs whose bytes had no extractable text (likely scans needing OCR). */
  emptyPdfs: string[];
  /** Belege in the folder that no booking claimed. The counterpart to the missing
   *  list: "500 € fehlt an Belegen, 500 € liegt unzugeordnet herum" usually means
   *  the same handful of documents, matched to nothing. */
  extras: ExtraInvoice[];
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

/** A Beleg that was read but matched to no booking on any loaded statement. */
export type ExtraInvoice = {
  rel: string;
  provider: string;
  date: string;
  /** The document's own total, as extracted ("" when none was found). */
  total: string;
  currency: string;
};

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
  const { fields, altTotals } = extractFields(text);
  return {
    kind: "invoice",
    item: {
      row: {
        ...fields,
        rel: pdf.rel,
        src: pdf.src,
        proposed: buildProposed(fields),
        hasText: true,
        ...(altTotals.length ? { altTotals } : {}),
      },
      pdf,
    },
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
  statementSources?: StatementSource[],
): RunResult {
  const deduped = dedupeCharges(charges);
  const rows = invoices.map((i) => i.row);
  const match = matchStatement(deduped, rows);

  // Which statement each charge came from, by object identity — dedupeCharges keeps
  // the first occurrence, so the charge objects here are the ones the sources hold.
  const origin = new Map<Charge, { rel: string; label: string }>();
  for (const s of statementSources ?? []) {
    for (const c of s.charges) if (!origin.has(c)) origin.set(c, { rel: s.rel, label: s.label });
  }

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
    entries: buildReport(match, deduped, origin),
    statements: [...new Set(statements)],
    statementFiles: [...new Set(statementFiles)],
    statementSources,
    parserIds,
    period: dominantPeriod(deduped),
    invoiceCount: rows.length,
    emptyPdfs,
    extras: match.unmatchedInvoices.map((r) => ({
      rel: r.rel,
      provider: r.provider,
      date: r.date,
      total: r.total,
      currency: r.currency,
    })),
    renames,
    charges: deduped,
    invoices,
  };
}

/** Run the full reconciliation from scratch. Throws {@link RunError} when no
 *  statement is present (an invoice on its own has nothing to match against). */
export async function run(pdfs: CollectedPdf[], onProgress?: OnProgress): Promise<RunResult> {
  configureProviderAliases();

  const sources: StatementSource[] = [];
  const invoices: InvoiceItem[] = [];
  const emptyPdfs: string[] = [];

  for (let i = 0; i < pdfs.length; i++) {
    const pdf = pdfs[i];
    const p = await parsePdf(pdf);
    if (p.kind === "statement") {
      if (!sources.some((s) => s.rel === p.rel)) {
        sources.push({ rel: p.rel, label: p.label, parserId: p.parserId, charges: p.charges });
      }
    } else if (p.kind === "invoice") {
      invoices.push(p.item);
    } else {
      emptyPdfs.push(p.rel);
    }
    onProgress?.({ done: i + 1, total: pdfs.length, name: pdf.rel });
  }

  if (!sources.length) {
    const err: RunError = { code: "no_statement", invoiceCount: invoices.length };
    throw err;
  }

  return fromSources(sources, invoices, emptyPdfs);
}

/** Assemble from attributed statement sources — the path that supports removal. */
function fromSources(
  sources: StatementSource[],
  invoices: InvoiceItem[],
  emptyPdfs: string[],
): RunResult {
  return assemble(
    sources.flatMap((s) => s.charges),
    invoices,
    sources.map((s) => s.label),
    sources.map((s) => s.rel),
    [...new Set(sources.map((s) => s.parserId))],
    emptyPdfs,
    sources,
  );
}

/**
 * Remove one loaded document and everything it brought with it, without
 * re-reading any PDF.
 *
 * Removing a statement drops the charges it contributed, so its bookings leave
 * the report. Removing an invoice un-matches whatever it covered, so those
 * bookings show up as missing again. Returns null when the last statement is
 * removed — there is nothing left to reconcile against, and the caller should
 * fall back to a full reset.
 */
export function removeDocument(prev: RunResult, rel: string): RunResult | null {
  // Re-matching happens here, so the aliases must be in place. run()/addInvoices()
  // normally did that already, but a session restored from IndexedDB can reach
  // this without either having run in this page load.
  configureProviderAliases();

  const sources = (prev.statementSources ?? []).filter((s) => s.rel !== rel);
  const invoices = (prev.invoices ?? []).filter((i) => i.row.rel !== rel);
  const emptyPdfs = (prev.emptyPdfs ?? []).filter((e) => e !== rel);

  if (!sources.length) return null;
  return fromSources(sources, invoices, emptyPdfs);
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

  const invoices: InvoiceItem[] = [...(prev.invoices ?? [])];
  const seen = new Set(invoices.map((i) => i.row.rel));
  const emptyPdfs = [...prev.emptyPdfs];

  // Sessions stored before statements carried their own charges have no sources
  // to extend. Those keep the old flattened path (and no per-statement removal);
  // everything loaded in this session goes through the attributed one.
  const sources: StatementSource[] | null = prev.statementSources
    ? [...prev.statementSources]
    : null;
  const legacyCharges: Charge[] = sources ? [] : [...(prev.charges ?? [])];
  const legacyStatements = [...prev.statements];
  const legacyFiles = [...(prev.statementFiles ?? [])];
  const legacyParsers = new Set(prev.parserIds);

  for (let i = 0; i < pdfs.length; i++) {
    const pdf = pdfs[i];
    const p = await parsePdf(pdf);
    if (p.kind === "statement") {
      if (sources) {
        if (!sources.some((s) => s.rel === p.rel)) {
          sources.push({ rel: p.rel, label: p.label, parserId: p.parserId, charges: p.charges });
        }
      } else if (!legacyFiles.includes(p.rel)) {
        // Same guard as the attributed branch above: re-reading a folder must not
        // append the statement a second time — that would double every charge on
        // it, and the two arrays are index-matched, so they move together.
        legacyCharges.push(...p.charges);
        legacyStatements.push(p.label);
        legacyFiles.push(p.rel);
        legacyParsers.add(p.parserId);
      }
    } else if (p.kind === "invoice") {
      if (!seen.has(p.item.row.rel)) {
        invoices.push(p.item);
        seen.add(p.item.row.rel);
      }
    } else if (!emptyPdfs.includes(p.rel)) {
      emptyPdfs.push(p.rel);
    }
    onProgress?.({ done: i + 1, total: pdfs.length, name: pdf.rel });
  }

  if (sources) return fromSources(sources, invoices, emptyPdfs);
  return assemble(
    legacyCharges,
    invoices,
    legacyStatements,
    legacyFiles,
    [...legacyParsers],
    emptyPdfs,
  );
}

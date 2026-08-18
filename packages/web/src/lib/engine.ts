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
  findDuplicates,
  chargeKey,
  type Charge,
  type ManualLink,
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
  /** The same invoice filed in more than one place, grouped per document. */
  duplicates: DuplicateGroup[];
  /** Links the user drew by hand. Kept on the result so they survive a reload and
   *  every later re-match — dropping them would silently undo the user's decision. */
  manualLinks: ManualLink[];
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

/** One document that exists in the folder more than once. */
export type DuplicateGroup = {
  provider: string;
  date: string;
  total: string;
  currency: string;
  /** Every place it was found, in the order they were read. */
  rels: string[];
};

export type RunError = { code: "no_statement"; invoiceCount: number };

/** Per-PDF progress while reading. `name` is the file currently finished. */
export type RunProgress = { done: number; total: number; name: string };
type OnProgress = (p: RunProgress) => void;

type Parsed =
  | { kind: "statement"; charges: Charge[]; label: string; parserId: string; rel: string }
  | { kind: "invoice"; item: InvoiceItem }
  | { kind: "empty"; rel: string };

/**
 * Everything a set of PDFs contributed, read but not yet matched.
 *
 * Reading is the expensive half and filing depends on the cheap half: to put a
 * dropped Beleg in the folder of the booking it settles, we have to know that
 * booking first — but the file has to be written before the report can point at its
 * final path. Keeping the parse separate lets the caller match, file, re-point and
 * match again while every PDF is read exactly once.
 */
export type ParsedInput = { statements: StatementSource[]; invoices: InvoiceItem[]; emptyPdfs: string[] };

/** Read PDFs and sort them into statements / invoices / unreadable. */
export async function parseInputs(pdfs: CollectedPdf[], onProgress?: OnProgress): Promise<ParsedInput> {
  configureProviderAliases();
  const statements: StatementSource[] = [];
  const invoices: InvoiceItem[] = [];
  const emptyPdfs: string[] = [];
  for (let i = 0; i < pdfs.length; i++) {
    const pdf = pdfs[i];
    const p = await parsePdf(pdf);
    if (p.kind === "statement") {
      if (!statements.some((s) => s.rel === p.rel)) {
        statements.push({ rel: p.rel, label: p.label, parserId: p.parserId, charges: p.charges });
      }
    } else if (p.kind === "invoice") {
      invoices.push(p.item);
    } else {
      emptyPdfs.push(p.rel);
    }
    onProgress?.({ done: i + 1, total: pdfs.length, name: pdf.rel });
  }
  return { statements, invoices, emptyPdfs };
}

/** The same parsed invoice, now living at the place it was just filed to. Keeps the
 *  extraction (no second read) and hands the report the on-disk path. */
export function repointInvoice(item: InvoiceItem, pdf: CollectedPdf): InvoiceItem {
  return { row: { ...item.row, rel: pdf.rel, src: pdf.src }, pdf };
}

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
  manualLinks: ManualLink[] = [],
): RunResult {
  const deduped = dedupeCharges(charges);
  const rows = invoices.map((i) => i.row);
  const match = matchStatement(deduped, rows, manualLinks);

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
    manualLinks,
    duplicates: findDuplicates(rows).map((g) => ({
      provider: g[0].provider,
      date: g[0].date,
      total: g[0].total,
      currency: g[0].currency,
      rels: g.map((r) => r.rel),
    })),
    renames,
    charges: deduped,
    invoices,
  };
}

/** Run the full reconciliation from scratch. Throws {@link RunError} when no
 *  statement is present (an invoice on its own has nothing to match against). */
export async function run(pdfs: CollectedPdf[], onProgress?: OnProgress): Promise<RunResult> {
  const { statements, invoices, emptyPdfs } = await parseInputs(pdfs, onProgress);
  if (!statements.length) {
    const err: RunError = { code: "no_statement", invoiceCount: invoices.length };
    throw err;
  }
  return fromSources(statements, invoices, emptyPdfs);
}

/** Assemble from attributed statement sources — the path that supports removal. */
function fromSources(
  sources: StatementSource[],
  invoices: InvoiceItem[],
  emptyPdfs: string[],
  manualLinks: ManualLink[] = [],
): RunResult {
  return assemble(
    sources.flatMap((s) => s.charges),
    invoices,
    sources.map((s) => s.label),
    sources.map((s) => s.rel),
    [...new Set(sources.map((s) => s.parserId))],
    emptyPdfs,
    sources,
    manualLinks,
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
  // A hand-drawn link to a document that is gone has nothing left to say.
  const links = (prev.manualLinks ?? []).filter((l) => l.rel !== rel);

  if (!sources.length) return null;
  return fromSources(sources, invoices, emptyPdfs, links);
}

/**
 * Record "this Beleg belongs to this booking" and re-match with it in force.
 *
 * The way out when the matcher is wrong, which it will sometimes be: it links on the
 * amount, so an invoice whose total the PDF states differently (a partial payment, a
 * figure we misread, a credit applied) can never be linked automatically, however
 * obvious the pairing is to the person looking at both.
 */
export function linkManually(prev: RunResult, entry: ReportEntry, rel: string): RunResult {
  configureProviderAliases();
  const charge = (prev.charges ?? []).find(
    (c) => c.date === entry.date && Math.abs(c.amount - entry.amount) <= 0.01 && c.merchant === entry.merchant,
  );
  if (!charge) {
    console.warn("[link] Buchung nicht mehr im Bericht gefunden — nichts verknüpft");
    return prev;
  }
  const key = chargeKey(charge);
  // One Beleg per booking, and one booking per Beleg: replace whatever either side
  // was linked to before rather than stacking contradictory links.
  const links = [
    ...(prev.manualLinks ?? []).filter((l) => l.charge !== key && l.rel !== rel),
    { charge: key, rel },
  ];
  const sources = prev.statementSources;
  if (!sources) {
    console.warn("[link] Sitzung ohne Auszug-Zuordnung — manuelles Verknüpfen nicht möglich");
    return prev;
  }
  return fromSources(sources, prev.invoices ?? [], prev.emptyPdfs ?? [], links);
}

/** Take back a hand-drawn link (by the Beleg it points at). */
export function unlinkManually(prev: RunResult, rel: string): RunResult {
  configureProviderAliases();
  const links = (prev.manualLinks ?? []).filter((l) => l.rel !== rel);
  const sources = prev.statementSources;
  if (!sources) return prev;
  return fromSources(sources, prev.invoices ?? [], prev.emptyPdfs ?? [], links);
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
  return addParsed(prev, await parseInputs(pdfs, onProgress));
}

/** The matching half of {@link addInvoices}: fold already-read documents into an
 *  existing report. Pure, so the same parse can be matched twice — once to learn
 *  where a Beleg belongs, once after it has been filed there. */
export function addParsed(prev: RunResult, parsed: ParsedInput): RunResult {
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

  for (const s of parsed.statements) {
    if (sources) {
      if (!sources.some((x) => x.rel === s.rel)) sources.push(s);
    } else if (!legacyFiles.includes(s.rel)) {
      // Same guard as the attributed branch above: re-reading a folder must not
      // append the statement a second time — that would double every charge on
      // it, and the two arrays are index-matched, so they move together.
      legacyCharges.push(...s.charges);
      legacyStatements.push(s.label);
      legacyFiles.push(s.rel);
      legacyParsers.add(s.parserId);
    }
  }
  for (const item of parsed.invoices) {
    if (seen.has(item.row.rel)) continue;
    invoices.push(item);
    seen.add(item.row.rel);
  }
  for (const rel of parsed.emptyPdfs) if (!emptyPdfs.includes(rel)) emptyPdfs.push(rel);

  const links = prev.manualLinks ?? [];
  if (sources) return fromSources(sources, invoices, emptyPdfs, links);
  return assemble(
    legacyCharges,
    invoices,
    legacyStatements,
    legacyFiles,
    [...legacyParsers],
    emptyPdfs,
    undefined,
    links,
  );
}

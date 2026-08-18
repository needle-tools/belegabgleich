/**
 * Filing a dropped Beleg: a PDF the user just downloaded from a vendor lands in
 * their Downloads folder under a name like "invoice_4711.pdf". Assigning it to a
 * booking should put it where it will still be findable next year — in the folder
 * that holds the statement it settles, under the canonical name.
 *
 * The write happens BEFORE the engine sees the PDF, so everything downstream
 * (report path, "open PDF", the rename panel) refers to the file on disk rather
 * than to a copy that only exists in the tab.
 */
import { extractFields, buildProposed, canon } from "@kah/core";
import type { CollectedPdf, FsDirHandle } from "./collect";
import { pdfToText } from "./pdf";
import { ensureWritable, canWriteInto, saveIntoFolder } from "./folder";

/** Where a Beleg for a given booking belongs: the picked root plus the path
 *  inside it that holds the statement (empty = the root itself). */
export type FileTarget = { root: FsDirHandle; subdir: string; label: string };

export type FilingResult = {
  /** The PDFs to hand to the engine — rewritten to their on-disk location when saved. */
  pdfs: CollectedPdf[];
  /** Paths (relative to the picked folder) actually written. */
  saved: string[];
  /** The same writes, with the rel the report knows them by and the root they went
   *  into — enough to undo them. Only files created by THIS call; never anything that
   *  was already there. */
  written: { path: string; rel: string; root: FsDirHandle }[];
  /** Paths that were already in the folder — the same document, not written again. */
  existing: string[];
  /** True when write access was refused for at least one folder. */
  denied: boolean;
  /** The folders that refused, by label — so the user can be asked again for exactly
   *  those instead of being told "something wasn't saved". */
  deniedTargets: string[];
};

const baseName = (rel: string) => rel.split(/[/\\]|\s›\s/).pop() ?? rel;

/** What we know about the booking a Beleg is being filed for — used to name the file
 *  when the PDF itself gives up too little. */
export type NameHint = { provider: string; date: string; amount: number; currency: string };

/** `2026-04-03-12,90EUR` — enough to tell two Belege for one booking apart. */
function hintName(hint: NameHint): string {
  const provider = canon(hint.provider);
  const amount = isFinite(hint.amount) ? `-${hint.amount.toFixed(2).replace(".", ",")}${hint.currency || "EUR"}` : "";
  return `${provider === "Unknown" ? "Beleg" : provider}-${hint.date || "nodate"}${amount}.pdf`;
}

/**
 * Canonical file name for a PDF.
 *
 * A vendor download is called `invoice.pdf` or `Rechnung.pdf` far more often than
 * anything else, so a folder full of them is a folder of ` (2)`, ` (3)`, ` (4)`.
 * When the PDF names its issuer we use the normal scheme; when it doesn't but we
 * know which booking it was dropped on, the booking supplies the name — that beats
 * keeping a name that says nothing, and it means nobody has to rename Amazon's
 * downloads by hand.
 */
async function targetName(pdf: CollectedPdf, hint?: NameHint): Promise<string> {
  try {
    const text = await pdfToText(pdf.data);
    if (text.trim()) {
      const { fields } = extractFields(text);
      const proposed = buildProposed(fields);
      if (proposed) return proposed;
    }
  } catch {
    /* unreadable PDF — fall through to the hint / its own name */
  }
  const own = baseName(pdf.rel);
  if (hint && /^(invoice|rechnung|receipt|quittung|beleg|download|document|dokument)[-_\s.0-9()]*\.pdf$/i.test(own)) {
    return hintName(hint);
  }
  return own;
}

/** Where one particular PDF goes, and what to fall back on for its name. */
export type FilingPlan = { pdf: CollectedPdf; target: FileTarget | null; hint?: NameHint };

/**
 * Save each PDF into ITS OWN target folder and return them re-pointed at their new
 * location. Without write access (no permission, or files that came from a plain
 * drag-and-drop) that PDF is returned untouched — the abgleich still runs, it just
 * stays in memory as before.
 *
 * The target is per file, not per drop: dropping five Hetzner invoices at once used
 * to put all five beside the statement of the booking you happened to click, so four
 * of them landed in the wrong month. Each one now goes where the booking it settles
 * lives.
 */
export async function fileIntoFolder(plans: FilingPlan[]): Promise<FilingResult> {
  const out: CollectedPdf[] = [];
  const written: FilingResult["written"] = [];
  const existing: string[] = [];
  const deniedTargets = new Set<string>();
  // One permission prompt per root, however many files are in the drop. Keyed by
  // NAME as well as identity: two handles can point at the same directory (one from
  // the folder walk, one restored from the session), and asking twice for the same
  // folder means the second ask arrives without a user gesture — which Chrome
  // refuses out of hand.
  const grants = new Map<string, boolean>();
  const grantKey = (root: FsDirHandle) => root.name || "«root»";

  for (const { pdf, target, hint } of plans) {
    if (!target) {
      // No target is a legitimate answer: a Beleg that matched no booking has no
      // folder it demonstrably belongs in, and filing it next to whatever booking
      // happened to be on screen is how invoices end up in the wrong month.
      console.info(`[filing] kein sicherer Zielordner für „${pdf.rel}" — der Beleg bleibt, wo er ist`);
      out.push(pdf);
      continue;
    }
    if (!canWriteInto(target.root)) {
      console.info(`[filing] „${target.label}" ist nicht beschreibbar (kein Verzeichnis-Handle)`);
      out.push(pdf);
      continue;
    }
    const key = grantKey(target.root);
    if (!grants.has(key)) grants.set(key, await ensureWritable(target.root));
    if (!grants.get(key)) {
      // Not an error and not the end of it: the file stays where it is, keeps its
      // place in the report, and the caller offers the write again on a click — which
      // carries the activation this attempt was missing.
      console.info(`[filing] Schreibzugriff auf „${target.label}" nicht erteilt — ${pdf.rel} bleibt liegen`);
      deniedTargets.add(target.label);
      out.push(pdf);
      continue;
    }
    try {
      const { path, handle, duplicate } = await saveIntoFolder(
        target.root,
        target.subdir,
        await targetName(pdf, hint),
        pdf.data,
      );
      // Exactly the rel the directory walk produces for this file, so the folder
      // watcher recognizes it as one we already know (it prefixes the root's name,
      // and nothing when the handle has none).
      const rel = target.root.name ? `${target.root.name}/${path}` : path;
      if (duplicate) existing.push(path); else written.push({ path, rel, root: target.root });
      console.info(`[filing] ${duplicate ? "lag schon da" : "gespeichert"}: ${rel}`);
      out.push({ src: { kind: "file", path: rel }, rel, data: pdf.data, handle, root: target.root });
    } catch (e) {
      console.warn(`[filing] „${pdf.rel}" konnte nicht gespeichert werden:`, e);
      out.push(pdf); // writing failed for this one — keep matching it from memory
    }
  }
  return {
    pdfs: out,
    saved: written.map((w) => w.path),
    written,
    existing,
    denied: deniedTargets.size > 0,
    deniedTargets: [...deniedTargets],
  };
}

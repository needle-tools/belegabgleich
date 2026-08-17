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
import { extractFields, buildProposed } from "@kah/core";
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
  /** The same writes, with the rel the report knows them by — enough to undo them.
   *  Only files created by THIS call; never anything that was already there. */
  written: { path: string; rel: string }[];
  /** Paths that were already in the folder — the same document, not written again. */
  existing: string[];
  /** True when write access was refused — nothing was written, matching still runs. */
  denied: boolean;
};

const baseName = (rel: string) => rel.split(/[/\\]|\s›\s/).pop() ?? rel;

/** Canonical file name for a PDF, or its current name when nothing was recognized. */
async function targetName(pdf: CollectedPdf): Promise<string> {
  try {
    const text = await pdfToText(pdf.data);
    if (text.trim()) {
      const { fields } = extractFields(text);
      const proposed = buildProposed(fields);
      if (proposed) return proposed;
    }
  } catch {
    /* unreadable PDF — keep the name it came with */
  }
  return baseName(pdf.rel);
}

/**
 * Save each PDF into the target folder and return them re-pointed at their new
 * location. Without write access (no permission, or files that came from a plain
 * drag-and-drop) the originals are returned untouched — the abgleich still runs,
 * it just stays in memory as before.
 */
export async function fileIntoFolder(pdfs: CollectedPdf[], target: FileTarget | null): Promise<FilingResult> {
  if (!target) {
    console.info("[filing] kein Zielordner — der Beleg bleibt nur im Bericht");
    return { pdfs, saved: [], written: [], existing: [], denied: false };
  }
  if (!canWriteInto(target.root)) {
    console.info(`[filing] „${target.label}" ist nicht beschreibbar (kein Verzeichnis-Handle)`);
    return { pdfs, saved: [], written: [], existing: [], denied: false };
  }
  if (!(await ensureWritable(target.root))) {
    console.info(`[filing] Schreibzugriff auf „${target.label}" nicht erteilt`);
    return { pdfs, saved: [], written: [], existing: [], denied: true };
  }
  console.info(`[filing] lege ${pdfs.length} PDF in „${target.label}" ab`);

  const out: CollectedPdf[] = [];
  const written: { path: string; rel: string }[] = [];
  const existing: string[] = [];
  for (const pdf of pdfs) {
    try {
      const { path, handle, duplicate } = await saveIntoFolder(
        target.root,
        target.subdir,
        await targetName(pdf),
        pdf.data,
      );
      // Exactly the rel the directory walk produces for this file, so the folder
      // watcher recognizes it as one we already know (it prefixes the root's name,
      // and nothing when the handle has none).
      const rel = target.root.name ? `${target.root.name}/${path}` : path;
      if (duplicate) existing.push(path); else written.push({ path, rel });
      console.info(`[filing] ${duplicate ? "lag schon da" : "gespeichert"}: ${rel}`);
      out.push({ src: { kind: "file", path: rel }, rel, data: pdf.data, handle, root: target.root });
    } catch (e) {
      console.warn(`[filing] „${pdf.rel}" konnte nicht gespeichert werden:`, e);
      out.push(pdf); // writing failed for this one — keep matching it from memory
    }
  }
  return { pdfs: out, saved: written.map((w) => w.path), written, existing, denied: false };
}

/**
 * PDF → plain text, in the browser, with no upload. Uses unpdf's structured text
 * items (each carries an x/y in PDF space) and reconstructs lines by grouping
 * items on the same y-coordinate, then ordering left-to-right. This matters: the
 * Sparkasse parsers in @kah/parsers are column-offset and line-oriented, and a
 * naive text merge collapses adjacent rows into one — losing the structure they
 * rely on. Invoice field extraction (@kah/core) is line-tolerant either way.
 */
import { extractTextItems, type StructuredTextItem } from "unpdf";

/** Items within this many PDF units of each other in y count as the same line. */
const Y_TOLERANCE = 2.5;
/** A horizontal gap wider than this (in units) becomes a run of spaces (columns). */
const COL_GAP = 6;

function reconstructPage(items: StructuredTextItem[]): string {
  const visible = items.filter((it) => it.str !== "");
  if (!visible.length) return "";

  // Group into lines by y (PDF origin is bottom-left, so larger y = higher up).
  const sorted = [...visible].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: StructuredTextItem[][] = [];
  let current: StructuredTextItem[] = [];
  let lineY = Number.POSITIVE_INFINITY;
  for (const it of sorted) {
    if (current.length && Math.abs(it.y - lineY) > Y_TOLERANCE) {
      lines.push(current);
      current = [];
    }
    if (!current.length) lineY = it.y;
    current.push(it);
  }
  if (current.length) lines.push(current);

  return lines
    .map((line) => {
      line.sort((a, b) => a.x - b.x);
      let out = "";
      let prevEnd = -Infinity;
      for (const it of line) {
        if (out && it.x - prevEnd > COL_GAP) out += "  "; // column break → keep a gap
        else if (out && !out.endsWith(" ") && !it.str.startsWith(" ")) out += " ";
        out += it.str;
        prevEnd = it.x + it.width;
      }
      return out.replace(/[ \t]+/g, " ").trimEnd();
    })
    .join("\n");
}

/** Extract text from a PDF, one reconstructed text block per page, pages joined.
 *  pdf.js TRANSFERS (detaches) the buffer it's given, so we hand it a copy —
 *  otherwise the caller's original bytes die and can't be reused later (e.g. for
 *  the ZIP export of renamed copies). */
export async function pdfToText(data: ArrayBuffer): Promise<string> {
  const { items } = await extractTextItems(new Uint8Array(data.slice(0)));
  return items.map(reconstructPage).join("\n\n");
}

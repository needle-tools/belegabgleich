/**
 * Auto-rename Belege to the canonical schema (Provider-YYYY-MM-DD[-Nr].pdf,
 * from @kah/core's buildProposed). Two ways to apply, both fully local:
 *
 *  - downloadRenamedZip — renamed COPIES bundled into a ZIP. Non-destructive,
 *    works with every input method (drag-drop, file input, picker, zips).
 *  - renameInPlace — renames the actual files on disk via the File System Access
 *    API (Chromium only; needs the directory picker and a one-time write grant).
 *    Destructive by nature, so it's offered only when writable handles exist.
 */
import { zipSync } from "fflate";
import type { FsFileHandle, FsDirHandle } from "./collect";

export type RenamePlan = {
  /** Current display path (e.g. "Rechnungen/foo.pdf" or "a.zip › foo.pdf"). */
  from: string;
  /** Target path for the ZIP, subfolders preserved. */
  to: string;
  /** Target basename — used for the in-place rename and shown in the UI. */
  base: string;
  data: ArrayBuffer;
  handle?: FsFileHandle;
  root?: FsDirHandle;
};

/** True when at least one plan can be renamed in place (writable handle present). */
export function canRenameInPlace(plans: RenamePlan[]): boolean {
  return plans.some((p) => typeof p.handle?.move === "function");
}

/** Bundle renamed copies into a ZIP and trigger a download. */
export function downloadRenamedZip(plans: RenamePlan[], filename = "belege-umbenannt.zip"): void {
  const files: Record<string, Uint8Array> = {};
  const used = new Map<string, number>();
  for (const p of plans) {
    // Guard against duplicate target paths inside the archive.
    let path = p.to;
    const n = used.get(path) ?? 0;
    used.set(p.to, n + 1);
    if (n > 0) {
      const dot = path.lastIndexOf(".");
      path = dot >= 0 ? `${path.slice(0, dot)}-${n + 1}${path.slice(dot)}` : `${path}-${n + 1}`;
    }
    files[path] = new Uint8Array(p.data);
  }
  const zipped = zipSync(files, { level: 0 }); // PDFs are already compressed
  const blob = new Blob([zipped], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type RenameOutcome = { ok: number; failed: string[]; denied: boolean };

/** Rename files in place on disk. Requests readwrite once per distinct root. */
export async function renameInPlace(plans: RenamePlan[]): Promise<RenameOutcome> {
  const renamable = plans.filter((p) => typeof p.handle?.move === "function");
  if (!renamable.length) return { ok: 0, failed: [], denied: false };

  // Ask for write permission once per picked root, upgrading from read.
  const roots = new Set<FsDirHandle>();
  for (const p of renamable) if (p.root) roots.add(p.root);
  for (const root of roots) {
    if (root.queryPermission && (await root.queryPermission({ mode: "readwrite" })) === "granted") continue;
    const granted = root.requestPermission ? await root.requestPermission({ mode: "readwrite" }) : "denied";
    if (granted !== "granted") return { ok: 0, failed: [], denied: true };
  }

  let ok = 0;
  const failed: string[] = [];
  for (const p of renamable) {
    if (p.base === p.from.split(/[/\\]|\s›\s/).pop()) continue; // already named right
    try {
      await p.handle!.move!(p.base);
      ok++;
    } catch {
      failed.push(p.from);
    }
  }
  return { ok, failed, denied: false };
}

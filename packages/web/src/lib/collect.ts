/**
 * Browser file-collection layer — turns whatever the user supplies (a picked
 * folder, individual files, or a drag-and-drop of either) into a flat list of
 * PDFs with their bytes, ready for the engine. Everything stays in the page; no
 * upload, no backend. Zips are expanded in-memory so a folder of zipped invoices
 * works too.
 *
 * Each collected PDF carries a {@link Src} so a later rename/extract action knows
 * where the file physically lives, plus a friendly `rel` label for display.
 */
import { unzipSync } from "fflate";
import type { Src } from "@kah/core";

/** Minimal File System Access handle shapes we use (the DOM lib types vary). */
export type FsPerm = "granted" | "denied" | "prompt";
export type FsFileHandle = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  /** Rename within the same directory (Chromium ≥110). Present ⇒ in-place rename possible. */
  move?(name: string): Promise<void>;
  requestPermission?(o: { mode: "read" | "readwrite" }): Promise<FsPerm>;
  queryPermission?(o: { mode: "read" | "readwrite" }): Promise<FsPerm>;
};
export type FsDirHandle = {
  kind: "directory";
  name: string;
  entries(): AsyncIterableIterator<[string, FsFileHandle | FsDirHandle]>;
  requestPermission?(o: { mode: "read" | "readwrite" }): Promise<FsPerm>;
  queryPermission?(o: { mode: "read" | "readwrite" }): Promise<FsPerm>;
};

export type CollectedPdf = {
  src: Src;
  rel: string;
  data: ArrayBuffer;
  /** Writable file handle (directory-picker only) — enables in-place rename. */
  handle?: FsFileHandle;
  /** The picked root dir — used to request readwrite permission once before renaming. */
  root?: FsDirHandle;
};

const isPdf = (name: string) => /\.pdf$/i.test(name);
const isZip = (name: string) => /\.zip$/i.test(name);

/** Expand a .zip's PDF entries into CollectedPdfs, labelled "archive.zip › entry.pdf". */
function fromZip(zipName: string, zipRel: string, bytes: Uint8Array): CollectedPdf[] {
  const out: CollectedPdf[] = [];
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return out; // not a readable zip — skip rather than break the whole run
  }
  for (const [entry, data] of Object.entries(entries)) {
    if (!isPdf(entry) || data.length === 0) continue;
    out.push({
      src: { kind: "zip", zip: zipRel, entry },
      rel: `${zipName} › ${entry}`,
      // copy out of the shared zip buffer so each PDF owns its bytes
      data: data.slice().buffer,
    });
  }
  return out;
}

/** Read one dropped/picked File into CollectedPdf(s) (a zip yields several).
 *  A writable handle/root is attached only for single PDFs from the directory
 *  picker — zip entries can't be renamed in place. */
async function fromFile(
  file: File,
  rel: string,
  fs?: { handle: FsFileHandle; root: FsDirHandle },
): Promise<CollectedPdf[]> {
  const buf = await file.arrayBuffer();
  if (isZip(file.name)) return fromZip(file.name, rel, new Uint8Array(buf));
  if (isPdf(file.name))
    return [{ src: { kind: "file", path: rel }, rel, data: buf, handle: fs?.handle, root: fs?.root }];
  return [];
}

// ---- 1) <input type="file"> (multiple, and webkitdirectory folder input) ----

/** Called as files are collected, with the running count — for a progress UI. */
export type OnFound = (count: number) => void;

export async function collectFromFileList(
  list: FileList | File[],
  onFound?: OnFound,
): Promise<CollectedPdf[]> {
  const files = Array.from(list);
  const out: CollectedPdf[] = [];
  for (const f of files) {
    // webkitdirectory sets webkitRelativePath ("Rechnungen/2025/foo.pdf"); plain
    // multi-select leaves it empty, so fall back to the bare filename.
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    out.push(...(await fromFile(f, rel)));
    onFound?.(out.length);
  }
  return out;
}

// ---- 2) File System Access API directory picker (Chrome/Edge) ----

type WindowWithPicker = Window & {
  showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FsDirHandle>;
};

export function supportsDirectoryPicker(): boolean {
  return typeof (window as WindowWithPicker).showDirectoryPicker === "function";
}

async function walkHandle(
  dir: FsDirHandle,
  prefix: string,
  out: CollectedPdf[],
  root: FsDirHandle,
  onFound?: OnFound,
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      await walkHandle(handle, rel, out, root, onFound);
    } else if (isPdf(name) || isZip(name)) {
      out.push(...(await fromFile(await handle.getFile(), rel, { handle, root })));
      onFound?.(out.length);
    }
  }
}

/** Open the native folder picker and read every PDF beneath it. Null if cancelled. */
export async function collectFromDirectoryPicker(onFound?: OnFound): Promise<CollectedPdf[] | null> {
  const picker = (window as WindowWithPicker).showDirectoryPicker;
  if (!picker) return null;
  let root: FsDirHandle;
  try {
    // Read-only to scan; readwrite is requested lazily only when renaming.
    root = await picker({ mode: "read" });
  } catch {
    return null; // user cancelled the dialog
  }
  const out: CollectedPdf[] = [];
  await walkHandle(root, root.name, out, root, onFound);
  return out;
}

// ---- 3) Drag-and-drop of files AND folders (webkitGetAsEntry) ----

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
  file(cb: (f: File) => void, err: (e: unknown) => void): void;
  createReader(): { readEntries(cb: (e: FsEntry[]) => void, err: (e: unknown) => void): void };
};

const entryFile = (entry: FsEntry) =>
  new Promise<File>((resolve, reject) => entry.file(resolve, reject));

const readDir = (entry: FsEntry) =>
  new Promise<FsEntry[]>((resolve, reject) => {
    const reader = entry.createReader();
    const all: FsEntry[] = [];
    const pump = () =>
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all);
        else {
          all.push(...batch);
          pump(); // readEntries returns in chunks; keep calling until empty
        }
      }, reject);
    pump();
  });

async function walkEntry(entry: FsEntry, out: CollectedPdf[], onFound?: OnFound): Promise<void> {
  if (entry.isFile) {
    const rel = entry.fullPath.replace(/^\//, "");
    out.push(...(await fromFile(await entryFile(entry), rel)));
    onFound?.(out.length);
  } else if (entry.isDirectory) {
    for (const child of await readDir(entry)) await walkEntry(child, out, onFound);
  }
}

/** Collect PDFs from a drop, descending into any dropped folders. */
export async function collectFromDataTransfer(dt: DataTransfer, onFound?: OnFound): Promise<CollectedPdf[]> {
  const items = Array.from(dt.items).filter((it) => it.kind === "file");
  const entries = items
    .map((it) => (it as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.())
    .filter((e): e is FsEntry => !!e);

  if (entries.length) {
    const out: CollectedPdf[] = [];
    for (const entry of entries) await walkEntry(entry, out, onFound);
    return out;
  }
  // No entry API (rare) — fall back to the flat file list.
  return collectFromFileList(dt.files, onFound);
}

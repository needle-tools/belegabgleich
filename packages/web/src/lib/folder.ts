/**
 * Writing into, and watching, a picked folder — the two things the read-only
 * collection layer ({@link ./collect}) deliberately doesn't do.
 *
 *  - {@link saveIntoFolder} puts a downloaded Beleg where it belongs: beside the
 *    statement it settles, under its canonical name, instead of leaving it in the
 *    Downloads folder. Needs a one-time readwrite grant on the picked root.
 *  - {@link watchFolder} reports when PDFs appear in (or vanish from) the folder,
 *    so the report picks up an invoice saved from the browser without the user
 *    dropping it a second time.
 *
 * Everything stays on the machine — same guarantee as the rest of the app.
 */
import type { FsDirHandle, FsFileHandle } from "./collect";

/** Ask for write access once per picked root (upgrading the read-only grant). */
export async function ensureWritable(root: FsDirHandle): Promise<boolean> {
  const opts = { mode: "readwrite" } as const;
  if (root.queryPermission && (await root.queryPermission(opts)) === "granted") return true;
  if (!root.requestPermission) return false;
  try {
    return (await root.requestPermission(opts)) === "granted";
  } catch {
    // requestPermission throws without user activation — treat as "not now".
    return false;
  }
}

/** Re-grant read access to a folder restored from a previous session. */
export async function ensureReadable(root: FsDirHandle): Promise<boolean> {
  const opts = { mode: "read" } as const;
  if (root.queryPermission && (await root.queryPermission(opts)) === "granted") return true;
  if (!root.requestPermission) return false;
  try {
    return (await root.requestPermission(opts)) === "granted";
  } catch {
    return false; // no user activation — the user clicks "wieder verbinden"
  }
}

/** True when this handle can be written to at all (Chromium with the picker). */
export function canWriteInto(root: FsDirHandle | undefined): root is FsDirHandle {
  return !!root?.getFileHandle && !!root?.getDirectoryHandle;
}

async function subdirHandle(root: FsDirHandle, subdir: string): Promise<FsDirHandle> {
  let dir = root;
  for (const part of subdir.split("/").filter((p) => p && p !== "." && p !== "..")) {
    if (!dir.getDirectoryHandle) throw new Error("Ordner kann nicht angelegt werden");
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

/** A name that isn't taken yet in `dir` ("foo.pdf" → "foo (2).pdf"). */
async function freeName(dir: FsDirHandle, wanted: string): Promise<string> {
  const base = wanted.replace(/[\\/]/g, "_") || "beleg.pdf";
  let name = base;
  for (let n = 2; ; n++) {
    let taken = true;
    try {
      await dir.getFileHandle!(name);
    } catch {
      taken = false;
    }
    if (!taken) return name;
    const dot = base.lastIndexOf(".");
    name = dot > 0 ? `${base.slice(0, dot)} (${n})${base.slice(dot)}` : `${base} (${n})`;
  }
}

/**
 * Write a PDF into `root/subdir` under `name`, without overwriting anything.
 * Returns the path relative to the root plus the new file's handle (so it can be
 * renamed in place later like any other collected file).
 *
 * Filing the same invoice twice (downloaded again, dropped again) is common and
 * must not litter the folder with copies: a file of that name whose size already
 * matches is treated as the same document and kept as is.
 */
export async function saveIntoFolder(
  root: FsDirHandle,
  subdir: string,
  name: string,
  data: ArrayBuffer,
): Promise<{ path: string; handle: FsFileHandle; duplicate: boolean }> {
  const dir = await subdirHandle(root, subdir);
  if (!dir.getFileHandle) throw new Error("Ordner ist nicht beschreibbar");
  const rel = (n: string) => (subdir ? `${subdir}/${n}` : n);

  const wanted = name.replace(/[\\/]/g, "_") || "beleg.pdf";
  try {
    const existing = await dir.getFileHandle(wanted);
    if ((await existing.getFile()).size === data.byteLength) {
      return { path: rel(wanted), handle: existing, duplicate: true };
    }
  } catch {
    /* not there yet — write it below */
  }

  const finalName = await freeName(dir, wanted);
  const handle = await dir.getFileHandle(finalName, { create: true });
  if (!handle.createWritable) throw new Error("Datei kann nicht geschrieben werden");
  const w = await handle.createWritable();
  await w.write(data);
  await w.close();
  return { path: rel(finalName), handle, duplicate: false };
}

// ---- watching -------------------------------------------------------------

type ObserverCtor = new (cb: (records: unknown[]) => void) => {
  observe(handle: FsDirHandle, opts?: { recursive?: boolean }): Promise<void>;
  disconnect(): void;
};

/**
 * Call `onChange` when the PDFs/ZIPs under `root` change. Uses the native
 * FileSystemObserver where the browser has it, and otherwise polls the listing —
 * cheap, because it only enumerates directory entries and never reads a file.
 * Polling pauses while the tab is hidden and while access isn't granted (a timer
 * must never trigger a permission prompt). Returns a stop function.
 */
export function watchFolder(root: FsDirHandle, onChange: () => void, intervalMs = 5000): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: { disconnect(): void } | null = null;
  let baseline: string | null = null;

  async function signature(): Promise<string> {
    const names: string[] = [];
    async function walk(dir: FsDirHandle, prefix: string) {
      for await (const [name, handle] of dir.entries()) {
        const rel = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === "directory") await walk(handle, rel);
        else if (/\.(pdf|zip)$/i.test(name)) names.push(rel);
      }
    }
    await walk(root, "");
    return names.sort().join("\n");
  }

  async function poll() {
    try {
      const granted = root.queryPermission ? await root.queryPermission({ mode: "read" }) : "granted";
      if (document.visibilityState === "visible" && granted === "granted") {
        const sig = await signature();
        if (baseline === null) baseline = sig;
        else if (sig !== baseline) {
          baseline = sig;
          onChange();
        }
      }
    } catch {
      /* folder moved or access revoked — stay quiet and try again */
    }
    if (!stopped) timer = setTimeout(poll, intervalMs);
  }

  const Observer = (window as unknown as { FileSystemObserver?: ObserverCtor }).FileSystemObserver;
  if (Observer) {
    try {
      const obs = new Observer((records) => {
        if (!stopped && records.length) onChange();
      });
      observer = obs;
      // observe() is async and rejects e.g. where recursive watching isn't
      // supported — fall back to polling rather than watching nothing.
      obs.observe(root, { recursive: true }).catch(() => {
        observer = null;
        if (!stopped) poll();
      });
    } catch {
      observer = null;
    }
  }
  if (!observer) poll();

  return () => {
    stopped = true;
    clearTimeout(timer);
    try {
      observer?.disconnect();
    } catch {
      /* already gone */
    }
  };
}

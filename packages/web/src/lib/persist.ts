/**
 * Session persistence so a page refresh doesn't lose the user's work — same idea
 * as the original abrechnungen tool. Everything stays on the machine: the result
 * is written to IndexedDB, which structured-clones both the invoice ArrayBuffers
 * (for ZIP export) and any File System Access handles (for in-place rename, after
 * a permission re-grant). No network, no localStorage string juggling.
 *
 * Clearing is one call (clearSession), wired to the "Andere Dateien" reset so the
 * user can wipe the stored financial PDFs whenever they want.
 */
import type { RunResult } from "./engine";

const DB_NAME = "kah";
const STORE = "session";
const KEY = "current";

function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    };
  });
}

/**
 * A session-storable copy: drop everything that isn't structured-cloneable or is
 * heavy — the invoices' PDF bytes + File System handles, and the rename plans
 * (which carry the same bytes/handles). Re-matching after a restore needs only the
 * plain charges + invoice rows; renaming is a live-session action. Keeping these
 * out also avoids a DataCloneError and bloating IndexedDB with every PDF.
 */
function toStorable(result: RunResult): RunResult {
  const lite = {
    entries: result.entries,
    statements: result.statements,
    statementFiles: result.statementFiles ?? [],
    parserIds: result.parserIds,
    period: result.period,
    invoiceCount: result.invoiceCount,
    emptyPdfs: result.emptyPdfs,
    renames: [], // bytes/handles can't survive the clone; recomputed on next run
    charges: result.charges,
    invoices: result.invoices.map((i) => ({ row: i.row })), // strip pdf bytes/handle
  };
  // Belt-and-suspenders: a JSON round-trip guarantees the value is
  // structured-cloneable for IndexedDB — anything unexpected/non-serializable is
  // dropped rather than throwing a DataCloneError. All fields above are plain JSON.
  return JSON.parse(JSON.stringify(lite)) as RunResult;
}

/** Persist the current run. Best-effort: never throws (e.g. private mode / quota). */
export async function saveSession(result: RunResult): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.put(toStorable(result), KEY));
  } catch {
    /* storage unavailable — the app still works, just without persistence */
  }
}

/** Restore the last run, or null if none / unreadable. */
export async function loadSession(): Promise<RunResult | null> {
  try {
    return (await withStore<RunResult | undefined>("readonly", (s) => s.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

/** Forget the stored session (and its PDF bytes). */
export async function clearSession(): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(KEY));
  } catch {
    /* ignore */
  }
}

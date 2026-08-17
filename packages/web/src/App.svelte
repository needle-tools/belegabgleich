<script lang="ts">
  /**
   * The tool, at /app/.
   *
   * The marketing pages around it (landing, audience pages, /wissen/,
   * /datenschutz/) are generated as static HTML by site/build.mjs — this
   * component is only the working surface. Header and footer deliberately use
   * the same classes as those pages (styled in public/site.css) so moving
   * between them doesn't feel like two different sites.
   */
  import { onMount, untrack } from "svelte";
  import CompletenessMeter from "./lib/CompletenessMeter.svelte";
  import ReportRow from "./lib/ReportRow.svelte";
  import GroupRow from "./lib/GroupRow.svelte";
  import Dropzone from "./lib/Dropzone.svelte";
  import DropOverlay from "./lib/DropOverlay.svelte";
  import PickerModal from "./lib/PickerModal.svelte";
  import RenamePanel from "./lib/RenamePanel.svelte";
  import { MOCK_ENTRIES, MOCK_PERIOD, MOCK_STATEMENT, DEMO_SOURCE_PATHS } from "./lib/mock";
  import { summarize, groupEntries, type ReportEntry } from "./lib/report";
  import type { RunResult, RunError, RunProgress } from "./lib/engine";
  import { collectFromDirectory, type CollectedPdf, type FsDirHandle } from "./lib/collect";
  import { watchFolder, ensureWritable, ensureReadable } from "./lib/folder";
  import { fileIntoFolder, type FileTarget } from "./lib/filing";
  import { downloadCsv } from "./lib/csv";
  import { tooltip } from "./lib/tooltip";
  import { saveSession, loadSession, clearSession, saveFolders, loadFolders } from "./lib/persist";
  import { initAnalytics, track, bucket } from "@kah/analytics";

  const version = `${__GIT_SHA__ || "dev"} – ${__BUILD_TIME__.slice(0, 10)}`;

  // Live report once the user loads their own files.
  let result = $state<RunResult | null>(null);
  // The demo, run from the bundled PDFs so it's a real, interactive session
  // (the picker matches against it). Shown whenever there's no real result.
  let demoResult = $state<RunResult | null>(null);
  let busy = $state(false);
  let errorMsg = $state("");
  // Per-PDF reading progress, shown in the dropzone while the engine works.
  let progress = $state<RunProgress | null>(null);
  // All sources collected so far — multiple folders/files accumulate (deduped by rel).
  let sources = $state<CollectedPdf[]>([]);
  // The booking whose "Beleg zuordnen" picker is open, if any.
  let pickerEntry = $state<ReportEntry | null>(null);
  function openPicker(e: ReportEntry) {
    pickerEntry = e;
    // Ask for write access here, on the click that opens the picker: it's a real
    // user gesture, and the moment the user has clearly decided to add a Beleg.
    // Doing it later, when the file is dropped, risks Chrome refusing the prompt
    // for lack of transient activation — and then nothing gets filed, silently.
    const t = targetFor(e);
    if (t) void ensureWritable(t.root);
  }

  const live = $derived(result !== null); // true only for the user's own data
  // The report currently on screen: the user's result if loaded, else the demo,
  // else the instant placeholder until the demo run finishes.
  const active = $derived(result ?? demoResult);
  const entries = $derived<ReportEntry[]>(active ? active.entries : MOCK_ENTRIES);
  const summary = $derived(summarize(entries));
  const period = $derived(active ? active.period || "—" : MOCK_PERIOD);
  const statementLabel = $derived(
    active ? active.statements.join(" · ") || "Auszug" : MOCK_STATEMENT,
  );

  let menuOpen = $state(false);
  const closeMenu = () => (menuOpen = false);

  type Filter = "missing" | "all" | "matched";
  let filter = $state<Filter>("missing");

  // How the rows are ordered. A–Z first: looking for one vendor's Beleg is the
  // common move, and an alphabetical list is the one you can scan without reading.
  type Sort = "abc" | "date" | "doc";
  let sort = $state<Sort>("abc");
  const SORTS: { id: Sort; label: string; hint: string }[] = [
    { id: "abc", label: "A–Z", hint: "Nach Anbieter alphabetisch" },
    { id: "date", label: "Datum", hint: "Neueste Buchung zuerst" },
    { id: "doc", label: "Dokument", hint: "In der Reihenfolge, in der die Buchungen im Auszug stehen" },
  ];
  const byName = (a: ReportEntry, b: ReportEntry) =>
    a.provider.localeCompare(b.provider, "de", { sensitivity: "base" });
  const byDate = (a: ReportEntry, b: ReportEntry) => b.date.localeCompare(a.date);
  // Rows from a session stored before the position was kept have no `order`; they
  // keep their relative order at the end rather than jumping around.
  const byDoc = (a: ReportEntry, b: ReportEntry) =>
    (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
  const comparator = $derived(
    sort === "abc"
      ? (a: ReportEntry, b: ReportEntry) => byName(a, b) || byDate(a, b)
      : sort === "date"
        ? (a: ReportEntry, b: ReportEntry) => byDate(a, b) || byName(a, b)
        : (a: ReportEntry, b: ReportEntry) => byDoc(a, b) || byDate(a, b),
  );

  const visible = $derived(
    entries
      .filter((e) =>
        filter === "all" ? true : filter === "missing" ? e.status === "missing" : e.status === "matched",
      )
      .sort(comparator),
  );

  // Collapse recurring same-account / one-invoice rows into expandable groups.
  const groups = $derived(groupEntries(visible));

  const filters = $derived<{ id: Filter; label: string; count: number }[]>([
    { id: "missing", label: "Fehlend", count: summary.missing },
    { id: "matched", label: "Zugeordnet", count: summary.matched },
    { id: "all", label: "Alle", count: entries.length },
  ]);

  /** `auto`: added by the folder watcher rather than by the user — don't count it
   *  as a folder selection and don't yank the filter out from under them. */
  async function onLoad(pdfs: CollectedPdf[], opts: { auto?: boolean } = {}): Promise<RunResult | null> {
    busy = true;
    errorMsg = "";
    // Accumulate across drops/picks so several folders or files can be added.
    const seen = new Set(sources.map((p) => p.rel));
    const merged = [...sources, ...pdfs.filter((p) => !seen.has(p.rel))];
    sources = merged;
    void rememberFolders(pdfs); // keep the folder itself across reloads
    if (!opts.auto) track("folder_selected", { bucket: bucket(merged.length) });
    try {
      // Lazy-load the engine so pdf.js (the heavy chunk) only downloads on first use.
      const { run, addInvoices } = await import("./lib/engine");
      const onP = (p: RunProgress) => (progress = p);
      // With a report already in hand (live, or restored from the session), match
      // the new PDFs against the charges we already parsed — the statement PDF
      // need not still be present. Only the very first load runs from scratch.
      const r = result?.charges?.length
        ? await addInvoices(result, pdfs, onP)
        : await run(merged, onP);
      result = r;
      if (!opts.auto) filter = "missing";
      saveSession(r); // survive a refresh (local only)
      track("statement_detected", { parser: r.parserIds[0] });
      track("report_generated", { bucket: bucket(r.entries.length) });
      return r;
    } catch (e) {
      const err = e as RunError;
      if (err?.code === "no_statement") {
        errorMsg =
          err.invoiceCount > 0
            ? "Kein Kontoauszug erkannt. Lege auch deinen Kontoauszug oder deine Kreditkartenabrechnung dazu."
            : "Keine lesbaren PDFs gefunden. Es werden Sparkasse-Auszüge und Rechnungs-PDFs mit Text unterstützt.";
      } else {
        // "Etwas ist schiefgelaufen" without the reason is a dead end for everyone,
        // including us — say what broke and leave the full error in the console.
        console.error("[load] fehlgeschlagen:", e);
        const detail = e instanceof Error ? e.message : String(e ?? "");
        errorMsg = `Beim Lesen ist etwas schiefgelaufen${detail ? `: ${detail}` : ""}. Bitte versuche es erneut (Details in der Browser-Konsole).`;
      }
      return null;
    } finally {
      busy = false;
    }
  }

  /** Fetch the bundled demo PDFs and run them into a real result. */
  async function loadDemoResult(): Promise<RunResult | null> {
    try {
      const pdfs: CollectedPdf[] = await Promise.all(
        DEMO_SOURCE_PATHS.map(async (path) => {
          const data = await (await fetch(path)).arrayBuffer();
          const rel = path.replace(/^\/demo\//, "");
          return { rel, data, src: { kind: "file", path: rel } } as CollectedPdf;
        }),
      );
      const { run } = await import("./lib/engine");
      return await run(pdfs);
    } catch {
      return null;
    }
  }

  // ---- filing a dropped Beleg into the folder it belongs to -----------------

  /** Display path of the statement a booking came from. With several statements
   *  loaded, the one that actually carries this charge. */
  function statementRelFor(entry: ReportEntry): string | undefined {
    const srcs = result?.statementSources ?? [];
    if (!srcs.length) return result?.statementFiles?.[0];
    if (srcs.length === 1) return srcs[0].rel;
    const hit = srcs.find((s) =>
      s.charges.some((c) => c.date === entry.date && Math.abs(c.amount - entry.amount) <= 0.01),
    );
    return (hit ?? srcs[0]).rel;
  }

  /**
   * Where a Beleg for this booking belongs: the folder holding its statement —
   * usually a per-month subfolder, and the invoices belong next to it rather than
   * in the top folder. Null when the files didn't come from the folder picker
   * (a plain drag-and-drop gives no writable handle), which keeps the old
   * memory-only behaviour.
   */
  /** The folder part of a display rel: "Belege/10/Auszug.pdf" → ["Belege", "10"]. */
  function relFolder(rel: string): { rootName: string; subdir: string } {
    const parts = rel.split("/");
    const rootName = parts.shift() ?? "";
    parts.pop(); // the file itself
    return { rootName, subdir: parts.join("/") };
  }

  function targetFor(entry: ReportEntry | undefined): FileTarget | null {
    if (!entry || !result) return null;
    const rel = statementRelFor(entry);
    if (!rel) {
      console.info("[filing] kein Auszug bekannt, zu dem dieser Beleg gehören könnte");
      return null;
    }
    const { rootName, subdir } = relFolder(rel);
    // The statement's own file is the first choice, but it need not still be in
    // hand: a restored session keeps the bookings and drops the PDFs. The rel still
    // names the picked folder, so any file collected from that same folder gets us
    // back to the right handle — and failing that, we file next to whatever else
    // came out of a real folder rather than not filing at all.
    const own = sources.find((p) => p.rel === rel)?.root;
    const sameRoot = sources.find((p) => p.root?.name === rootName)?.root ?? folders.find((f) => f.name === rootName);
    const anyRoot = sources.find((p) => p.root);
    const pick = own ? { root: own, subdir } : sameRoot ? { root: sameRoot, subdir } : null;
    const target =
      pick ??
      (anyRoot?.root
        ? { root: anyRoot.root, subdir: relFolder(anyRoot.rel).subdir }
        : folders[0]
          ? { root: folders[0], subdir }
          : null);
    if (!target) {
      // Worth saying out loud: this is the difference between "filed into your
      // folder" and "only in the report", and it's invisible otherwise.
      console.info(
        `[filing] kein Ordner-Handle für „${rel}" — die Dateien kamen nicht über „Ordner wählen" (oder die Seite wurde seither neu geladen)`,
      );
      return null;
    }
    const label = target.subdir ? `${target.root.name}/${target.subdir}` : target.root.name;
    return { ...target, label };
  }

  /** Folder a drop in the open picker would be saved to, for the picker's hint. */
  const pickerTarget = $derived(pickerEntry ? targetFor(pickerEntry) : null);
  // Outcome of the last picker drop, shown in its feedback block.
  let filedTo = $state<string[]>([]);
  let filedExisting = $state<string[]>([]);
  let filedDenied = $state(false);
  /** Why a Beleg wasn't filed — never leave that silent, it's the whole feature. */
  const filingNote = $derived(
    !live
      ? ""
      : filedDenied
        ? "Nicht im Ordner gespeichert: Der Schreibzugriff wurde abgelehnt. Beim nächsten Zuordnen erlauben — dann landet der Beleg direkt im Ordner."
        : !pickerTarget
          ? "Nicht im Ordner gespeichert: Es gibt keinen beschreibbaren Ordner. Öffne ihn einmal über „Ordner wählen“ (nach einem Neuladen der Seite erneut) — danach werden Belege direkt dort abgelegt."
          : "",
  );

  /**
   * The "Beleg zuordnen" picker: file the dropped invoice into the folder next to
   * its statement (canonical name, nothing overwritten), then match it against the
   * report that's currently on screen — the user's result, or the demo (seeded on
   * demand). Returns the updated result so the picker can report the outcome.
   */
  async function onAssign(pdfs: CollectedPdf[], entry?: ReportEntry): Promise<RunResult | null> {
    busy = true;
    errorMsg = "";
    filedTo = [];
    filedExisting = [];
    filedDenied = false;
    try {
      // Only ever write for the user's own report — the demo has no folder.
      const filed = await fileIntoFolder(pdfs, result ? targetFor(entry) : null);
      filedTo = filed.saved;
      filedExisting = filed.existing;
      filedDenied = filed.denied;
      pdfs = filed.pdfs;
      // Filed documents are part of the folder now; remember them so the watcher
      // doesn't read them back in as a second copy.
      if (filed.saved.length || filed.existing.length) {
        const known = new Set(sources.map((p) => p.rel));
        sources = [...sources, ...pdfs.filter((p) => !known.has(p.rel))];
      }
      const { addInvoices } = await import("./lib/engine");
      if (result) {
        result = await addInvoices(result, pdfs);
        saveSession(result);
        return result;
      }
      let base = demoResult;
      if (!base) base = demoResult = await loadDemoResult();
      if (!base) {
        errorMsg = "Die Demo konnte nicht geladen werden. Bitte lade die Seite neu.";
        return null;
      }
      demoResult = await addInvoices(base, pdfs);
      return demoResult;
    } catch {
      errorMsg = "Beim Prüfen ist etwas schiefgelaufen. Bitte versuche es erneut.";
      return null;
    } finally {
      busy = false;
      progress = null;
    }
  }

  // ---- the picked folders, across reloads -----------------------------------
  // Handles survive in IndexedDB; access does not. So after a refresh the report
  // is back but the folder is "locked" until one click re-grants it — much less
  // work than walking the folder picker again, and it keeps filing, watching and
  // renaming in place working for the rest of the session.
  let folders = $state<FsDirHandle[]>([]);
  /** Restored folders still waiting for that click (by name). */
  let lockedFolders = $state<string[]>([]);
  let reconnecting = $state(false);

  async function rememberFolders(pdfs: CollectedPdf[]) {
    const roots = [...new Set(pdfs.map((p) => p.root).filter((r): r is FsDirHandle => !!r))];
    const add = roots.filter((r) => !folders.some((f) => f === r || f.name === r.name));
    if (!add.length) return;
    const next = [...folders, ...add];
    folders = next;
    lockedFolders = lockedFolders.filter((n) => !add.some((r) => r.name === n));
    await saveFolders(next); // the plain array, not the reactive proxy
  }

  /** Read a (re-)connected folder and fold it into the report. Invoices the
   *  restored session already knows get their bytes and handle back, which is what
   *  re-enables renaming in place and opening the PDF. */
  async function adoptFolder(handle: FsDirHandle) {
    const pdfs = await collectFromDirectory(handle);
    if (!pdfs.length) return;
    if (result) {
      const byRel = new Map(pdfs.map((p) => [p.rel, p]));
      result = {
        ...result,
        invoices: result.invoices.map((i) => (byRel.has(i.row.rel) ? { ...i, pdf: byRel.get(i.row.rel) } : i)),
      };
    }
    await onLoad(pdfs, { auto: true });
  }

  /** The "Ordner wieder verbinden" click: one gesture, one prompt per folder. */
  async function reconnectFolders() {
    if (reconnecting) return;
    reconnecting = true;
    try {
      for (const handle of folders) {
        if (!(await ensureReadable(handle))) continue;
        lockedFolders = lockedFolders.filter((n) => n !== handle.name);
        await adoptFolder(handle);
      }
    } catch (e) {
      console.error("[folders] wieder verbinden fehlgeschlagen:", e);
    } finally {
      reconnecting = false;
    }
  }

  // ---- keeping the report in step with the folder ---------------------------
  // A PDF saved into the picked folder (by this app, by the browser's download, or
  // by hand) is read and matched on its own — no second drop, no "read again".
  // Only folders picked through the directory picker can be watched; dropped files
  // give no handle to watch.

  // Every folder we hold a handle for — including ones restored from a previous
  // session. watchFolder itself stays quiet while access isn't granted, so a
  // still-locked folder simply waits for the reconnect click.
  const watchedRoots = $derived(folders);
  // Identity of the watched set, so re-reading a folder doesn't rebuild watchers.
  const watchKey = $derived(watchedRoots.map((r) => r.name).join("|"));
  /** Short note in the dropzone when the watcher added something. */
  let autoNotice = $state("");
  let autoTimer: ReturnType<typeof setTimeout> | undefined;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const dirtyRoots = new Set<FsDirHandle>();

  function scheduleRescan(root: FsDirHandle) {
    dirtyRoots.add(root);
    clearTimeout(autoTimer);
    // Coalesce bursts (a ZIP unpacked into the folder drops many files at once),
    // and wait until the engine is idle — a run of our own writes files too.
    autoTimer = setTimeout(() => {
      if (busy) return scheduleRescan(root);
      const roots = [...dirtyRoots];
      dirtyRoots.clear();
      rescan(roots);
    }, 800);
  }

  /** Read the watched folders again and feed anything new into the report. */
  async function rescan(roots: FsDirHandle[]) {
    const known = new Set(sources.map((p) => p.rel));
    const fresh: CollectedPdf[] = [];
    for (const root of roots) {
      try {
        for (const pdf of await collectFromDirectory(root)) if (!known.has(pdf.rel)) fresh.push(pdf);
      } catch {
        /* access revoked or folder gone — nothing to add */
      }
    }
    if (!fresh.length) return;
    await onLoad(fresh, { auto: true });
    autoNotice = `${fresh.length} neue ${fresh.length === 1 ? "Datei" : "Dateien"} aus dem Ordner ergänzt`;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (autoNotice = ""), 8000);
  }

  $effect(() => {
    watchKey;
    if (!watchKey) return;
    const stops = untrack(() => watchedRoots).map((root) =>
      watchFolder(root, () => scheduleRescan(root)),
    );
    return () => {
      stops.forEach((stop) => stop());
      clearTimeout(autoTimer);
    };
  });

  /**
   * Drop a single loaded document from the report, together with what it
   * contributed — a statement takes its bookings with it, an invoice releases
   * the bookings it covered back to "fehlt". Re-assembles from data already in
   * memory, so nothing is re-read. Removing the last statement leaves nothing to
   * reconcile against, so that falls back to a full reset.
   */
  async function onRemove(rel: string) {
    if (!result) return;
    const { removeDocument } = await import("./lib/engine");
    const next = removeDocument(result, rel);
    // Drop it from the accumulator too, or the next load would re-add it.
    sources = sources.filter((p) => p.rel !== rel);
    if (!next) {
      reset();
      return;
    }
    result = next;
    saveSession(next);
  }

  function reset() {
    result = null;
    errorMsg = "";
    filter = "missing";
    sources = [];
    folders = [];
    lockedFolders = [];
    awaitingDemo = false;
    clearSession(); // wipes the stored report AND the remembered folders
    // fall back to the demo; reload it if it was cleared/never loaded
    if (!demoResult) loadDemoResult().then((d) => { if (!result && !demoResult) demoResult = d; });
  }

  function exportCsv() {
    downloadCsv(entries);
    track("csv_exported", { bucket: bucket(entries.length) });
  }

  const DEMO_FILES = ["Kontoauszug-Demo.pdf", "Kreditkartenabrechnung-Demo.pdf"];
  /**
   * Downloading the demo files is only half a step — a browser download lands
   * silently in a folder and the page looks unchanged. So after the click we
   * put the dropzone into its "waiting for those files" state and scroll to it,
   * making the next move the obvious one.
   */
  let awaitingDemo = $state(false);
  let uploadEl: HTMLElement;

  function downloadDemo() {
    for (const f of DEMO_FILES) {
      const a = document.createElement("a");
      a.href = `/demo/${f}`;
      a.download = f;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    awaitingDemo = true;
    uploadEl?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  onMount(() => {
    // Anonymous, cookieless usage stats via our own self-hosted Rybbit — and only
    // on the live site, never on localhost, previews or forks. The site id is not a
    // secret (it ships in the client script regardless); env vars override it for
    // other deployments.
    const onProd =
      typeof location !== "undefined" &&
      (location.hostname === "belegabgleich.de" ||
        location.hostname.endsWith(".belegabgleich.de"));
    initAnalytics({
      siteId: onProd ? import.meta.env.VITE_RYBBIT_SITE_ID || "ed99aaf8d576" : "",
      host: import.meta.env.VITE_RYBBIT_HOST || "https://analytics-2.needle.tools",
    });
    track("app_loaded");
    // Restore the previous session (if any) so a refresh doesn't lose the report;
    // otherwise seed the interactive demo from the bundled PDFs.
    loadSession().then(async (r) => {
      if (r && !result) { result = r; return; }
      if (!result && !demoResult) {
        const d = await loadDemoResult();
        if (!result && !demoResult) demoResult = d;
      }
    });
    // Bring back the folders themselves. Access usually needs a click (Chrome asks
    // again each session); where it's still granted we just pick up where we were.
    loadFolders().then(async (saved) => {
      if (!saved.length) return;
      folders = saved;
      const locked: string[] = [];
      for (const handle of saved) {
        const granted = handle.queryPermission
          ? (await handle.queryPermission({ mode: "read" })) === "granted"
          : false;
        if (granted) await adoptFolder(handle);
        else locked.push(handle.name);
      }
      lockedFolders = locked;
    });
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape") { menuOpen = false; pickerEntry = null; } }} />

<DropOverlay onload={onLoad} disabled={busy || pickerEntry !== null} />

{#if pickerEntry}
  <PickerModal
    entry={pickerEntry}
    loadError={errorMsg}
    onload={onAssign}
    onclose={() => (pickerEntry = null)}
    targetLabel={pickerTarget?.label ?? ""}
    saved={filedTo}
    existing={filedExisting}
    denied={filedDenied}
    note={filingNote}
  />
{/if}

<div class="header-pill-shell">
  <header class="header-pill" data-menu-open={menuOpen}>
    <a class="header-pill-brand" href="/" aria-label="Belegabgleich — Startseite">
      <img class="header-pill-logo" src="/icon.svg" alt="" width="40" height="40" />
      <span class="header-pill-brand-label">Belegabgleich</span>
    </a>
    <nav class="header-pill-nav" aria-label="Hauptnavigation">
      <a class="header-pill-link" href="/#so-gehts">So geht's</a>
      <a class="header-pill-link" href="/wissen/">Wissen</a>
      <a class="header-pill-link" href="/datenschutz/">Datenschutz</a>
    </nav>
    <div class="header-pill-actions">
      <a class="ghicon" href="https://github.com/needle-tools/belegabgleich" target="_blank" rel="noopener noreferrer" aria-label="Quellcode auf GitHub" title="Quellcode auf GitHub">
        <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
      </a>
    </div>
    <button
      class="header-pill-hamburger"
      type="button"
      aria-label="Menü"
      aria-expanded={menuOpen}
      aria-controls="site-menu"
      onclick={() => (menuOpen = !menuOpen)}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <line class="hamburger-top" x1="3" y1="7" x2="21" y2="7" />
        <line class="hamburger-mid" x1="3" y1="12" x2="21" y2="12" />
        <line class="hamburger-bot" x1="3" y1="17" x2="21" y2="17" />
      </svg>
    </button>
    <div class="header-pill-dropdown" id="site-menu">
      <nav class="header-pill-dropdown-nav" aria-label="Menü">
        <a class="header-pill-link" href="/" onclick={closeMenu}>Start</a>
        <a class="header-pill-link" href="/#so-gehts" onclick={closeMenu}>So geht's</a>
        <a class="header-pill-link" href="/wissen/" onclick={closeMenu}>Wissen</a>
        <a class="header-pill-link" href="/datenschutz/" onclick={closeMenu}>Datenschutz</a>
      </nav>
      <div class="header-pill-dropdown-actions">
        <a class="btn btn-ghost" href="https://github.com/needle-tools/belegabgleich" target="_blank" rel="noopener noreferrer" onclick={closeMenu}>
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
          GitHub
        </a>
      </div>
    </div>
  </header>
</div>

<main id="main">
  <!-- WORKING HEADER — states the job, then gets out of the way -->
  <section class="app-intro">
    <div class="app-intro-copy">
      <h1>Belege abgleichen</h1>
      <p>Lade deinen Kontoauszug oder deine Kreditkartenabrechnung und den Ordner mit
        deinen Rechnungen. Beides wird hier im Browser gelesen — nichts wird hochgeladen.</p>
      <button class="btn btn-ghost btn-sm" type="button" onclick={downloadDemo}>
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10" /></svg>
        Demo-Dateien herunterladen
      </button>
      <span class="demo-hint">
        Kein eigener Auszug zur Hand? Lade zwei erfundene Beispiel-PDFs herunter und
        zieh sie anschließend hier auf die Seite — der Ablauf ist derselbe wie mit
        echten Unterlagen.
      </span>
    </div>

    <div class="app-intro-meter">
      <div class="meter-head">
        <span class="micro-label">Belegquote</span>
        <span class="meter-period">{period}</span>
      </div>
      <CompletenessMeter coverage={summary.coverage} matched={summary.matched} total={summary.total} />
    </div>
  </section>

  <!-- UPLOAD -->
  <section class="upload" id="upload" bind:this={uploadEl}>
    <Dropzone
      onload={onLoad}
      onreset={reset}
      onremove={onRemove}
      {busy}
      {progress}
      {result}
      {errorMsg}
      {awaitingDemo}
      notice={autoNotice}
      locked={lockedFolders}
      {reconnecting}
      onreconnect={reconnectFolders}
    />
  </section>

  <!-- REPORT SHELL -->
  <section class="report" id="report">
    <div class="report-head">
      <div class="report-title">
        <h2>Fehlende Belege</h2>
        <span class="source">{statementLabel}</span>
      </div>
      <div class="segmented-control" role="tablist" aria-label="Filter">
        {#each filters as f (f.id)}
          <button role="tab" aria-selected={filter === f.id} onclick={() => (filter = f.id)}>
            {f.label}<i class="count">{f.count}</i>
          </button>
        {/each}
      </div>
    </div>

    <div class="status-strip" aria-label="Zusammenfassung">
      <div class="status-strip-item">
        <strong class="num">{summary.total}</strong><span class="status-strip-label">Buchungen</span>
      </div>
      <div class="sep" aria-hidden="true"></div>
      <div class="status-strip-item">
        <strong class="num ok">{summary.matched}</strong><span class="status-strip-label">zugeordnet</span>
      </div>
      <div class="sep" aria-hidden="true"></div>
      <div class="status-strip-item">
        <strong class="num warn">{summary.missing}</strong><span class="status-strip-label">fehlend</span>
      </div>
      <div class="sep" aria-hidden="true"></div>
      <div class="status-strip-item">
        <strong class="num">{summary.noInvoice}</strong><span class="status-strip-label">kein Beleg nötig</span>
      </div>
      <div class="strip-spacer"></div>
      <div class="sort-control" role="group" aria-label="Sortierung">
        <span class="sort-label">Sortieren</span>
        <div class="segmented-control">
          {#each SORTS as s (s.id)}
            <button
              type="button"
              aria-pressed={sort === s.id}
              class:is-on={sort === s.id}
              onclick={() => (sort = s.id)}
              use:tooltip={s.hint}
            >
              {s.label}
            </button>
          {/each}
        </div>
      </div>
      <button
        class="btn-export"
        type="button"
        onclick={exportCsv}
        disabled={entries.length === 0}
        use:tooltip={"Alle Buchungen mit Status als CSV speichern — für den Steuerberater (Excel-kompatibel)"}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10" /></svg>
        CSV exportieren
      </button>
    </div>

    {#key `${filter}:${sort}`}
      <ul class="rows">
        {#each groups as group, i (group.key)}
          {#if group.items.length === 1}
            <ReportRow entry={group.items[0]} index={i} onpick={openPicker} />
          {:else}
            <GroupRow {group} index={i} />
          {/if}
        {/each}
      </ul>
    {/key}

    {#if visible.length === 0}
      <p class="empty">Nichts in dieser Ansicht.</p>
    {/if}

    {#if !live}
      <p class="mock-note">Demodaten — lade oben deinen Auszug und deine Rechnungen für den echten Abgleich.</p>
    {/if}

    <p class="accuracy-note">
      Der Abgleich läuft automatisch über Datum, Betrag und erkannten Anbieter und kann
      Belege übersehen oder falsch zuordnen. Ein leerer Fehlend-Bericht ist kein Nachweis
      für eine vollständige Buchführung — bitte prüfe das Ergebnis.
      <a href="/haftungsausschluss/">Haftungsausschluss</a>
    </p>
  </section>

  <!-- AUTO-RENAME -->
  {#if result && result.renames.length > 0}
    <RenamePanel plans={result.renames} />
  {/if}

  <!-- Back into the site: the tool is a destination, not a dead end. -->
  <nav class="app-outro" aria-label="Weiter auf der Seite">
    <a href="/wissen/fehlende-belege-finden/">
      <strong>Wie du fehlende Belege systematisch findest</strong>
      <span>Drei Wege im Vergleich — und worauf es beim Abgleich ankommt.</span>
    </a>
    <a href="/datenschutz/">
      <strong>Was mit deinen Daten passiert</strong>
      <span>Warum hier nichts hochgeladen wird, und was die Statistik misst.</span>
    </a>
  </nav>
</main>

<footer class="site-footer app-footer">
  <div class="site-footer-inner">
    <div class="app-footer-row">
      <span class="app-footer-vendor">
        <strong>Belegabgleich</strong> — ein Open-Source-Werkzeug von
        <a href="https://needle.tools" target="_blank" rel="noopener noreferrer" aria-label="Needle — needle.tools">
          <img src="/logos/logo_needle_black_no_padding.svg" alt="Needle" width="86" height="22" />
        </a>
      </span>
      <nav class="app-footer-links" aria-label="Fußzeile">
        <a href="/">Start</a>
        <a href="/wissen/">Wissen</a>
        <a href="/datenschutz/">Datenschutz</a>
        <a href="/haftungsausschluss/">Haftungsausschluss</a>
        <a href="https://needle.tools/contact/#imprint" target="_blank" rel="noopener noreferrer">Impressum</a>
        <a href="https://github.com/needle-tools/belegabgleich" target="_blank" rel="noopener noreferrer">GitHub</a>
      </nav>
    </div>
    <div class="site-footer-legal">
      <span>© {new Date().getFullYear()} <a href="https://needle.tools" target="_blank" rel="noopener noreferrer">Needle</a> · MIT-Lizenz</span>
      <span class="site-footer-version">{version}</span>
    </div>
  </div>
</footer>

<style>
  /* Header, footer shell, buttons and the base type scale are global
     (public/site.css) so this page and the static pages stay identical. What's
     left here is the working surface itself. */

  /* -- intro ---------------------------------------------------------------- */
  .app-intro {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 40px;
    align-items: center;
    padding: 36px 0 32px;
  }
  .app-intro h1 {
    font-size: var(--type-page-title-size);
    font-weight: var(--type-page-title-weight);
    line-height: var(--type-page-title-line-height);
    letter-spacing: var(--type-page-title-tracking);
  }
  .app-intro p {
    margin: 14px 0 20px;
    max-width: 52ch;
    color: var(--text-secondary);
  }
  .demo-hint {
    display: block;
    margin-top: 10px;
    max-width: 48ch;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .app-intro-meter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 22px 26px;
    background: var(--surface-panel);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }
  .meter-head {
    width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
  }
  .meter-period {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 650;
    font-family: var(--font-family-code);
  }

  /* -- upload --------------------------------------------------------------- */
  .upload {
    margin-bottom: 28px;
    scroll-margin-top: 96px;
  }

  /* -- report --------------------------------------------------------------- */
  .report {
    background: var(--surface-panel);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
    padding: 24px;
    scroll-margin-top: 96px;
  }
  .report-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }
  .report-title h2 {
    font-size: var(--type-section-title-size);
    font-weight: var(--type-section-title-weight);
    letter-spacing: var(--type-section-title-tracking);
  }
  .source {
    display: block;
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  .segmented-control button { font-family: var(--font-family-body); }
  .count {
    margin-left: 6px;
    font-style: normal;
    font-variant-numeric: tabular-nums;
    opacity: 0.6;
  }

  .status-strip { margin-bottom: 16px; flex-wrap: wrap; }
  /* Sort switch: same segmented control as the filter, so the two read as one
     row of controls rather than two kinds of thing. */
  .sort-control {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .sort-label {
    font-size: var(--type-micro-label-size);
    font-weight: var(--type-micro-label-weight);
    letter-spacing: var(--type-micro-label-tracking);
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .sort-control .segmented-control > button {
    font-family: var(--font-family-body);
  }
  /* The shared stylesheet paints aria-selected; these are toggle buttons. */
  .sort-control .segmented-control > button.is-on {
    background: var(--control-segmented-segment-background-selected);
    box-shadow: inset 0 0 0 1px var(--control-segmented-segment-border-color-selected);
    color: var(--text-primary);
  }
  @media (max-width: 720px) {
    .sort-label { display: none; }
  }
  .num {
    font-family: var(--font-family-display);
    font-weight: 800;
    font-size: 1.25rem;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .num.ok { color: var(--accent-brand-deep); }
  .num.warn { color: var(--status-warn-text); }
  .sep { width: 1px; height: 26px; background: var(--border-subtle); }
  .strip-spacer { flex: 1; }
  .btn-export {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 36px;
    padding: 0 14px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: var(--surface-panel);
    color: var(--text-primary);
    font-family: var(--font-family-body);
    font-weight: 700;
    font-size: 0.82rem;
    cursor: pointer;
    transition: scale 0.12s ease, border-color 0.15s ease;
  }
  .btn-export svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .btn-export:hover { border-color: var(--accent-brand-deep); }
  .btn-export:active { scale: 0.96; }
  .btn-export:disabled { opacity: 0.5; cursor: not-allowed; }

  .rows {
    display: grid;
    /* name (flex, truncates) | date | amount | status | action — content-sized
       columns so every row lines up (rows subgrid these tracks). */
    grid-template-columns: minmax(0, 1fr) max-content max-content max-content max-content;
    gap: 8px 16px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  @media (max-width: 640px) {
    .rows { display: flex; flex-direction: column; }
  }
  .empty { color: var(--text-muted); padding: 24px; text-align: center; }
  .mock-note {
    margin: 16px 0 0;
    font-size: 0.8rem;
    color: var(--text-muted);
    text-align: center;
  }
  /* Says plainly that the matching is a guess. Quiet, but always present — the
     report must never read as a certificate of completeness. */
  .accuracy-note {
    margin: 18px 0 0;
    padding-top: 14px;
    border-top: 1px solid var(--border-subtle);
    font-size: 0.79rem;
    line-height: 1.45;
    color: var(--text-muted);
    max-width: 84ch;
  }
  .accuracy-note a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .accuracy-note a:hover { color: var(--text-primary); }

  /* -- outro ---------------------------------------------------------------- */
  .app-outro {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: 12px;
    margin: 48px 0 0;
  }
  .app-outro a {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 18px 22px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--surface-panel);
    text-decoration: none;
    color: inherit;
    transition: border-color 0.16s ease, background 0.16s ease;
  }
  .app-outro a:hover {
    border-color: var(--accent-brand-deep);
    background: var(--surface-panel-muted);
  }
  .app-outro strong {
    font-family: var(--font-family-display);
    font-size: 1rem;
    font-weight: 750;
    letter-spacing: -0.015em;
  }
  .app-outro span { color: var(--text-secondary); font-size: 0.9rem; }

  /* -- footer --------------------------------------------------------------- */
  .app-footer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
  }
  .app-footer-vendor {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    color: var(--text-secondary);
    font-size: 0.92rem;
  }
  .app-footer-vendor strong { color: var(--text-primary); font-weight: 700; }
  .app-footer-vendor img { height: 20px; width: auto; opacity: 0.85; display: block; }
  .app-footer-vendor a:hover img { opacity: 1; }
  .app-footer-links { display: flex; gap: 16px; flex-wrap: wrap; }
  .app-footer-links a {
    color: var(--text-secondary);
    font-size: 0.92rem;
    text-decoration: none;
  }
  .app-footer-links a:hover { color: var(--text-primary); }

  @media (max-width: 860px) {
    .app-intro { grid-template-columns: 1fr; gap: 28px; padding: 28px 0; }
    .app-intro-meter { order: -1; }
  }
  @media (max-width: 560px) {
    .report { padding: 18px; }
  }
</style>

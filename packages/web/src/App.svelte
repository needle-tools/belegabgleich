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
  import ExtrasList from "./lib/ExtrasList.svelte";
  import DuplicatesNote from "./lib/DuplicatesNote.svelte";
  import { openPdfBytes } from "./lib/openBeleg";
  import { MOCK_ENTRIES, MOCK_PERIOD, MOCK_STATEMENT, DEMO_SOURCE_PATHS } from "./lib/mock";
  import { summarize, groupEntries, byAmountDesc, money, statementLabels, rowKey, type EntryGroup, type ReportEntry, type ReportStatus } from "./lib/report";
  import type { RunResult, RunError, RunProgress } from "./lib/engine";
  import { collectFromDirectory, type CollectedPdf, type FsDirHandle } from "./lib/collect";
  import { watchFolder, ensureWritable, ensureReadable, deleteFromFolder } from "./lib/folder";
  import { fileIntoFolder, type FileTarget, type NameHint } from "./lib/filing";
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
  /** The bookings the "Beleg zuordnen" dialog is open for: one row, or a whole
   *  vendor group — you fetch a vendor's invoices in one trip, so you should be able
   *  to hand them over in one drop. */
  let pickerEntries = $state<ReportEntry[] | null>(null);
  const pickerEntry = $derived(pickerEntries?.find((e) => e.status === "missing") ?? pickerEntries?.[0] ?? null);
  const openPicker = (e: ReportEntry) => (pickerEntries = [e]);
  const openGroupPicker = (g: EntryGroup) => (pickerEntries = [...g.items]);

  /**
   * Ask for write access, at the gesture that hands us a file — the drop itself, or
   * the click that opens the file dialog. Merely opening "Beleg holen" used to
   * prompt, which reads as "this page wants to change my files" before the user has
   * offered one, and that is alarming for no reason.
   *
   * It still has to happen on a gesture rather than inside the write: Chrome refuses
   * requestPermission() without transient activation, and by the time a PDF has been
   * read and parsed that activation may be gone.
   */
  function prepareFiling(entry?: ReportEntry) {
    const t = targetFor(entry ?? pickerEntry ?? undefined);
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

  type Filter = "missing" | "all" | "matched" | "no_invoice" | "no_booking";
  let filter = $state<Filter>("missing");

  // How the rows are ordered. A–Z first: looking for one vendor's Beleg is the
  // common move, and an alphabetical list is the one you can scan without reading.
  type Sort = "abc" | "date" | "amount" | "doc";
  let sort = $state<Sort>("abc");
  const SORTS: { id: Sort; label: string; hint: string }[] = [
    { id: "abc", label: "A–Z", hint: "Nach Anbieter alphabetisch" },
    { id: "date", label: "Datum", hint: "Neueste Buchung zuerst" },
    { id: "amount", label: "Betrag", hint: "Größte Buchung zuerst — nach dem in Euro gebuchten Betrag" },
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
        : sort === "amount"
          ? (a: ReportEntry, b: ReportEntry) => byAmountDesc(a, b) || byName(a, b)
          : (a: ReportEntry, b: ReportEntry) => byDoc(a, b) || byDate(a, b),
  );

  /**
   * Rows that have just been given a Beleg, and are still on screen because of it.
   *
   * A matched booking doesn't belong in the Fehlend list any more — but removing it
   * the instant the drop lands takes away the only thing the user is looking for,
   * namely that it worked. So the row stays put, flips to "Beleg zugeordnet", and
   * only then leaves; several at once leave one after another, so you can watch the
   * list empty rather than blink.
   */
  const HOLD_MS = 2000;
  const STAGGER_MS = 280;
  let justMatched = $state(new Set<string>());
  const leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Statuses as of the last render, to spot the flips. Plain, not reactive. */
  let lastStatus = new Map<string, ReportStatus>();
  /** Set right before an action that can match something, so a session restore or the
   *  demo swapping in never fakes a "just matched" flourish. */
  let announceMatches = false;

  $effect(() => {
    const now = new Map(entries.map((e) => [rowKey(e), e.status]));
    const before = lastStatus;
    lastStatus = now;
    if (!announceMatches) return;
    announceMatches = false;
    const flipped = [...before]
      .filter(([k, was]) => was === "missing" && now.get(k) === "matched")
      .map(([k]) => k);
    if (!flipped.length) return;
    const next = new Set(untrack(() => justMatched));
    for (const k of flipped) {
      next.add(k);
      if (!leaving.includes(k)) leaving.push(k);
    }
    justMatched = next;
    departing = untrack(() => departing) + 1; // wakes the scheduler below
  });

  /** Keys waiting to leave, in the order they were matched. */
  let leaving: string[] = [];
  let departing = $state(0);

  /**
   * Start the countdowns — but not while the assign dialog is up. A row that leaves
   * behind an overlay leaves unseen, which is the whole thing this avoids; it can
   * wait the two seconds until the dialog is closed.
   */
  $effect(() => {
    departing;
    if (pickerEntries || !leaving.length) return;
    const queue = leaving;
    leaving = [];
    queue.forEach((k, i) => {
      clearTimeout(leaveTimers.get(k));
      leaveTimers.set(
        k,
        setTimeout(() => {
          leaveTimers.delete(k);
          const rest = new Set(justMatched);
          rest.delete(k);
          justMatched = rest;
        }, HOLD_MS + i * STAGGER_MS),
      );
    });
  });

  const visible = $derived(
    entries
      .filter(
        (e) =>
          filter === "all" ||
          e.status === filter ||
          // …plus the ones taking their leave, but only in the list they're leaving.
          (filter === "missing" && justMatched.has(rowKey(e))),
      )
      .sort(comparator),
  );

  // Collapse recurring same-account / one-invoice rows into expandable groups.
  const groups = $derived(groupEntries(visible));

  /**
   * Show which document a booking came from — but only once that question can have
   * more than one answer. With a single statement loaded the column would repeat the
   * same filename on every row; with your card statement, someone else's and the
   * Kontoauszug in one report, it's the first thing you need.
   */
  const showSource = $derived((active?.statementSources?.length ?? 0) > 1);
  /** rel → short, distinguishing name of that document, for the "Quelle" column. */
  const sourceNames = $derived(statementLabels(active?.statementSources ?? []));

  /** The Belege that matched nothing — the same reconciliation from the other side,
   *  so they are one more view of this table rather than a panel of their own. */
  const extras = $derived(live ? (result?.extras ?? []) : []);
  /** Their total in EUR. Foreign-currency Belege are counted separately rather than
   *  summed at an invented rate. */
  const extrasEur = $derived(extras.filter((e) => !e.currency || e.currency.toUpperCase() === "EUR"));
  const extrasSum = $derived(
    extrasEur.reduce((n, e) => n + (isFinite(parseFloat(e.total)) ? parseFloat(e.total) : 0), 0),
  );
  const extrasForeign = $derived(extras.length - extrasEur.length);

  /**
   * The filter IS the summary. Two controls saying the same thing (a segmented
   * "Fehlend 4 · Zugeordnet 7 · Alle 15" above a strip of "4 FEHLEND · 7
   * ZUGEORDNET · …") made the reader match numbers across them to see they were
   * the same set; the counts you read are now the buttons you press.
   */
  type FilterTile = { id: Filter; label: string; count: number; sum: number; tone?: "ok" | "warn"; hint: string };
  const filters = $derived<FilterTile[]>([
    { id: "all", label: entries.length === 1 ? "Buchung" : "Buchungen", count: entries.length, sum: summary.sum.all,
      hint: "Alle Buchungen auf dem Auszug" },
    { id: "matched", label: "zugeordnet", count: summary.matched, sum: summary.sum.matched, tone: "ok",
      hint: "Buchungen, zu denen ein Beleg im Ordner liegt" },
    { id: "missing", label: "fehlend", count: summary.missing, sum: summary.sum.missing, tone: "warn",
      hint: "Buchungen ohne Beleg — die Arbeit, die noch vor dir liegt" },
    { id: "no_invoice", label: "kein Beleg nötig", count: summary.noInvoice, sum: summary.sum.noInvoice,
      hint: "Gehalt, Steuer, Kartenabrechnung — dafür stellt niemand eine Rechnung" },
    { id: "no_booking", label: "ohne Buchung", count: extras.length, sum: extrasSum,
      hint: extrasForeign
        ? `Belege im Ordner, zu denen keine Buchung passt (${extrasForeign} davon in Fremdwährung, nicht in der Summe)`
        : "Belege im Ordner, zu denen keine Buchung passt — vergleiche die Summe mit „fehlend“" },
  ]);

  /** `auto`: added by the folder watcher rather than by the user — don't count it
   *  as a folder selection and don't yank the filter out from under them. */
  async function onLoad(pdfs: CollectedPdf[], opts: { auto?: boolean } = {}): Promise<RunResult | null> {
    errorMsg = "";
    // Accumulate across drops/picks so several folders or files can be added.
    const seen = new Set(sources.map((p) => p.rel));
    const fresh = pdfs.filter((p) => !seen.has(p.rel));
    void rememberFolders(pdfs); // keep the folder itself across reloads
    // Adding a folder whose PDFs are all known already changed nothing at all, and
    // silence there is what read as "it's broken". Say so instead of doing a
    // no-op run that ends with the same numbers.
    if (!fresh.length && result) {
      if (!opts.auto) notify(`Keine neuen PDFs gefunden — dieser Ordner ist schon eingelesen`);
      return result;
    }
    busy = true;
    const merged = [...sources, ...fresh];
    sources = merged;
    const adding = !!result?.charges?.length;
    if (!opts.auto) track("folder_selected", { bucket: bucket(merged.length) });
    try {
      // Lazy-load the engine so pdf.js (the heavy chunk) only downloads on first use.
      const { run, addInvoices } = await import("./lib/engine");
      const onP = (p: RunProgress) => (progress = p);
      // With a report already in hand (live, or restored from the session), match
      // the new PDFs against the charges we already parsed — the statement PDF
      // need not still be present. Only the very first load runs from scratch.
      const r = adding ? await addInvoices(result!, fresh, onP) : await run(merged, onP);
      announceMatches = adding; // a first run has nothing to have "just" matched
      result = r;
      if (!opts.auto) filter = "missing";
      // Adding to an existing report leaves the panel looking untouched apart from
      // the numbers — name what arrived, or the click reads as having done nothing.
      if (adding && !opts.auto) {
        notify(`${fresh.length} ${fresh.length === 1 ? "Datei" : "Dateien"} ergänzt`);
      }
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
    return targetForStatement(entry.source?.rel ?? statementRelFor(entry));
  }

  /** The same, for a statement's display path directly — which is what a matched
   *  Beleg gives us: the folder of the document carrying the booking it settles.
   *
   *  Deliberately unwilling to guess. It resolves the folder that actually holds that
   *  statement (its own handle, or the same-named picked root after a reload) and
   *  otherwise returns null, because the alternative — "write it next to some other
   *  file that came from a real folder" — is how a July invoice ends up in 06. */
  function targetForStatement(rel: string | undefined): FileTarget | null {
    if (!rel || !result) return null;
    const { rootName, subdir } = relFolder(rel);
    const own = sources.find((p) => p.rel === rel)?.root;
    const sameRoot =
      sources.find((p) => p.root?.name === rootName)?.root ?? folders.find((f) => f.name === rootName);
    const root = own ?? sameRoot;
    if (!root) {
      // Worth saying out loud: this is the difference between "filed into your folder"
      // and "only in the report", and it's invisible otherwise.
      console.info(
        `[filing] kein Ordner-Handle für „${rel}" — die Dateien kamen nicht über „Ordner wählen" (oder die Seite wurde seither neu geladen)`,
      );
      return null;
    }
    const label = subdir ? `${root.name}/${subdir}` : root.name;
    return { root, subdir, label };
  }

  /** Folder a drop in the open picker would be saved to, for the picker's hint. */
  const pickerTarget = $derived(pickerEntry ? targetFor(pickerEntry) : null);

  /**
   * Unclaimed Belege worth offering for THIS booking, closest first: same vendor
   * before anything else, then nearest in date. Capped, because the list is an
   * offer, not an inventory — "Belege ohne Buchung" below shows them all.
   */
  const pickerOrphans = $derived.by(() => {
    const e = pickerEntry;
    if (!result || !e || e.status !== "missing") return [];
    const days = (a: string, b: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b)
        ? Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
        : 999;
    return [...(result.extras ?? [])]
      .map((o) => ({ o, same: o.provider === e.provider ? 0 : 1, gap: days(o.date, e.date) }))
      .sort((a, b) => a.same - b.same || a.gap - b.gap)
      .slice(0, 5)
      .map((x) => x.o);
  });

  /**
   * Belege that are matched but still sitting wherever the browser downloaded them,
   * with the folder each one belongs in.
   *
   * The described flow is "I download all the Hetzner invoices, drop them, and they
   * should be sorted" — dropping onto the page matches them but files nothing, and
   * silently writing into someone's folders on a drop is not ours to do. So the
   * dropzone offers it as one click, which is also the gesture the permission prompt
   * needs.
   */
  const pendingSort = $derived.by(() => {
    if (!result) return [];
    const plans: { pdf: CollectedPdf; target: FileTarget; hint?: NameHint }[] = [];
    for (const inv of result.invoices) {
      if (!inv.pdf?.data || inv.pdf.root) continue; // already lives in a picked folder
      const entry = result.entries.find(
        (e) => e.status === "matched" && (e.invoice ?? "").split(", ").includes(inv.row.rel),
      );
      const target = targetForStatement(entry?.source?.rel) ?? targetFor(entry);
      if (!target) continue;
      plans.push({
        pdf: inv.pdf,
        target,
        hint: entry
          ? { provider: entry.provider, date: entry.date, amount: entry.amount, currency: entry.currency }
          : undefined,
      });
    }
    return plans;
  });
  /** The distinct folders that click would write into — named, before it happens. */
  const pendingSortLabels = $derived([...new Set(pendingSort.map((p) => p.target.label))].sort());

  /** File those Belege into their folders and point the report at the new paths. */
  async function sortIntoFolders() {
    if (!result || !pendingSort.length) return;
    busy = true;
    try {
      const plans = pendingSort.map((p) => ({ ...p }));
      const filed = await fileIntoFolder(plans);
      const moves = plans
        .map((p, i) => ({ from: p.pdf.rel, to: filed.pdfs[i] }))
        .filter((m) => m.to.rel !== m.from);
      if (filed.written.length) undoable = { files: filed.written };
      const { repointResult } = await import("./lib/engine");
      result = repointResult(result, moves);
      const moved = new Set(moves.map((m) => m.from));
      sources = [...sources.filter((s) => !moved.has(s.rel)), ...filed.pdfs];
      saveSession(result);
      notify(
        filed.saved.length
          ? `${filed.saved.length} ${filed.saved.length === 1 ? "Beleg" : "Belege"} einsortiert`
          : filed.denied
            ? `Nicht einsortiert — kein Schreibzugriff auf ${filed.deniedTargets.join(", ") || "den Ordner"}`
            : "Nichts einsortiert — die Belege lagen schon im Ordner",
      );
      track("belege_filed", { bucket: bucket(filed.saved.length) });
    } catch (e) {
      console.error("[filing] Einsortieren fehlgeschlagen:", e);
      errorMsg = "Beim Einsortieren ist etwas schiefgelaufen (Details in der Browser-Konsole).";
    } finally {
      busy = false;
    }
  }

  /** Record "these Belege belong to this booking", whatever the matcher thinks. */
  async function onLinkManual(entry: ReportEntry, rels: string[]): Promise<RunResult | null> {
    if (!result) return null;
    const { linkManually } = await import("./lib/engine");
    announceMatches = true;
    result = linkManually(result, entry, rels);
    saveSession(result);
    track("beleg_linked_manually", { bucket: bucket(rels.length) });
    return result;
  }

  /** Release a booking's Beleg again — and keep it released (see unmatchEntry). */
  async function onUnmatch(entry: ReportEntry) {
    if (!result) return;
    const { unmatchEntry } = await import("./lib/engine");
    result = unmatchEntry(result, entry);
    saveSession(result);
    notify(`Zuordnung aufgehoben — ${entry.provider} gilt wieder als offen`);
    track("beleg_unmatched");
  }
  // Outcome of the last picker drop, shown in its feedback block.
  let filedTo = $state<string[]>([]);
  let filedExisting = $state<string[]>([]);
  let filedDenied = $state(false);
  /** Folders that refused the write, by label — named, so the offer to try again can
   *  name them too. */
  let filedDeniedTargets = $state<string[]>([]);
  /** What the last drop wrote, so it can be taken back out again. Only ever the
   *  files THIS drop created — never one that was already in the folder. Each write
   *  carries its own root: one drop can now land in several month folders. */
  let undoable = $state<{ files: { path: string; rel: string; root: FsDirHandle }[] } | null>(null);
  /** Why a Beleg wasn't filed — never leave that silent, it's the whole feature. */
  const filingNote = $derived(
    !live
      ? ""
      : filedDenied
        ? `Nicht gespeichert: ${filedDeniedTargets.length ? `Der Schreibzugriff auf ${filedDeniedTargets.join(", ")} wurde nicht erteilt` : "Der Schreibzugriff wurde abgelehnt"}. Die Belege bleiben liegen, wo sie sind — über „Belege einsortieren“ im Feld oben lässt sich der Zugriff erneut anfragen.`
        : !pickerTarget
          ? "Nicht im Ordner gespeichert: Es gibt keinen beschreibbaren Ordner. Öffne ihn einmal über „Ordner wählen“ (nach einem Neuladen der Seite erneut) — danach werden Belege direkt dort abgelegt."
          : "",
  );

  /**
   * The "Beleg zuordnen" picker: read the dropped Belege, file each one into the
   * folder of the booking IT settles, then match again so the report points at the
   * files on disk. Works for one Beleg and for a handful dropped at once (five
   * months of Hetzner invoices, two Amazon invoices for one charge).
   *
   * Order matters: matching has to happen before writing, because where a Beleg
   * belongs is only knowable from the booking it matches — but the report must end
   * up pointing at the file's final path, not at the copy in Downloads. So the PDFs
   * are read once, matched, filed, and matched again from the same parse.
   */
  async function onAssign(pdfs: CollectedPdf[], entry?: ReportEntry): Promise<RunResult | null> {
    busy = true;
    errorMsg = "";
    filedTo = [];
    filedExisting = [];
    filedDenied = false;
    undoable = null;
    try {
      const { parseInputs, addParsed, repointInvoice } = await import("./lib/engine");
      const parsed = await parseInputs(pdfs, (p) => (progress = p));

      // The demo has no folder to write into — match and be done.
      if (!result) {
        let base = demoResult;
        if (!base) base = demoResult = await loadDemoResult();
        if (!base) {
          errorMsg = "Die Demo konnte nicht geladen werden. Bitte lade die Seite neu.";
          return null;
        }
        demoResult = addParsed(base, parsed);
        return demoResult;
      }

      // Where does each new Beleg belong? Match once to find out, without keeping
      // the outcome: these rows still carry their Downloads-folder paths.
      const tentative = addParsed(result, parsed);
      const statementByInvoice = new Map<string, string>();
      for (const e of tentative.entries) {
        if (e.status !== "matched" || !e.invoice || !e.source) continue;
        for (const rel of e.invoice.split(", ")) statementByInvoice.set(rel, e.source.rel);
      }
      // Only Belege that actually matched a booking get filed, and only into that
      // booking's folder. A Beleg that matched nothing has no folder it demonstrably
      // belongs in — putting it next to whichever booking was on screen is exactly how
      // a July invoice lands in 06. It stays in Downloads and shows up under "ohne
      // Buchung"; assign it by hand and the dropzone offers to file it then.
      const plans = parsed.invoices.map((item) => ({
        pdf: item.pdf!,
        target: targetForStatement(statementByInvoice.get(item.row.rel)),
        hint: hintFor(item.row.rel, tentative, entry),
      }));
      // Statements and unreadable PDFs dropped in here are not filed anywhere; they
      // keep their own path and simply join the report.
      const unfiled = pdfs.filter((p) => !plans.some((pl) => pl.pdf.rel === p.rel));

      const filed = await fileIntoFolder(plans);
      if (filed.written.length) undoable = { files: filed.written };
      filedTo = filed.saved;
      filedExisting = filed.existing;
      filedDenied = filed.denied;
      filedDeniedTargets = filed.deniedTargets;

      // Same parse, new locations — nothing is read a second time.
      const byOldRel = new Map(plans.map((pl, i) => [pl.pdf.rel, filed.pdfs[i]]));
      const relocated = {
        ...parsed,
        invoices: parsed.invoices.map((item) => {
          const now = byOldRel.get(item.row.rel);
          return now && now.rel !== item.row.rel ? repointInvoice(item, now) : item;
        }),
      };

      // Filed documents are part of the folder now; remember them so the watcher
      // doesn't read them back in as a second copy.
      const known = new Set(sources.map((p) => p.rel));
      sources = [...sources, ...[...filed.pdfs, ...unfiled].filter((p) => !known.has(p.rel))];

      announceMatches = true;
      result = addParsed(result, relocated);
      saveSession(result);
      return result;
    } catch (e) {
      console.error("[assign] fehlgeschlagen:", e);
      const detail = e instanceof Error ? e.message : String(e ?? "");
      errorMsg = `Beim Prüfen ist etwas schiefgelaufen${detail ? `: ${detail}` : ""}. Bitte versuche es erneut.`;
      return null;
    } finally {
      busy = false;
      progress = null;
    }
  }

  /** Booking data for naming a Beleg whose own PDF names no issuer: the charge it
   *  matched, or failing that the one it was dropped on. */
  function hintFor(rel: string, tentative: RunResult, entry?: ReportEntry): NameHint | undefined {
    const hit = tentative.entries.find(
      (e) => e.status === "matched" && (e.invoice ?? "").split(", ").includes(rel),
    );
    const from = hit ?? entry;
    return from ? { provider: from.provider, date: from.date, amount: from.amount, currency: from.currency } : undefined;
  }

  /**
   * Undo the last drop's filing: delete the files it wrote and take them back out
   * of the report. Dropping the wrong Beleg on a booking is easy to do and, until
   * now, only fixable by hunting the file down in Explorer — so the way out
   * belongs next to the message that announced the write.
   *
   * Strictly limited to `undoable`, i.e. files this drop created. A Beleg that was
   * already in the folder is never touched: the user didn't just put it there, so
   * deleting it would destroy data instead of undoing an action.
   */
  async function onUndoFiling(): Promise<boolean> {
    if (!undoable) return false;
    const { files } = undoable;
    busy = true;
    try {
      for (const f of files) await deleteFromFolder(f.root, f.path);
      const gone = new Set(files.map((f) => f.rel));
      sources = sources.filter((p) => !gone.has(p.rel));
      if (result) {
        const { removeDocument } = await import("./lib/engine");
        let next: RunResult | null = result;
        for (const f of files) {
          if (!next) break;
          next = removeDocument(next, f.rel);
        }
        if (next) {
          result = next;
          saveSession(result);
        }
      }
      console.info(`[filing] zurückgenommen: ${files.map((f) => f.path).join(", ")}`);
      filedTo = [];
      filedExisting = [];
      undoable = null;
      return true;
    } catch (e) {
      console.warn("[filing] Rücknahme fehlgeschlagen:", e);
      return false;
    } finally {
      busy = false;
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
  /** Short note in the dropzone — what the last folder read actually did. */
  let autoNotice = $state("");
  let autoTimer: ReturnType<typeof setTimeout> | undefined;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const dirtyRoots = new Set<FsDirHandle>();

  function notify(message: string) {
    autoNotice = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (autoNotice = ""), 8000);
  }

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
    notify(`${fresh.length} neue ${fresh.length === 1 ? "Datei" : "Dateien"} aus dem Ordner ergänzt`);
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

  /** Open a read invoice by its display path. Only works while its bytes are in
   *  memory — a restored session keeps the row but not the PDF. */
  function openInvoicePdf(rel: string) {
    openPdfBytes(result?.invoices.find((i) => i.row.rel === rel)?.pdf?.data);
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

<svelte:window onkeydown={(e) => { if (e.key === "Escape") { menuOpen = false; pickerEntries = null; } }} />

<DropOverlay onload={onLoad} disabled={busy || pickerEntries !== null} />

{#if pickerEntries}
  <PickerModal
    entries={pickerEntries}
    loadError={errorMsg}
    onload={onAssign}
    onprepare={() => prepareFiling()}
    onclose={() => (pickerEntries = null)}
    targetLabel={pickerTarget?.label ?? ""}
    saved={filedTo}
    existing={filedExisting}
    denied={filedDenied}
    note={filingNote}
    onundo={undoable ? onUndoFiling : undefined}
    orphans={pickerOrphans}
    onlink={live ? onLinkManual : undefined}
    onopenpdf={openInvoicePdf}
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
  <!-- Once real files are loaded the pitch has done its job: the explanation, the
       demo download and its hint step aside so the report starts higher up. -->
  <section class="app-intro" data-live={live}>
    <div class="app-intro-copy">
      <h1>Belege abgleichen</h1>
      {#if !live}
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
      {/if}
    </div>

    <div class="app-intro-meter">
      <div class="meter-head">
        <span class="micro-label">Belegquote</span>
        <span class="meter-period">{period}</span>
      </div>
      <CompletenessMeter coverage={summary.coverage} matched={summary.matched} total={summary.total} compact={live} />
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
      sortable={pendingSort.length}
      sortTargets={pendingSortLabels}
      onsort={sortIntoFolders}
      locked={lockedFolders}
      {reconnecting}
      onreconnect={reconnectFolders}
    />
  </section>

  <!-- REPORT SHELL -->
  <section class="report" id="report">
    <div class="report-head">
      <div class="report-title">
        <h2>Buchungen &amp; Belege</h2>
        <span class="source">{statementLabel}</span>
      </div>
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

    <div class="status-strip" role="tablist" aria-label="Buchungen filtern">
      {#each filters as f (f.id)}
        <button
          class="stat"
          type="button"
          role="tab"
          aria-selected={filter === f.id}
          data-tone={f.tone ?? "plain"}
          onclick={() => (filter = f.id)}
          use:tooltip={f.hint}
        >
          <strong class="num">{f.count}</strong>
          <span class="status-strip-label">{f.label}</span>
          <span class="stat-sum">{money(f.sum, "EUR")}</span>
        </button>
      {/each}
    </div>

    {#if filter === "no_booking"}
      {#if extras.length}
        <ExtrasList {extras} onopen={openInvoicePdf} />
      {:else}
        <p class="empty">
          {live
            ? "Jeder gelesene Beleg gehört zu einer Buchung."
            : "Diese Ansicht zeigt Belege ohne Buchung — lade dazu deinen Auszug und deinen Rechnungsordner."}
        </p>
      {/if}
    {:else}
    {#key `${filter}:${sort}:${showSource}`}
      <ul class="rows" class:with-source={showSource}>
        {#each groups as group, i (group.items.length === 1 ? rowKey(group.items[0]) : group.key)}
          {#if group.items.length === 1}
            <ReportRow entry={group.items[0]} index={i} {showSource} {sourceNames} {justMatched} onpick={openPicker} onunmatch={live ? onUnmatch : undefined} />
          {:else}
            <GroupRow {group} index={i} {showSource} {sourceNames} {justMatched} onpick={openPicker} onpickgroup={openGroupPicker} onunmatch={live ? onUnmatch : undefined} />
          {/if}
        {/each}
      </ul>
    {/key}

    {#if visible.length === 0}
      <p class="empty">Nichts in dieser Ansicht.</p>
    {/if}
    {/if}

    {#if live && result?.duplicates?.length}
      <DuplicatesNote duplicates={result.duplicates} />
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
    text-wrap: balance;
  }
  /* Working state: title and Belegquote on one quiet line, everything else gone. */
  .app-intro[data-live="true"] {
    padding: 20px 0 18px;
    gap: 24px;
  }
  .app-intro[data-live="true"] h1 { font-size: var(--type-section-title-size); }
  .app-intro[data-live="true"] .app-intro-meter { padding: 16px 20px; }
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
    gap: 12px 16px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }
  /* Sorting and exporting are about the table as a whole; the filter tiles below are
     about which rows. Keeping them on separate lines stops the strip from wrapping. */
  .report-head .sort-control { margin-left: auto; }
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

  /* The summary and the filter are one control: each figure is the button that
     shows exactly those rows. Concentric radii — the strip's 14px minus its 6px
     padding leaves 8px for a tile. */
  .status-strip { margin-bottom: 16px; flex-wrap: wrap; padding: 6px; gap: 2px; }
  /* Count and label on the first line, the sum indented under the LABEL rather than
     under the count: the sum belongs to what the label names, and hanging it under
     the figure made the two numbers read as one column of unrelated digits. */
  .stat {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: baseline;
    justify-items: start;
    gap: 1px 6px;
    padding: 6px 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    text-align: left;
    font-family: var(--font-family-body);
    cursor: pointer;
    transition: background-color 0.15s ease, box-shadow 0.15s ease, scale 0.12s ease;
  }
  .stat .num { grid-area: 1 / 1; }
  .stat .status-strip-label { grid-area: 1 / 2; }
  .stat .stat-sum { grid-area: 2 / 2; }
  .stat:hover { background: var(--surface-panel-muted); }
  /* Selected: the tint carries the state, so the ring only has to hold its edge —
     the near-black outline the segmented control uses is far too loud at this size. */
  .stat[aria-selected="true"] {
    background: var(--control-segmented-segment-background-selected);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-brand-deep) 20%, transparent);
  }
  .stat:active { scale: 0.96; }
  /* The sum answers "how bad is it?" without opening the list. Quiet: the count is
     still the headline, the money is its footnote. */
  .stat-sum {
    font-size: 0.76rem;
    font-weight: 650;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .stat[aria-selected="true"] .stat-sum,
  .stat[data-tone="warn"] .stat-sum { color: var(--text-secondary); }
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
  /* The shared stylesheet paints aria-selected; these are toggle buttons. Same soft
     ring as the filter tiles — the design system's near-black outline reads as an
     error state at this size. */
  .sort-control .segmented-control > button.is-on {
    background: var(--control-segmented-segment-background-selected);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-brand-deep) 20%, transparent);
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
  .stat[data-tone="ok"] .num { color: var(--accent-brand-deep); }
  .stat[data-tone="warn"] .num { color: var(--status-warn-text); }
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
  /* …plus a "Quelle" track when more than one document is loaded. */
  .rows.with-source {
    grid-template-columns: minmax(0, 1fr) max-content max-content max-content max-content max-content;
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

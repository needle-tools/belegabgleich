<script lang="ts">
  import { onMount } from "svelte";
  import CompletenessMeter from "./lib/CompletenessMeter.svelte";
  import ReportRow from "./lib/ReportRow.svelte";
  import GroupRow from "./lib/GroupRow.svelte";
  import Dropzone from "./lib/Dropzone.svelte";
  import DropOverlay from "./lib/DropOverlay.svelte";
  import PickerModal from "./lib/PickerModal.svelte";
  import RenamePanel from "./lib/RenamePanel.svelte";
  import { MOCK_ENTRIES, MOCK_PERIOD, MOCK_STATEMENT, DEMO_SOURCE_PATHS } from "./lib/mock";
  import { summarize, groupEntries, supportedProviders, type ReportEntry } from "./lib/report";
  import type { RunResult, RunError, RunProgress } from "./lib/engine";
  import type { CollectedPdf } from "./lib/collect";
  import { downloadCsv } from "./lib/csv";
  import { tooltip } from "./lib/tooltip";
  import { saveSession, loadSession, clearSession } from "./lib/persist";
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
  const openPicker = (e: ReportEntry) => (pickerEntry = e);

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

  const visible = $derived(
    entries
      .filter((e) =>
        filter === "all" ? true : filter === "missing" ? e.status === "missing" : e.status === "matched",
      )
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

  // Collapse recurring same-account / one-invoice rows into expandable groups.
  const groups = $derived(groupEntries(visible));

  const filters = $derived<{ id: Filter; label: string; count: number }[]>([
    { id: "missing", label: "Fehlend", count: summary.missing },
    { id: "matched", label: "Zugeordnet", count: summary.matched },
    { id: "all", label: "Alle", count: entries.length },
  ]);

  async function onLoad(pdfs: CollectedPdf[]): Promise<RunResult | null> {
    busy = true;
    errorMsg = "";
    // Accumulate across drops/picks so several folders or files can be added.
    const seen = new Set(sources.map((p) => p.rel));
    const merged = [...sources, ...pdfs.filter((p) => !seen.has(p.rel))];
    sources = merged;
    track("folder_selected", { bucket: bucket(merged.length) });
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
      filter = "missing";
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
        errorMsg = "Beim Lesen ist etwas schiefgelaufen. Bitte versuche es erneut.";
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

  /**
   * The "Beleg zuordnen" picker: match the dropped invoice against the report
   * that's currently on screen — the user's result, or the demo (seeded on
   * demand). Returns the updated result so the picker can report the outcome.
   */
  async function onAssign(pdfs: CollectedPdf[]): Promise<RunResult | null> {
    busy = true;
    errorMsg = "";
    try {
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

  function reset() {
    result = null;
    errorMsg = "";
    filter = "missing";
    sources = [];
    clearSession();
    // fall back to the demo; reload it if it was cleared/never loaded
    if (!demoResult) loadDemoResult().then((d) => { if (!result && !demoResult) demoResult = d; });
  }

  function exportCsv() {
    downloadCsv(entries);
    track("csv_exported", { bucket: bucket(entries.length) });
  }

  const DEMO_FILES = ["Kontoauszug-Demo.pdf", "Kreditkartenabrechnung-Demo.pdf"];
  function downloadDemo() {
    for (const f of DEMO_FILES) {
      const a = document.createElement("a");
      a.href = `/demo/${f}`;
      a.download = f;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
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
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape") { menuOpen = false; pickerEntry = null; } }} />

<DropOverlay onload={onLoad} disabled={busy || pickerEntry !== null} />

{#if pickerEntry}
  <PickerModal entry={pickerEntry} loadError={errorMsg} onload={onAssign} onclose={() => (pickerEntry = null)} />
{/if}

<div class="page">
  <div class="header-pill-shell">
    <header class="header-pill" data-menu-open={menuOpen}>
      <div class="header-pill-brand">
        <img class="header-pill-logo" src="/icon.svg" alt="Belegabgleich" />
        <span class="header-pill-brand-label">Belegabgleich</span>
      </div>
      <nav class="header-pill-nav">
        <a class="header-pill-link" href="#report">Bericht</a>
        <a class="header-pill-link" href="#how">So geht's</a>
        <a class="header-pill-link" href="#privacy">Datenschutz</a>
      </nav>
      <div class="header-pill-actions">
        <a class="ghicon" href="https://github.com/needle-tools/belegabgleich" target="_blank" rel="noopener noreferrer" aria-label="Quellcode auf GitHub" title="Quellcode auf GitHub">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.5c-2 .4-2.5-.5-2.7-1-.1-.3-.6-1-1-1.2-.3-.2-.8-.6 0-.6.7 0 1.2.7 1.4 1 .8 1.3 2 1 2.6.7.1-.6.3-1 .6-1.2-2-.2-3.7-1-3.7-4.3 0-1 .3-1.7.9-2.4-.1-.2-.4-1.1.1-2.3 0 0 .7-.2 2.4 1a8 8 0 0 1 4.4 0c1.7-1.2 2.4-1 2.4-1 .5 1.2.2 2 .1 2.3.6.7.9 1.4.9 2.4 0 3.3-2 4-3.8 4.3.3.3.6.8.6 1.6v2.3c0 .2.1.5.6.4A8 8 0 0 0 8 .2Z" /></svg>
        </a>
      </div>
      <button
        class="header-pill-hamburger"
        type="button"
        aria-label="Menü"
        aria-expanded={menuOpen}
        aria-controls="header-menu"
        onclick={() => (menuOpen = !menuOpen)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <line class="hamburger-top" x1="3" y1="7" x2="21" y2="7" />
          <line class="hamburger-mid" x1="3" y1="12" x2="21" y2="12" />
          <line class="hamburger-bot" x1="3" y1="17" x2="21" y2="17" />
        </svg>
      </button>
      <div class="header-pill-dropdown" id="header-menu">
        <nav class="header-pill-dropdown-nav">
          <a class="header-pill-link" href="#report" onclick={closeMenu}>Bericht</a>
          <a class="header-pill-link" href="#how" onclick={closeMenu}>So geht's</a>
          <a class="header-pill-link" href="#privacy" onclick={closeMenu}>Datenschutz</a>
        </nav>
        <div class="header-pill-dropdown-actions">
          <a class="ghbtn" href="https://github.com/needle-tools/belegabgleich" target="_blank" rel="noopener noreferrer" onclick={closeMenu}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.5c-2 .4-2.5-.5-2.7-1-.1-.3-.6-1-1-1.2-.3-.2-.8-.6 0-.6.7 0 1.2.7 1.4 1 .8 1.3 2 1 2.6.7.1-.6.3-1 .6-1.2-2-.2-3.7-1-3.7-4.3 0-1 .3-1.7.9-2.4-.1-.2-.4-1.1.1-2.3 0 0 .7-.2 2.4 1a8 8 0 0 1 4.4 0c1.7-1.2 2.4-1 2.4-1 .5 1.2.2 2 .1 2.3.6.7.9 1.4.9 2.4 0 3.3-2 4-3.8 4.3.3.3.6.8.6 1.6v2.3c0 .2.1.5.6.4A8 8 0 0 0 8 .2Z" /></svg>
            GitHub
          </a>
        </div>
      </div>
    </header>
  </div>

  <div class="steps-bar">
    <span>Kontoauszug</span>
    <svg class="step-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    <span>Rechnungen</span>
    <svg class="step-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    <span>fehlende Belege</span>
    <span class="steps-sep" aria-hidden="true">–</span>
    <span class="steps-local">100 % lokal und privat</span>
  </div>

  <main>
    <!-- HERO — the thesis is the completeness meter -->
    <section class="hero">
      <div class="hero-copy">
        <h1>Welcher Buchung fehlt der Beleg?</h1>
        <p class="lede">
          Für Freelancer, Selbstständige und kleine Unternehmen: Lade deinen
          Kontoauszug oder deine Kreditkartenabrechnung und einen Ordner mit
          Rechnungen — und sieh in Sekunden, welcher Buchung ein Beleg fehlt.
          Alles läuft 100 % lokal in deinem Browser: Nichts wird gespeichert,
          hochgeladen oder an Dritte gesendet — Open Source und ohne Cloud-KI.
        </p>
        <div class="cta-row">
          <a class="btn-primary" href="#report">Bericht ansehen</a>
          <button class="btn-ghost" type="button" onclick={downloadDemo}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10" /></svg>
            Demo-Dateien laden
          </button>
        </div>
        <p class="demo-hint">
          Kontoauszug + Kreditkartenabrechnung zum Ausprobieren — frei erfundene Daten.
        </p>
      </div>

      <aside class="hero-card">
        <div class="hero-card-head">
          <span class="status-strip-label">Belegquote</span>
          <span class="period">{period}</span>
        </div>
        <CompletenessMeter coverage={summary.coverage} matched={summary.matched} total={summary.total} />
        <p class="hero-card-foot">
          {summary.missing} von {summary.total} Buchungen ohne Beleg
        </p>
      </aside>
    </section>

    <!-- UPLOAD -->
    <section class="upload" id="upload">
      <Dropzone onload={onLoad} onreset={reset} {busy} {progress} {result} {errorMsg} />
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

      {#key filter}
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
        <p class="mock-note">Demodaten — lade oben deinen Auszug und Rechnungen für den echten Abgleich.</p>
      {/if}
    </section>

    <!-- AUTO-RENAME -->
    {#if result && result.renames.length > 0}
      <RenamePanel plans={result.renames} />
    {/if}

    <!-- HOW IT WORKS -->
    <section class="how" id="how">
      <h2>In drei Schritten</h2>
      <ol class="steps">
        <li class="step">
          <span class="step-n">1</span>
          <h3>Auszug laden</h3>
          <p>Kontoauszug oder Kreditkartenabrechnung der Sparkasse auswählen. Wird im Browser gelesen.</p>
        </li>
        <li class="step">
          <span class="step-n">2</span>
          <h3>Rechnungsordner wählen</h3>
          <p>Den Ordner mit deinen Rechnungen freigeben — die PDFs verlassen den Rechner nicht.</p>
        </li>
        <li class="step">
          <span class="step-n">3</span>
          <h3>Lücken sehen</h3>
          <p>Jede Buchung wird ihrer Rechnung zugeordnet. Was fehlt, steht oben — mit Link zum Download.</p>
        </li>
      </ol>
    </section>

    <!-- PRIVACY -->
    <section class="privacy" id="privacy">
      <div class="privacy-inner">
        <h2>Deine Daten bleiben bei dir</h2>
        <ul>
          <li><strong>Kein Upload, kein Backend.</strong> Auszüge und Rechnungen werden im Browser gelesen.</li>
          <li><strong>KI nur lokal.</strong> Optional über Ollama auf deinem Rechner — der Standardweg braucht keine.</li>
          <li><strong>Anonyme, cookielose Statistik</strong> — keine Weitergabe an Dritte, niemals Inhalte, Beträge oder Kontodaten.</li>
          <li><strong>Open Source.</strong> <a href="https://github.com/needle-tools/belegabgleich" target="_blank" rel="noopener noreferrer">Lies den Code</a> — die Abgleich-Logik sind rund 700 Zeilen.</li>
        </ul>
      </div>
    </section>

    <!-- SUPPORTED PROVIDERS — trust + long-tail SEO ("Rechnung <Anbieter> finden") -->
    <section class="providers" id="anbieter">
      <h2>Erkennt Buchungen von über {supportedProviders.length} Diensten</h2>
      <p class="providers-lede">
        Belegabgleich ordnet deine Kontoauszüge automatisch dem richtigen Anbieter zu
        und führt dich mit einem Klick zur passenden Rechnung — darunter:
      </p>
      <ul class="provider-tags">
        {#each supportedProviders as p (p.name)}
          <li>
            {#if p.invoiceUrl}
              <a
                class="provider-tag"
                href={p.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onclick={() => track("provider_link_opened", { provider: p.name })}
              >{p.name}</a>
            {:else}
              <span class="provider-tag">{p.name}</span>
            {/if}
          </li>
        {/each}
      </ul>
      <p class="providers-cta">
        Dein Anbieter fehlt?
        <a href="https://github.com/needle-tools/belegabgleich/blob/main/providers.json" target="_blank" rel="noopener noreferrer">Auf GitHub ergänzen →</a>
      </p>
    </section>

    <!-- FAQ — use-case prose + long-tail search phrases (also feeds AI answer engines) -->
    <section class="faq" id="faq">
      <h2>Belege für Steuer &amp; Steuerberater zusammenstellen</h2>
      <p class="faq-lede">
        Ob Steuererklärung, Jahresabschluss oder Rückfrage vom Finanzamt: Zu jeder
        Abbuchung auf dem Konto gehört ein Beleg — und am Ende fehlen fast immer ein
        paar Rechnungen. Belegabgleich vergleicht deinen Kontoauszug mit deinen
        vorhandenen Belegen und zeigt dir genau, welche Rechnung noch fehlt. So
        sammelst du gezielt nur das Fehlende, statt alles manuell durchzugehen.
      </p>
      <div class="faq-list">
        <div class="faq-item">
          <h3>Wie finde ich heraus, für welche Buchung ein Beleg fehlt?</h3>
          <p>Lade deinen Sparkassen-Kontoauszug oder deine Kreditkartenabrechnung und einen Ordner mit deinen Rechnungen. Belegabgleich vergleicht jede Buchung mit deinen Belegen und zeigt sofort, zu welcher Abbuchung noch keine Rechnung vorliegt.</p>
        </div>
        <div class="faq-item">
          <h3>Mein Steuerberater fragt nach fehlenden Belegen — wie sammle ich sie schnell?</h3>
          <p>Belegabgleich listet genau die Buchungen ohne Beleg auf und verlinkt für viele Anbieter direkt die Rechnungsseite. So lädst du gezielt nur die fehlenden Rechnungen herunter, statt alles manuell zu prüfen.</p>
        </div>
        <div class="faq-item">
          <h3>Werden meine Kontoauszüge oder Bankdaten hochgeladen?</h3>
          <p>Nein. Belegabgleich läuft zu 100 % lokal in deinem Browser. Deine Auszüge und Rechnungen verlassen den Rechner nicht — es gibt kein Backend und keine Cloud-KI.</p>
        </div>
        <div class="faq-item">
          <h3>Welche Banken werden unterstützt?</h3>
          <p>Aktuell Kontoauszüge und Kreditkartenabrechnungen der Sparkasse als PDF. Weitere Banken lassen sich über <a href="https://github.com/needle-tools/belegabgleich/tree/main/packages/parsers" target="_blank" rel="noopener noreferrer">quelloffene Parser</a> ergänzen.</p>
        </div>
        <div class="faq-item">
          <h3>Was kostet Belegabgleich?</h3>
          <p>Nichts. Belegabgleich ist kostenlos und Open Source.</p>
        </div>
        <div class="faq-item">
          <h3>Kann ich die fehlenden Belege als Liste exportieren?</h3>
          <p>Ja, du kannst den Bericht als CSV exportieren — praktisch für die Buchhaltung oder den Steuerberater.</p>
        </div>
        <div class="faq-item">
          <h3>Kann Belegabgleich meine Belege automatisch umbenennen?</h3>
          <p>Ja. Auf Wunsch benennt Belegabgleich deine Rechnungen einheitlich um (z.&nbsp;B. Datum_Anbieter_Betrag).</p>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer-area">
    <div class="footer-area-main">
      <div class="footer-brand">
        <span><strong>Belegabgleich</strong> ist ein kostenloses Tool von</span>
        <a href="https://needle.tools" target="_blank" rel="noopener noreferrer" aria-label="Needle">
          <img src="/logos/logo_needle_black_no_padding.svg" alt="Needle" />
        </a>
      </div>
      <span class="footer-meta">
        <a href="https://github.com/needle-tools/belegabgleich" target="_blank" rel="noopener noreferrer">Quellcode&nbsp;auf&nbsp;GitHub</a>
        – MIT-Lizenz – version {version}
      </span>
    </div>
  </footer>
</div>

<style>
  .page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  main {
    width: 100%;
    max-width: var(--layout-max);
    margin: 0 auto;
    padding: 0 24px;
    flex: 1;
  }

  /* header */
  .header-pill-shell {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    justify-content: center;
    padding: 10px 24px;
    /* fade scrolled content behind the pill's surrounding margin */
    /* background: color-mix(in srgb, var(--surface-page) 72%, transparent); 
    backdrop-filter: saturate(1.1) blur(8px);
    -webkit-backdrop-filter: saturate(1.1) blur(8px); */
  }
  .header-pill {
    width: 100%;
    max-width: var(--layout-max);
  }
  .header-pill-brand { gap: 9px; }
  .header-pill-logo { width: 40px; height: auto; }
  .header-pill-brand-label {
    font-family: var(--font-family-display);
    font-weight: 700;
    font-size: 1.08rem;
    letter-spacing: -0.02em;
    line-height: 1;
    color: var(--text-primary);
    white-space: nowrap;
  }

  /* make the burger dropdown span the full header-pill width, and animate it in
     (brand classes are global; the extra .header-pill raises specificity over
     the brand's right-anchored, width-capped container-query rule) */
  :global(.header-pill .header-pill-dropdown) {
    left: 0;
    right: 0;
    min-width: 0;
    max-width: none;
  }
  :global(.header-pill[data-menu-open="true"] .header-pill-dropdown) {
    transform-origin: top center;
    animation: menu-in 0.2s cubic-bezier(0.2, 0, 0, 1);
  }
  @keyframes -global-menu-in {
    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  }
  .ghbtn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 40px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    background: var(--text-primary);
    color: var(--text-inverse);
    font-weight: 700;
    font-size: 0.85rem;
    text-decoration: none;
    transition: scale 0.12s ease, opacity 0.15s ease;
  }
  .ghbtn svg { width: 15px; height: 15px; fill: currentColor; }
  .ghbtn:hover { opacity: 0.9; }
  .ghbtn:active { scale: 0.96; }

  /* Subtle, icon-only GitHub link in the header — a trust signal, not a primary
     action (the labelled link lives in the footer + providers section). */
  .ghicon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    color: var(--text-muted);
    transition: color 0.15s ease, background-color 0.15s ease, scale 0.12s ease;
  }
  .ghicon svg { width: 20px; height: 20px; fill: currentColor; }
  .ghicon:hover { color: var(--text-primary); background: var(--surface-panel-muted); }
  .ghicon:active { scale: 0.94; }

  /* hero */
  .hero {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 48px;
    align-items: center;
    padding: 72px 0 64px;
  }
  h1 {
    font-family: var(--font-family-display);
    font-size: var(--type-display-size);
    font-weight: var(--type-display-weight);
    line-height: var(--type-display-line-height);
    letter-spacing: var(--type-display-tracking);
    text-wrap: balance;
  }
  .lede {
    margin: 22px 0 0;
    max-width: 42ch;
    font-size: 1.12rem;
    color: var(--text-secondary);
    text-wrap: balance;
  }
  .cta-row {
    display: flex;
    gap: 12px;
    margin-top: 30px;
    flex-wrap: wrap;
  }
  .btn-primary, .btn-ghost {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    padding: 0 22px;
    border-radius: var(--radius-control);
    font-family: var(--font-family-body);
    font-weight: 700;
    font-size: 0.95rem;
    text-decoration: none;
    cursor: pointer;
    transition: scale 0.12s ease, background-color 0.15s ease, border-color 0.15s ease;
  }
  .btn-ghost svg {
    width: 15px; height: 15px;
    fill: none; stroke: currentColor; stroke-width: 1.7;
    stroke-linecap: round; stroke-linejoin: round;
  }
  .demo-hint {
    margin: 12px 0 0;
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  .btn-primary {
    background: var(--accent-brand-deep);
    color: var(--text-inverse);
    box-shadow: var(--shadow-subtle);
  }
  .btn-primary:hover { background: var(--text-success); }
  .btn-ghost {
    background: var(--surface-panel);
    color: var(--text-primary);
    border: 1px solid var(--border-strong);
  }
  .btn-ghost:hover { border-color: var(--accent-brand-deep); }
  .btn-primary:active, .btn-ghost:active { scale: 0.96; }
  /* 3-step flow strip directly under the header */
  .steps-bar {
    margin: 0;
    padding: 14px 24px 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-muted);
  }
  .step-arrow {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--accent-brand-deep);
  }
  .steps-sep { color: var(--border-strong); }
  .steps-local { color: var(--text-primary); font-weight: 800; white-space: nowrap; }

  .hero-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    padding: 28px;
    background: var(--surface-panel);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
  }
  .hero-card-head {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .period { color: var(--text-muted); font-size: 0.85rem; font-weight: 650; }
  .hero-card-foot {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }

  /* upload */
  .upload {
    margin-bottom: 28px;
    scroll-margin-top: 96px;
  }
  .btn-export:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* report */
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

  .status-strip { margin-bottom: 16px; }
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

  /* how */
  .how { padding: 80px 0 16px; scroll-margin-top: 96px; }
  .how h2 {
    font-size: var(--type-section-title-size);
    font-weight: var(--type-section-title-weight);
    letter-spacing: var(--type-section-title-tracking);
    margin-bottom: 24px;
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .step {
    padding: 22px;
    background: var(--surface-panel);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-subtle);
  }
  .step-n {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px; height: 30px;
    border-radius: 999px;
    background: var(--surface-callout-success);
    color: var(--text-success);
    font-family: var(--font-family-display);
    font-weight: 800;
    margin-bottom: 14px;
  }
  .step h3 { font-size: 1.02rem; font-weight: 700; margin-bottom: 6px; }
  .step p { margin: 0; color: var(--text-secondary); font-size: 0.92rem; }

  /* privacy */
  .privacy { padding: 56px 0 80px; scroll-margin-top: 96px; }
  .privacy-inner {
    background: var(--surface-callout-info);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-panel);
    padding: 32px 36px;
  }
  .privacy h2 {
    font-size: var(--type-section-title-size);
    font-weight: var(--type-section-title-weight);
    letter-spacing: var(--type-section-title-tracking);
    margin-bottom: 16px;
  }
  .privacy ul { margin: 0; padding-left: 20px; }
  .privacy li { margin: 8px 0; color: var(--text-secondary); }
  .privacy strong { color: var(--text-primary); }
  .privacy a {
    color: var(--accent-brand-deep);
    text-decoration: none;
    border-bottom: 1px solid color-mix(in srgb, var(--accent-brand-deep) 35%, transparent);
    transition: border-color 0.15s ease;
  }
  .privacy a:hover { border-bottom-color: var(--accent-brand-deep); }

  /* supported providers */
  .providers { padding: 8px 0 80px; scroll-margin-top: 96px; }
  .providers h2 {
    font-size: var(--type-section-title-size);
    font-weight: var(--type-section-title-weight);
    letter-spacing: var(--type-section-title-tracking);
    margin-bottom: 10px;
  }
  .providers-lede { color: var(--text-secondary); max-width: 60ch; margin: 0 0 20px; }
  .provider-tags {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .provider-tag {
    display: inline-block;
    padding: 8px 14px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--surface-callout-info);
    color: var(--text-secondary);
    font-size: 0.95rem;
    text-decoration: none;
    transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
  }
  a.provider-tag:hover {
    border-color: var(--accent-brand-deep);
    color: var(--accent-brand-deep);
    background: color-mix(in srgb, var(--accent-brand) 8%, transparent);
  }
  .providers-cta { margin: 22px 0 0; color: var(--text-muted); font-size: 0.92rem; }
  .providers-cta a {
    color: var(--accent-brand-deep);
    text-decoration: none;
    border-bottom: 1px solid color-mix(in srgb, var(--accent-brand-deep) 35%, transparent);
  }
  .providers-cta a:hover { border-bottom-color: var(--accent-brand-deep); }

  /* faq */
  .faq { padding: 8px 0 80px; scroll-margin-top: 96px; }
  .faq h2 {
    font-size: var(--type-section-title-size);
    font-weight: var(--type-section-title-weight);
    letter-spacing: var(--type-section-title-tracking);
    margin-bottom: 10px;
  }
  .faq-lede { color: var(--text-secondary); max-width: 65ch; margin: 0 0 24px; }
  .faq-list { display: flex; flex-direction: column; gap: 22px; max-width: 75ch; }
  .faq-item h3 {
    margin: 0 0 6px;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .faq-item p {
    margin: 0;
    color: var(--text-secondary);
    max-width: 65ch;
  }
  .faq-item a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  /* footer */
  .footer-area { margin-top: auto; }
  .footer-area-main {
    max-width: var(--layout-max);
    margin: 0 auto;
    padding: 28px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 8px;
  }
  .footer-brand { display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 400; flex-wrap: wrap; }
  .footer-brand strong { font-weight: 700; }
  .footer-brand a { display: inline-flex; align-items: center; }
  .footer-brand img { height: 22px; opacity: 0.85; transition: opacity 0.15s ease; }
  .footer-brand a:hover img { opacity: 1; }
  .footer-meta { color: var(--text-muted); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
  .footer-meta a {
    color: inherit;
    text-decoration: none;
    border-bottom: 1px solid color-mix(in srgb, currentColor 35%, transparent);
    transition: color 0.15s ease;
  }
  .footer-meta a:hover { color: var(--text-primary); }

  @keyframes fade-up { from { opacity: 0; transform: translateY(10px); } }
  @media (prefers-reduced-motion: no-preference) {
    .hero-copy { animation: fade-up 0.5s cubic-bezier(0.2, 0, 0, 1) backwards; }
    .hero-card { animation: fade-up 0.5s cubic-bezier(0.2, 0, 0, 1) 0.1s backwards; }
  }

  @media (max-width: 860px) {
    .hero { grid-template-columns: 1fr; gap: 32px; padding: 48px 0; }
    .hero-card { order: -1; }
    .steps { grid-template-columns: 1fr; }
  }
  @media (max-width: 560px) {
    .report { padding: 18px; }
  }
</style>

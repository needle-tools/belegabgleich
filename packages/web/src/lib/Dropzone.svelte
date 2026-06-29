<script lang="ts">
  import {
    collectFromDataTransfer,
    collectFromFileList,
    collectFromDirectoryPicker,
    supportsDirectoryPicker,
    type CollectedPdf,
  } from "./collect";
  import { summarize } from "./report";
  import type { RunResult, RunProgress } from "./engine";

  let {
    onload,
    onreset,
    busy = false,
    progress = null,
    result = null,
    errorMsg = "",
  }: {
    onload: (pdfs: CollectedPdf[]) => void;
    onreset?: () => void;
    busy?: boolean;
    progress?: RunProgress | null;
    result?: RunResult | null;
    errorMsg?: string;
  } = $props();

  // Success summary, derived from the live run.
  const summary = $derived(result ? summarize(result.entries) : null);
  const statementText = $derived(result ? result.statements.join(" · ") || "Auszug" : "");

  // Collecting (folder scan / reading bytes) happens here before the engine runs;
  // `busy`/`progress` (from the parent) cover the subsequent reading phase.
  let collecting = $state(false);
  let found = $state(0);
  const working = $derived(collecting || busy);
  const pct = $derived(progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0);
  const baseName = (rel: string) => rel.split(/[/\\]|\s›\s/).pop() ?? rel;

  let dragging = $state(false);
  let dragDepth = 0; // enter/leave fire per child; count to avoid flicker
  const canPickDir = supportsDirectoryPicker();

  let fileInput: HTMLInputElement;
  let dirInput: HTMLInputElement;

  // Non-standard folder-input attributes (Chromium/Firefox); not in the DOM types.
  const dirAttrs = { webkitdirectory: "", directory: "" } as Record<string, string>;

  function emit(pdfs: CollectedPdf[]) {
    if (pdfs.length) onload(pdfs);
  }

  async function withCollecting<T>(fn: () => Promise<T>): Promise<T> {
    collecting = true;
    found = 0;
    try {
      return await fn();
    } finally {
      collecting = false;
    }
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    dragDepth = 0;
    if (!e.dataTransfer) return;
    emit(await withCollecting(() => collectFromDataTransfer(e.dataTransfer!, (n) => (found = n))));
  }
  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    dragDepth++;
    dragging = true;
  }
  function onDragLeave() {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      dragging = false;
    }
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  async function pickFolder() {
    const pdfs = await withCollecting(() => collectFromDirectoryPicker((n) => (found = n)));
    if (pdfs) emit(pdfs);
  }
  async function onFiles(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) emit(await withCollecting(() => collectFromFileList(input.files!, (n) => (found = n))));
    input.value = ""; // allow re-picking the same files
  }

  /** Open a read invoice's PDF in a new tab from its in-memory bytes (local only,
   *  no upload). Only available for freshly-loaded invoices — a session restore
   *  keeps the row but not the bytes. */
  function openPdf(pdf?: CollectedPdf) {
    if (!pdf?.data) return;
    const url = URL.createObjectURL(new Blob([pdf.data], { type: "application/pdf" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
</script>

<section
  class="dz"
  class:dragging
  class:busy={working}
  class:done={!!result}
  aria-label="Auszug und Rechnungen ablegen"
  ondrop={onDrop}
  ondragenter={onDragEnter}
  ondragleave={onDragLeave}
  ondragover={onDragOver}
  aria-busy={working}
>
  <div class="dz-inner">
    {#if result && summary}
      <!-- SUCCESS — summary lives right here in the panel -->
      <svg class="dz-check" viewBox="0 0 52 52" aria-hidden="true">
        <circle class="dz-check-circle" cx="26" cy="26" r="24" />
        <path class="dz-check-mark" d="M15 27l7.5 7.5L38 19" />
      </svg>
      <p class="dz-title">{statementText} ausgelesen</p>
      <p class="dz-sub">
        {summary.total}
        {summary.total === 1 ? "Buchung" : "Buchungen"} · {result.invoiceCount}
        {result.invoiceCount === 1 ? "Rechnung" : "Rechnungen"} gelesen
        {#if result.emptyPdfs.length}
          · {result.emptyPdfs.length} ohne Text übersprungen
        {/if}
      </p>
      <p class="dz-found">
        {#if summary.missing > 0}
          <strong>{summary.missing}</strong>
          {summary.missing === 1 ? "fehlender Beleg" : "fehlende Belege"} gefunden
        {:else}
          Alle Buchungen haben einen Beleg 🎉
        {/if}
        — <a class="dz-link" href="#report">siehe Tabelle unten</a>
      </p>

      <div class="dz-actions">
        {#if canPickDir}
          <button type="button" class="dz-btn primary" onclick={pickFolder}>Ordner hinzufügen</button>
        {:else}
          <button type="button" class="dz-btn primary" onclick={() => dirInput.click()}>Ordner hinzufügen</button>
        {/if}
        <button type="button" class="dz-btn" onclick={() => fileInput.click()}>Dateien hinzufügen</button>
        <button type="button" class="dz-btn ghost" onclick={() => onreset?.()}>Zurücksetzen</button>
      </div>

      <details class="dz-files">
        <summary>
          Gelesene Dateien anzeigen
          <span class="dz-files-count">
            {result.statementFiles?.length ?? 0} Auszüge · {result.invoices.length} Rechnungen{#if result.emptyPdfs.length} · {result.emptyPdfs.length} übersprungen{/if}
          </span>
        </summary>
        <div class="dz-files-body">
          <table class="dz-table">
            <tbody>
              {#each result.statementFiles ?? [] as f}
                <tr><td class="dz-td-file">{baseName(f)}</td><td><span class="dz-pill stmt">Auszug</span></td></tr>
              {/each}
              {#each result.invoices as inv}
                <tr>
                  <td class="dz-td-file">
                    {#if inv.pdf?.data}
                      <button type="button" class="dz-file-link" title="PDF öffnen" onclick={() => openPdf(inv.pdf)}>{baseName(inv.row.rel)}</button>
                    {:else}
                      {baseName(inv.row.rel)}
                    {/if}
                  </td>
                  <td><span class="dz-pill inv">Rechnung</span></td>
                </tr>
              {/each}
              {#each result.emptyPdfs as f}
                <tr><td class="dz-td-file">{baseName(f)}</td><td><span class="dz-pill skip">ohne Text</span></td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </details>
    {:else if working}
      <div class="dz-spinner" aria-hidden="true"></div>
      {#if collecting}
        <p class="dz-title">Dateien werden gelesen …</p>
        <p class="dz-sub" aria-live="polite">{found} {found === 1 ? "Datei" : "Dateien"} gefunden</p>
      {:else}
        <p class="dz-title">Wird ausgelesen …</p>
        {#if progress}
          <p class="dz-sub" aria-live="polite">
            {progress.done} / {progress.total} · {baseName(progress.name)}
          </p>
          <div class="dz-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
            <div class="dz-bar-fill" style={`width:${pct}%`}></div>
          </div>
        {:else}
          <p class="dz-sub">Auszug und Rechnungen werden lokal verarbeitet.</p>
        {/if}
      {/if}
    {:else}
      <svg class="dz-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <p class="dz-title">Auszug & Rechnungen hier ablegen</p>
      <p class="dz-sub">
        Ziehe einen Ordner oder einzelne PDFs hierher — Kontoauszug bzw.
        Kreditkartenabrechnung und die zugehörigen Rechnungen.
      </p>
      <div class="dz-actions">
        {#if canPickDir}
          <button type="button" class="dz-btn primary" onclick={pickFolder}>Ordner wählen</button>
        {:else}
          <button type="button" class="dz-btn primary" onclick={() => dirInput.click()}>Ordner wählen</button>
        {/if}
        <button type="button" class="dz-btn" onclick={() => fileInput.click()}>Dateien wählen</button>
      </div>
      {#if errorMsg}
        <p class="dz-error" role="alert">{errorMsg}</p>
      {:else}
        <p class="dz-hint">100 % lokal · kein Upload · ohne Cloud-KI · Open Source</p>
      {/if}
    {/if}
  </div>

  <input bind:this={fileInput} type="file" accept=".pdf,.zip" multiple hidden onchange={onFiles} />
  <input bind:this={dirInput} type="file" hidden onchange={onFiles} {...dirAttrs} />
</section>

<style>
  .dz {
    border: 1.5px dashed var(--border-strong);
    border-radius: var(--radius-panel);
    background: var(--surface-panel);
    padding: 36px 28px;
    text-align: center;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }
  .dz.dragging {
    border-color: var(--accent-brand-deep);
    background: var(--surface-callout-success);
  }
  .dz.busy {
    opacity: 0.75;
    pointer-events: none;
  }
  .dz.done {
    border-style: solid;
    border-color: color-mix(in srgb, var(--accent-brand) 55%, transparent);
    background: var(--surface-callout-success);
  }
  .dz-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .dz-icon {
    width: 34px;
    height: 34px;
    fill: none;
    stroke: var(--accent-brand-deep);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    margin-bottom: 4px;
  }

  /* animated success checkmark — circle draws, then the tick */
  .dz-check {
    width: 56px;
    height: 56px;
    margin-bottom: 6px;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: dz-pop 0.3s cubic-bezier(0.2, 0, 0, 1) 0.4s both;
  }
  .dz-check-circle {
    stroke: var(--accent-brand-deep);
    stroke-width: 2.5;
    stroke-dasharray: 151;
    stroke-dashoffset: 151;
    animation: dz-draw 0.5s cubic-bezier(0.2, 0, 0, 1) 0.4s forwards;
  }
  .dz-check-mark {
    stroke: var(--accent-brand-deep);
    stroke-width: 3;
    stroke-dasharray: 40;
    stroke-dashoffset: 40;
    animation: dz-draw 0.3s cubic-bezier(0.2, 0, 0, 1) 0.82s forwards;
  }
  @keyframes dz-draw { to { stroke-dashoffset: 0; } }
  @keyframes dz-pop { from { transform: scale(0.8); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .dz-check, .dz-check-circle, .dz-check-mark { animation: none; stroke-dashoffset: 0; }
  }

  /* loading spinner */
  .dz-spinner {
    width: 34px;
    height: 34px;
    margin-bottom: 6px;
    border-radius: 50%;
    border: 3px solid color-mix(in srgb, var(--accent-brand-deep) 25%, transparent);
    border-top-color: var(--accent-brand-deep);
    animation: dz-spin 0.7s linear infinite;
  }
  @keyframes dz-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .dz-spinner { animation-duration: 1.6s; }
  }

  /* reading progress bar */
  .dz-bar {
    width: min(280px, 80%);
    height: 6px;
    margin-top: 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent-brand-deep) 18%, transparent);
    overflow: hidden;
  }
  .dz-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--accent-brand-deep);
    transition: width 0.2s ease;
  }

  /* read-files disclosure */
  .dz-files {
    margin: 12px 0 0;
    width: 100%;
    text-align: left;
  }
  .dz-files > summary {
    cursor: pointer;
    color: var(--accent-brand-deep);
    font-size: 0.85rem;
    font-weight: 700;
    text-align: center;
    list-style-position: inside;
  }
  .dz-files-count {
    display: block;
    margin-top: 3px;
    font-weight: 400;
    font-size: 0.76rem;
    color: var(--text-muted);
  }
  .dz-files-body {
    margin-top: 10px;
    max-height: 240px;
    overflow: auto;
    padding-right: 12px; /* keep the rows clear of the scrollbar */
    /* slim, on-brand scrollbar with a visible track */
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) var(--surface-panel-muted);
  }
  .dz-files-body::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }
  .dz-files-body::-webkit-scrollbar-track {
    background: var(--surface-panel-muted);
    border-radius: 999px;
  }
  .dz-files-body::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: 999px;
    border: 3px solid var(--surface-panel-muted);
  }
  .dz-files-body::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }
  .dz-files-body::-webkit-scrollbar-button {
    display: none;
  }
  .dz-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.84rem;
  }
  .dz-table td {
    padding: 6px 4px;
    border-bottom: 1px solid var(--border-strong);
    vertical-align: middle;
  }
  .dz-table tr:last-child td { border-bottom: 0; }
  .dz-td-file {
    color: var(--text-primary);
    word-break: break-all;
    font-variant-numeric: tabular-nums;
  }
  .dz-file-link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    word-break: break-all;
  }
  .dz-file-link:hover {
    color: var(--accent-brand-deep);
    text-decoration: underline;
  }
  .dz-table td:last-child {
    width: 1%;
    white-space: nowrap;
    text-align: right;
    padding-left: 12px;
  }
  .dz-pill {
    display: inline-block;
    padding: 1px 8px;
    border-radius: var(--radius-pill);
    font-size: 0.72rem;
    font-weight: 700;
  }
  .dz-pill.stmt { background: var(--accent-tertiary); color: var(--text-inverse); }
  .dz-pill.inv { background: var(--accent-brand-deep); color: var(--text-inverse); }
  .dz-pill.skip { background: var(--text-muted); color: var(--text-inverse); }

  .dz-found {
    margin: 2px 0 0;
    color: var(--text-secondary);
    font-size: 0.95rem;
  }
  .dz-found strong { color: var(--status-warn-text); font-variant-numeric: tabular-nums; }
  .dz-link {
    color: var(--accent-brand-deep);
    font-weight: 700;
    text-decoration: underline;
  }
  .dz-error {
    margin: 12px 0 0;
    color: var(--status-warn-text);
    font-size: 0.88rem;
    font-weight: 600;
  }
  .dz-title {
    margin: 0;
    font-family: var(--font-family-display);
    font-weight: 800;
    font-size: 1.1rem;
    color: var(--text-primary);
  }
  .dz-sub {
    margin: 0;
    max-width: 46ch;
    color: var(--text-secondary);
    font-size: 0.92rem;
  }
  .dz-actions {
    display: flex;
    gap: 10px;
    margin-top: 14px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .dz-btn {
    min-height: 42px;
    padding: 0 20px;
    border-radius: var(--radius-control);
    border: 1px solid var(--border-strong);
    background: var(--surface-panel);
    color: var(--text-primary);
    font-family: var(--font-family-body);
    font-weight: 700;
    font-size: 0.92rem;
    cursor: pointer;
    transition: scale 0.12s ease, border-color 0.15s ease, background-color 0.15s ease;
  }
  .dz-btn.primary {
    background: var(--accent-brand-deep);
    color: var(--text-inverse);
    border-color: transparent;
  }
  .dz-btn.primary:hover {
    background: var(--text-success);
  }
  .dz-btn:hover {
    border-color: var(--accent-brand-deep);
  }
  .dz-btn:active {
    scale: 0.96;
  }
  .dz-btn.ghost {
    border-color: transparent;
    color: var(--text-muted);
  }
  .dz-btn.ghost:hover {
    border-color: var(--border-strong);
    color: var(--text-primary);
  }
  .dz-hint {
    margin: 12px 0 0;
    color: var(--text-muted);
    font-size: 0.82rem;
  }
</style>

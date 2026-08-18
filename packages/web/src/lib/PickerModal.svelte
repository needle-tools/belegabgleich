<script lang="ts">
  /**
   * Per-charge "Beleg zuordnen" overlay: shows the booking, lets the user open the
   * vendor's billing page in a new tab to download the invoice, then drop it right
   * here. The dropped PDF is added to the source pool
   * and the whole abgleich re-runs — matchStatement links it to this booking by
   * amount, so the row flips to "Beleg da". Everything stays local.
   */
  import { collectFromDataTransfer, collectFromFileList, type CollectedPdf } from "./collect";
  import { openBeleg } from "./openBeleg";
  import { money, dDate, invoicePortalsFor, type ReportEntry } from "./report";
  import type { RunResult } from "./engine";

  let {
    entry,
    onload,
    onclose,
    onprepare,
    live = true,
    loadError = "",
    targetLabel = "",
    saved = [],
    existing = [],
    denied = false,
    note = "",
    onundo,
  }: {
    entry: ReportEntry;
    onload: (pdfs: CollectedPdf[], entry: ReportEntry) => Promise<RunResult | null> | void;
    onclose: () => void;
    /** Called on the gesture that supplies a file (drop, or opening the file
     *  dialog) — the parent uses it to ask for folder write access while the
     *  browser still counts this as a user action. */
    onprepare?: () => void;
    /** false when the report is still showing demo data (no real statement loaded). */
    live?: boolean;
    /** the App's last load error, shown when a re-run yields no result. */
    loadError?: string;
    /** Folder a dropped Beleg is filed into (empty when nothing can be written). */
    targetLabel?: string;
    /** Paths written by the last drop, relative to the picked folder. */
    saved?: string[];
    /** Paths that were already in the folder — same document, nothing written. */
    existing?: string[];
    /** Write access was refused — the Beleg was matched but not saved. */
    denied?: boolean;
    /** Why nothing could be filed into the folder (empty when it worked). */
    note?: string;
    /** Delete the files this drop just wrote and undo its effect on the report.
     *  Absent when nothing was written — then there is nothing to take back. */
    onundo?: () => Promise<boolean>;
  } = $props();

  const portals = $derived(invoicePortalsFor(entry.provider, entry.date));
  // Vendors that bill through several portals get one button each; with a single
  // portal the header keeps its plain "Quelle öffnen" shortcut.
  const url = $derived(portals.length === 1 ? portals[0].url : undefined);

  let dragging = $state(false);
  let depth = 0;
  let busy = $state(false);
  let feedback = $state<null | { kind: "matched" | "nomatch" | "empty" | "error"; invoice?: string }>(null);
  let fileInput: HTMLInputElement;
  /** null = nothing taken back yet; "done"/"failed" = outcome of the last try. */
  let undone = $state<null | "done" | "failed">(null);
  let undoing = $state(false);
  /** Either job blocks the dropzone; they say different things while they run. */
  const working = $derived(busy || undoing);

  async function undo() {
    if (!onundo || working) return;
    undoing = true;
    const ok = await onundo();
    undoing = false;
    undone = ok ? "done" : "failed";
    if (ok) feedback = null; // the drop is gone — its verdict no longer applies
  }

  /** Did THIS booking get a Beleg after the re-run? Matched by date + amount (+ provider). */
  function assignedInvoice(res: RunResult, e: ReportEntry): string | null {
    const cand = res.entries.filter(
      (x) => x.status === "matched" && x.date === e.date && Math.abs(x.amount - e.amount) <= 0.01,
    );
    if (!cand.length) return null;
    const best = cand.find((x) => x.provider === e.provider) ?? cand[0];
    return best.invoice ?? "";
  }

  async function emit(pdfs: CollectedPdf[]) {
    if (busy) return;
    if (!pdfs.length) { feedback = { kind: "empty" }; return; }
    busy = true;
    feedback = null;
    undone = null; // a fresh drop supersedes whatever the last one did
    // File it into the folder next to its statement, add to the pool + re-run;
    // matchStatement links by amount. Await so we can tell the user whether THIS
    // booking actually got its Beleg.
    const res = await onload(pdfs, entry);
    busy = false;
    if (!res) { feedback = { kind: "error" }; return; }
    const inv = assignedInvoice(res, entry);
    feedback = inv !== null ? { kind: "matched", invoice: inv } : { kind: "nomatch" };
  }
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    depth = 0;
    if (busy) return;
    onprepare?.(); // before any await — the drop is what still counts as the gesture
    if (e.dataTransfer) emit(await collectFromDataTransfer(e.dataTransfer));
  }
  async function onFiles(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) emit(await collectFromFileList(input.files));
    input.value = "";
  }
  /** Click / Enter on the dropzone: open the file dialog, and take the same gesture
   *  to ask for write access — a file is on its way in. */
  function choose() {
    if (working) return;
    onprepare?.();
    fileInput.click();
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape") onclose(); }} />

<!-- Click outside closes, like every other overlay on the web. Only a click that
     lands on the backdrop itself — never one that bubbled up out of the dialog. -->
<div
  class="backdrop"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-label={`Beleg zuordnen — ${entry.provider}`}
  >
    <header class="modal-head">
      <h2>Beleg zuordnen · {entry.provider}</h2>
      {#if url}
        <button type="button" class="ghost" onclick={() => openBeleg(url)}>
          Quelle öffnen
          <svg class="ext" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3L4 12" /></svg>
        </button>
      {/if}
    </header>

    <div class="booking">
      <span class="booking-label">Diese Buchung</span>
      <div class="booking-row">
        <span class="booking-date">{dDate(entry.date)}</span>
        <span class="booking-amount">{money(entry.amount, entry.currency)}</span>
      </div>
    </div>

    {#if !live}
      <p class="demo-note">
        Demo-Ansicht — lade zuerst deinen eigenen Kontoauszug bzw. deine
        Kreditkartenabrechnung, damit ein abgelegter Beleg wirklich zugeordnet wird.
      </p>
    {/if}

    <section class="block">
      <h3>Beleg noch nicht dabei?</h3>
      {#if portals.length > 1}
        <p>{entry.provider} rechnet über mehrere Portale ab — der Auszug verrät nicht, welches. Öffne das passende und lege die Rechnung unten ab.</p>
        <div class="portals">
          {#each portals as p (p.url)}
            <button type="button" class="ghost" onclick={() => openBeleg(p.url)}>
              {p.label}
              <svg class="ext" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3L4 12" /></svg>
            </button>
          {/each}
        </div>
      {:else if portals.length === 1}
        <p>Bei {entry.provider} herunterladen und unten ablegen.</p>
        <button type="button" class="primary" onclick={() => openBeleg(portals[0].url)}>
          Rechnung bei {entry.provider} herunterladen
          <svg class="ext" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3L4 12" /></svg>
        </button>
      {:else}
        <p>Für {entry.provider} ist kein Download-Link hinterlegt — lade die Rechnung manuell herunter und lege sie unten ab.</p>
      {/if}
    </section>

    <div
      class="dropzone"
      class:dragging
      class:busy={working}
      role="button"
      tabindex="0"
      aria-busy={working}
      onclick={choose}
      onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } }}
      ondrop={onDrop}
      ondragover={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; }}
      ondragenter={(e) => { e.preventDefault(); if (working) return; depth++; dragging = true; }}
      ondragleave={() => { if (--depth <= 0) { depth = 0; dragging = false; } }}
    >
      {#if working}
        <span class="spinner" aria-hidden="true"></span>
        {#if undoing}
          <p><strong>Wird entfernt …</strong></p>
          <p class="muted">Die abgelegte Datei wird gelöscht und aus dem Bericht genommen.</p>
        {:else}
          <p><strong>Wird geprüft …</strong></p>
          <p class="muted">PDF wird gelesen und gegen diese Buchung abgeglichen.</p>
        {/if}
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <p><strong>PDF oder ZIP hierher ziehen</strong> (oder klicken)</p>
        {#if targetLabel}
          <p class="muted">
            Wird in <strong class="dz-target">{targetLabel}</strong> abgelegt — passend
            benannt, neben den Auszug — und gegen diese Buchung geprüft.
          </p>
        {:else}
          <p class="muted">Wird gescannt und gegen diese Buchung geprüft. ZIPs werden ausgepackt, Duplikate übersprungen.</p>
        {/if}
      {/if}
    </div>

    {#if note}
      <!-- This only ever appears when filing did NOT happen — the feature's whole
           promise. Neutral blue read as "just so you know"; it's a warning. -->
      <p class="filing-warn" role="status">
        <svg class="fb-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v5M8 11.5v.5" /></svg>
        <span>{note}</span>
      </p>
    {/if}

    {#if feedback}
      <div class="fb" class:ok={feedback.kind === "matched"} class:warn={feedback.kind === "nomatch" || feedback.kind === "empty"} class:err={feedback.kind === "error"} role="status">
        {#if feedback.kind === "matched"}
          <svg class="fb-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
          <div>
            <strong>Beleg zugeordnet.</strong>
            {#if saved.length}
              <span class="fb-sub">Gespeichert als {saved.join(", ")}{targetLabel ? ` in ${targetLabel.split("/")[0]}` : ""}.</span>
            {:else if existing.length}
              <span class="fb-sub">Lag schon im Ordner: {existing.join(", ")} — nichts doppelt gespeichert.</span>
            {:else if feedback.invoice}
              <!-- Nothing was filed, so nothing was renamed either: the PDF keeps
                   the name it was downloaded under. Say so, or "Beleg zugeordnet"
                   next to "Heroku _ Invoice.pdf" just looks broken. -->
              <span class="fb-sub">Nur im Bericht: {feedback.invoice} — die Datei bleibt liegen, wo sie ist, und behält ihren Namen.</span>
            {/if}
          </div>
        {:else if feedback.kind === "nomatch"}
          <svg class="fb-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v5M8 11.5v.5" /></svg>
          <div>
            <strong>Beleg hinzugefügt, aber kein Treffer für diese Buchung.</strong>
            <span class="fb-sub">Erwartet wird {money(entry.amount, entry.currency)} um den {dDate(entry.date)}. Lege den passenden Beleg ab oder prüfe Betrag/Datum.</span>
            {#if saved.length}<span class="fb-sub">Gespeichert als {saved.join(", ")}.</span>{/if}
          </div>
        {:else if feedback.kind === "empty"}
          <svg class="fb-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v5M8 11.5v.5" /></svg>
          <div><strong>Keine PDF erkannt.</strong> <span class="fb-sub">Ziehe eine PDF- oder ZIP-Datei hierher.</span></div>
        {:else}
          <svg class="fb-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v5M8 11.5v.5" /></svg>
          <div>
            <strong>Kein Abgleich möglich.</strong>
            <span class="fb-sub">{loadError || "Lade zuerst deinen Kontoauszug oder deine Kreditkartenabrechnung — eine Rechnung allein lässt sich nicht zuordnen."}</span>
          </div>
        {/if}
      </div>
    {/if}

    {#if onundo && saved.length && undone !== "done"}
      <div class="undo-bar">
        <span>Doch nicht der richtige Beleg? {saved.length === 1 ? "Die Datei wird" : "Die Dateien werden"} wieder aus dem Ordner gelöscht.</span>
        <button type="button" class="ghost danger" onclick={undo} disabled={working}>
          {saved.length === 1 ? "Datei entfernen" : "Dateien entfernen"}
        </button>
      </div>
    {/if}

    {#if undone === "done"}
      <p class="filing-note" role="status">Wieder entfernt — Ordner und Bericht stehen wie vorher.</p>
    {:else if undone === "failed"}
      <p class="filing-note" role="status">
        Entfernen hat nicht geklappt — bitte {saved.join(", ")} direkt im Ordner löschen.
      </p>
    {/if}

    <footer class="modal-foot">
      {#if feedback?.kind === "matched"}
        <button type="button" class="primary" onclick={onclose}>Fertig</button>
      {:else}
        <button type="button" class="ghost" onclick={onclose}>Schließen</button>
      {/if}
    </footer>

    <input bind:this={fileInput} type="file" accept=".pdf,.zip" multiple hidden onchange={onFiles} />
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 210;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: color-mix(in srgb, var(--text-primary) 35%, transparent);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    animation: pm-fade 0.12s ease;
  }
  .modal {
    width: min(480px, 100%);
    max-height: calc(100dvh - 48px);
    overflow-y: auto;
    background: var(--surface-panel);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
    padding: 22px;
    animation: pm-pop 0.16s cubic-bezier(0.2, 0, 0, 1);
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  .modal-head h2 {
    font-family: var(--font-family-display);
    font-weight: 800;
    font-size: 1.12rem;
    color: var(--text-primary);
  }

  .booking {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--surface-callout-info);
    padding: 14px 16px;
    margin-bottom: 18px;
  }
  .booking-label {
    display: block;
    font-size: var(--type-micro-label-size);
    font-weight: var(--type-micro-label-weight);
    letter-spacing: var(--type-micro-label-tracking);
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .booking-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .booking-date { color: var(--text-secondary); font-variant-numeric: tabular-nums; }
  .booking-amount {
    font-family: var(--font-family-display);
    font-weight: 800;
    font-size: 1.5rem;
    letter-spacing: -0.02em;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }

  .demo-note {
    margin: -4px 0 16px;
    padding: 10px 12px;
    border-radius: var(--radius-card);
    background: var(--surface-callout-info);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    font-size: 0.82rem;
  }

  .portals { display: flex; flex-wrap: wrap; gap: 8px; }

  .block { margin-bottom: 16px; }
  .block h3 { font-size: 0.98rem; font-weight: 700; margin-bottom: 6px; }
  .block p { margin: 0 0 10px; color: var(--text-secondary); font-size: 0.9rem; }

  .primary, .ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 16px;
    border-radius: var(--radius-control);
    font-family: var(--font-family-body);
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    transition: scale 0.12s ease, background-color 0.15s ease, border-color 0.15s ease;
  }
  .primary { background: var(--accent-brand-deep); color: var(--text-inverse); border: 1px solid transparent; }
  .primary:hover { background: var(--text-success); }
  .ghost { background: var(--surface-panel); color: var(--text-primary); border: 1px solid var(--border-strong); }
  .ghost:hover { border-color: var(--accent-brand-deep); }
  .primary:active, .ghost:active { scale: 0.97; }
  .ext { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

  .dropzone {
    border: 1.5px dashed var(--border-strong);
    border-radius: var(--radius-card);
    background: var(--surface-page);
    padding: 22px 18px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }
  .dropzone:hover { border-color: var(--accent-brand-deep); }
  .dropzone.dragging { border-color: var(--accent-brand-deep); background: var(--surface-callout-success); }
  .dropzone svg {
    width: 28px; height: 28px;
    fill: none; stroke: var(--accent-brand-deep);
    stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;
    margin-bottom: 6px;
  }
  .dropzone p { margin: 2px 0; font-size: 0.9rem; color: var(--text-primary); }
  .dropzone p.muted { color: var(--text-muted); font-size: 0.8rem; }
  .dz-target { color: var(--text-secondary); font-weight: 700; overflow-wrap: anywhere; }
  .filing-note, .filing-warn {
    margin: 10px 0 0;
    padding: 9px 11px;
    border-radius: var(--radius-card);
    background: var(--surface-callout-info);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .filing-warn {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    background: #fdf3e7;
    color: #9a5b1a;
    border-color: #f0d8b6;
  }
  .dropzone.busy { cursor: default; border-style: solid; border-color: var(--border-subtle); }

  .spinner {
    display: inline-block;
    width: 24px; height: 24px;
    margin-bottom: 8px;
    border: 2.5px solid var(--border-strong);
    border-top-color: var(--accent-brand-deep);
    border-radius: 50%;
    animation: pm-spin 0.7s linear infinite;
  }
  @keyframes pm-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 1.6s; } }

  .fb {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin-top: 14px;
    padding: 11px 13px;
    border-radius: var(--radius-card);
    border: 1px solid transparent;
    font-size: 0.88rem;
  }
  .fb strong { font-weight: 700; }
  .fb-sub { display: block; margin-top: 2px; color: var(--text-secondary); font-size: 0.82rem; }
  .fb-ic { width: 16px; height: 16px; flex: none; margin-top: 1px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .fb.ok { background: var(--surface-callout-success); color: var(--text-success); border-color: color-mix(in srgb, var(--text-success) 25%, transparent); }
  .fb.warn { background: #fdf3e7; color: #9a5b1a; border-color: #f0d8b6; }
  .fb.err { background: #fde9e6; color: #a23a2a; border-color: #f3c8c1; }

  .undo-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: var(--radius-card);
    border: 1px solid var(--border-subtle);
    background: var(--surface-page);
    color: var(--text-secondary);
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .undo-bar span { flex: 1 1 12rem; }
  /* Deleting a file is the one irreversible thing this dialog does — the button
     says so in colour, without shouting louder than the primary action. */
  .ghost.danger { min-height: 34px; padding: 0 12px; font-size: 0.82rem; color: #a23a2a; }
  .ghost.danger:hover { border-color: #a23a2a; }
  .ghost.danger:disabled { opacity: 0.5; cursor: default; }

  .modal-foot { display: flex; justify-content: flex-end; margin-top: 18px; }

  @keyframes pm-fade { from { opacity: 0; } }
  @keyframes pm-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
  @media (prefers-reduced-motion: reduce) {
    .backdrop, .modal { animation: none; }
  }
</style>

<script lang="ts">
  /**
   * "Beleg zuordnen" overlay: shows the booking (or the whole vendor group), lets the
   * user open the vendor's billing page in a new tab to download the invoices, then
   * drop them right here. The dropped PDFs are filed and the abgleich re-runs —
   * matchStatement links each one by amount, so the rows flip to "Beleg da".
   * Everything stays local.
   *
   * A group is the real unit of work: you go to Hetzner once and come back with five
   * months of invoices. Dropping them one booking at a time meant opening five
   * dialogs, so the dialog takes a list — and answers per booking, because "3 von 5"
   * is the only way to know which month you forgot.
   */
  import { collectFromDataTransfer, collectFromFileList, type CollectedPdf } from "./collect";
  import { openBeleg } from "./openBeleg";
  import { money, dDate, invoicePortalsFor, type ReportEntry } from "./report";
  import { tooltip } from "./tooltip";
  import type { ExtraInvoice, RunResult } from "./engine";

  let {
    entries,
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
    orphans = [],
    onlink,
  }: {
    /** The bookings this dialog is about: one row, or a whole vendor group. */
    entries: ReportEntry[];
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
    /** Belege in the folder that no booking claimed, closest first — candidates for
     *  a link the matcher couldn't make. */
    orphans?: ExtraInvoice[];
    /** Link one of those to this booking by hand. Returns the re-matched report. */
    onlink?: (entry: ReportEntry, rel: string) => Promise<RunResult | null>;
  } = $props();

  /** The booking that stands for the set: oldest still-open one, else the first.
   *  It supplies the vendor, and the folder a Beleg falls back to. */
  const lead = $derived(entries.find((e) => e.status === "missing") ?? entries[0]);
  const open = $derived(entries.filter((e) => e.status === "missing"));
  const group = $derived(entries.length > 1);
  // Newest booking in the set: for a vendor page that filters by date, that's the
  // one you're most likely here to fetch.
  const newest = $derived(entries.reduce((a, b) => (b.date > a.date ? b : a), entries[0]).date);
  const portals = $derived(invoicePortalsFor(lead.provider, newest));
  // Vendors that bill through several portals get one button each; with a single
  // portal the header keeps its plain "Quelle öffnen" shortcut.
  const url = $derived(portals.length === 1 ? portals[0].url : undefined);

  let dragging = $state(false);
  let depth = 0;
  let busy = $state(false);
  let feedback = $state<null | { kind: "matched" | "manual" | "nomatch" | "empty" | "error"; invoice?: string }>(null);
  /** Per-booking outcome of the last drop, keyed like the list is rendered. Empty
   *  until something has been dropped. */
  let covered = $state<Map<string, string | null>>(new Map());
  const keyOf = (e: ReportEntry, i: number) => `${e.date}|${e.amount}|${i}`;
  const baseName = (rel: string) => rel.split(/[/\\]|\s›\s/).pop() ?? rel;
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
    // File each PDF into the folder of the booking it settles, add to the pool and
    // re-run; matchStatement links by amount. Await so we can say, per booking,
    // whether it actually got its Beleg.
    const res = await onload(pdfs, lead);
    busy = false;
    if (!res) { feedback = { kind: "error" }; return; }
    const next = new Map<string, string | null>();
    entries.forEach((e, i) => next.set(keyOf(e, i), assignedInvoice(res, e)));
    covered = next;
    const hits = [...next.values()].filter((v) => v !== null).length;
    feedback = hits > 0 ? { kind: "matched", invoice: next.get(keyOf(lead, entries.indexOf(lead))) ?? "" } : { kind: "nomatch" };
  }
  /** Assign one of the unclaimed Belege to this booking by hand. */
  let linking = $state("");
  async function link(rel: string) {
    if (!onlink || working || linking) return;
    linking = rel;
    const res = await onlink(lead, rel);
    linking = "";
    if (!res) { feedback = { kind: "error" }; return; }
    const next = new Map<string, string | null>();
    entries.forEach((e, i) => next.set(keyOf(e, i), assignedInvoice(res, e)));
    covered = next;
    feedback = { kind: "manual", invoice: rel };
  }

  /** How many of the bookings in this dialog are covered now. */
  const coveredCount = $derived(
    entries.filter((e, i) => e.status === "matched" || covered.get(keyOf(e, i)) != null).length,
  );
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
    aria-label={`Beleg zuordnen — ${lead.provider}`}
  >
    <header class="modal-head">
      <h2>{group ? "Belege zuordnen" : "Beleg zuordnen"} · {lead.provider}</h2>
      {#if url}
        <button type="button" class="ghost" onclick={() => openBeleg(url)}>
          Quelle öffnen
          <svg class="ext" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3L4 12" /></svg>
        </button>
      {/if}
    </header>

    <div class="booking">
      <span class="booking-label">
        {#if group}
          {entries.length} Buchungen · {coveredCount} belegt
        {:else}
          Diese Buchung
        {/if}
      </span>
      {#if group}
        <!-- One line per booking, each with its own state: after a drop this is the
             list that tells you which month you forgot to download. -->
        <ul class="booking-list" class:scrolls={entries.length > 8}>
          {#each entries as e, i (keyOf(e, i))}
            {@const inv = covered.get(keyOf(e, i))}
            {@const done = e.status === "matched" || inv != null}
            <li class:done>
              <span class="booking-mark" aria-hidden="true">
                {#if done}
                  <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
                {/if}
              </span>
              <span class="booking-date">{dDate(e.date)}</span>
              <span class="booking-amount small">{money(e.amount, e.currency)}</span>
              <span class="booking-state">
                {#if e.status === "matched"}
                  war schon belegt
                {:else if inv != null}
                  Beleg zugeordnet
                {:else if covered.size}
                  noch offen
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="booking-row">
          <span class="booking-date">{dDate(lead.date)}</span>
          <span class="booking-amount">{money(lead.amount, lead.currency)}</span>
        </div>
      {/if}
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
        <p>{lead.provider} rechnet über mehrere Portale ab — der Auszug verrät nicht, welches. Öffne das passende und lege die Rechnungen unten ab.</p>
        <div class="portals">
          {#each portals as p (p.url)}
            <button type="button" class="ghost" onclick={() => openBeleg(p.url)}>
              {p.label}
              <svg class="ext" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3L4 12" /></svg>
            </button>
          {/each}
        </div>
      {:else if portals.length === 1}
        <p>Bei {lead.provider} herunterladen und unten ablegen{group ? " — gern alle auf einmal" : ""}.</p>
        <button type="button" class="primary" onclick={() => openBeleg(portals[0].url)}>
          {group ? "Rechnungen" : "Rechnung"} bei {lead.provider} herunterladen
          <svg class="ext" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3L4 12" /></svg>
        </button>
      {:else}
        <p>Für {lead.provider} ist kein Download-Link hinterlegt — lade die {group ? "Rechnungen" : "Rechnung"} manuell herunter und lege sie unten ab.</p>
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
        <p>
          <strong>
            {group ? "PDFs oder ZIP hierher ziehen" : "PDF oder ZIP hierher ziehen"}
          </strong> (oder klicken)
        </p>
        {#if group}
          <p class="muted">
            Mehrere auf einmal sind genau richtig — jeder Beleg geht an die Buchung,
            deren Betrag er trägt{#if targetLabel}, und in den Ordner neben deren
              Auszug (also nicht alle in denselben Monat){/if}.
          </p>
        {:else if targetLabel}
          <p class="muted">
            Wird in <strong class="dz-target">{targetLabel}</strong> abgelegt — passend
            benannt, neben den Auszug — und gegen diese Buchung geprüft. Mehrere PDFs
            gehen auch (z. B. zwei Amazon-Rechnungen für eine Abbuchung).
          </p>
        {:else}
          <p class="muted">Wird gescannt und gegen diese Buchung geprüft. Mehrere PDFs auf einmal sind ok, ZIPs werden ausgepackt, Duplikate übersprungen.</p>
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
      <div class="fb" class:ok={feedback.kind === "matched" || feedback.kind === "manual"} class:warn={feedback.kind === "nomatch" || feedback.kind === "empty"} class:err={feedback.kind === "error"} role="status">
        {#if feedback.kind === "matched"}
          <svg class="fb-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
          <div>
            <strong>
              {#if group}
                {coveredCount} von {entries.length} Buchungen belegt.
              {:else}
                Beleg zugeordnet.
              {/if}
            </strong>
            {#if group && coveredCount < entries.length}
              <span class="fb-sub">
                Die offenen Zeilen oben zeigen, welche Belege noch fehlen — hol sie und
                lege sie einfach dazu.
              </span>
            {/if}
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
        {:else if feedback.kind === "manual"}
          <svg class="fb-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
          <div>
            <strong>Von dir zugeordnet.</strong>
            <span class="fb-sub">
              {baseName(feedback.invoice ?? "")} gehört jetzt zu dieser Buchung — im
              Bericht als „manuell" gekennzeichnet, und die Zuordnung bleibt auch nach
              einem Neuladen bestehen.
            </span>
          </div>
        {:else if feedback.kind === "nomatch"}
          <svg class="fb-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v5M8 11.5v.5" /></svg>
          <div>
            <strong>
              {group
                ? "Belege hinzugefügt, aber keiner passt zu diesen Buchungen."
                : "Beleg hinzugefügt, aber kein Treffer für diese Buchung."}
            </strong>
            <span class="fb-sub">
              {#if group}
                Offen sind {open.map((e) => money(e.amount, e.currency)).join(" · ")}. Der
                Abgleich geht über den Betrag — stimmt der im PDF (Gesamtsumme, nicht
                Teilbetrag)?
              {:else}
                Erwartet wird {money(lead.amount, lead.currency)} um den {dDate(lead.date)}.
                Lege den passenden Beleg ab oder prüfe Betrag/Datum.
              {/if}
            </span>
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

    {#if onlink && !group && orphans.length && lead.status === "missing" && covered.get(keyOf(lead, entries.indexOf(lead))) == null}
      <!-- The way out when the matcher can't see it. It links on the amount, so a
           Beleg whose PDF states a different total — partial payment, credit applied,
           a figure we read wrong — will never match on its own, however obvious the
           pairing is to you. -->
      <section class="orphans">
        <h3>Beleg liegt schon da, passt aber nicht automatisch?</h3>
        <p>
          Diese Belege im Ordner gehören zu keiner Buchung. Wenn einer zu
          {money(lead.amount, lead.currency)} vom {dDate(lead.date)} gehört, ordne ihn
          von Hand zu — deine Zuordnung bleibt bestehen, auch nach einem Neuladen.
        </p>
        <ul>
          {#each orphans as o (o.rel)}
            <li>
              <span class="orphan-doc">
                {o.provider === "Unknown" ? "Anbieter unklar" : o.provider} ·
                {o.date ? dDate(o.date) : "ohne Datum"} ·
                {isFinite(parseFloat(o.total)) ? money(parseFloat(o.total), o.currency || "EUR") : "Betrag unklar"}
              </span>
              <span class="orphan-file" use:tooltip={o.rel}>{baseName(o.rel)}</span>
              <button type="button" class="ghost small" disabled={!!linking || working} onclick={() => link(o.rel)}>
                {linking === o.rel ? "Wird zugeordnet …" : "Zuordnen"}
              </button>
            </li>
          {/each}
        </ul>
      </section>
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
  /* One row per booking in a group, with a checkmark slot that fills in as Belege
     land. The slot is always there, so nothing shifts when it does. */
  .booking-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  /* Only a long group scrolls; a scrollbar next to three rows is just noise. */
  .booking-list.scrolls {
    max-height: 40vh;
    overflow-y: auto;
    scrollbar-width: thin;
    overscroll-behavior: contain;
  }
  .booking-list li {
    display: grid;
    grid-template-columns: 18px max-content 1fr max-content;
    align-items: baseline;
    gap: 10px;
    font-size: 0.9rem;
  }
  .booking-mark {
    justify-self: center;
    width: 14px;
    height: 14px;
    align-self: center;
    color: var(--text-success);
  }
  .booking-mark svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: pm-tick 0.24s cubic-bezier(0.2, 0, 0, 1);
  }
  @keyframes pm-tick { from { opacity: 0; scale: 0.25; filter: blur(4px); } }
  @media (prefers-reduced-motion: reduce) { .booking-mark svg { animation: none; } }
  .booking-amount.small {
    justify-self: end;
    font-family: var(--font-family-body);
    font-size: 1rem;
    font-weight: 700;
  }
  .booking-state {
    justify-self: end;
    min-width: 9ch;
    text-align: right;
    color: var(--text-muted);
    font-size: 0.76rem;
  }
  .booking-list li.done .booking-state { color: var(--text-success); }
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

  /* The manual-assignment list: a genuine escape hatch, so it looks like part of
     the dialog rather than an error state. */
  .orphans { margin-top: 14px; }
  .orphans h3 { font-size: 0.95rem; font-weight: 700; margin-bottom: 4px; }
  .orphans > p { margin: 0 0 8px; color: var(--text-secondary); font-size: 0.84rem; text-wrap: pretty; }
  .orphans ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .orphans li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: center;
    gap: 4px 10px;
    padding: 8px 10px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-control);
    background: var(--surface-page);
  }
  .orphan-doc { font-size: 0.85rem; font-weight: 650; font-variant-numeric: tabular-nums; }
  .orphan-file {
    grid-column: 1;
    color: var(--text-muted);
    font-size: 0.76rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .orphans button {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
  .ghost.small { min-height: 32px; padding: 0 12px; font-size: 0.82rem; }

  .modal-foot { display: flex; justify-content: flex-end; margin-top: 18px; }

  @keyframes pm-fade { from { opacity: 0; } }
  @keyframes pm-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
  @media (prefers-reduced-motion: reduce) {
    .backdrop, .modal { animation: none; }
  }
</style>

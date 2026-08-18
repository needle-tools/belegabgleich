<script lang="ts">
  /**
   * The Belege nobody claimed, as one more view of the report rather than a panel of
   * its own.
   *
   * They belong in the same table as the bookings: it's the same reconciliation seen
   * from the other side, and having them in a separate box below meant comparing two
   * sets of numbers by scrolling between them. The filter strip now carries both sums,
   * so this view only has to list the documents.
   */
  import { money, dDate } from "./report";
  import { tooltip } from "./tooltip";
  import type { ExtraInvoice } from "./engine";

  let {
    extras,
    onopen,
  }: {
    extras: ExtraInvoice[];
    /** Open one of these PDFs (only possible while its bytes are in memory). */
    onopen?: (rel: string) => void;
  } = $props();

  const amountOf = (e: ExtraInvoice) => parseFloat(e.total);
  const baseName = (rel: string) => rel.split(/[/\\]|\s›\s/).pop() ?? rel;
  const folderOf = (rel: string) => {
    const parts = rel.split(/[/\\]/);
    parts.pop();
    return parts.join("/");
  };

  // Biggest first, like the report: that's the one worth chasing.
  const sorted = $derived(
    [...extras].sort((a, b) => (isFinite(amountOf(b)) ? amountOf(b) : 0) - (isFinite(amountOf(a)) ? amountOf(a) : 0)),
  );
</script>

<ul class="extras">
  {#each sorted as e (e.rel)}
    <li class="row" style={`--i:${sorted.indexOf(e)}`}>
      <div class="c-name">
        <span class="dot" aria-hidden="true"></span>
        <span class="name-lines">
          <!-- An unrecognized issuer is a missing fact, not a name — it stays quiet
               instead of standing in for the vendor in bold. -->
          {#if e.provider && e.provider !== "Unknown"}
            <span class="provider">{e.provider}</span>
          {:else}
            <span class="provider unknown">Anbieter nicht erkannt</span>
          {/if}
          {#if onopen}
            <button
              type="button"
              class="file link"
              onclick={() => onopen?.(e.rel)}
              use:tooltip={`${e.rel} — PDF in einem neuen Tab öffnen`}
            >
              {baseName(e.rel)}
            </button>
          {:else}
            <span class="file" use:tooltip={{ text: e.rel, truncatedOnly: true }}>{baseName(e.rel)}</span>
          {/if}
        </span>
      </div>

      <span class="c-folder" use:tooltip={e.rel}>{folderOf(e.rel) || "—"}</span>
      <span class="c-date">{e.date ? dDate(e.date) : "ohne Datum"}</span>
      <span class="c-amount">
        {isFinite(amountOf(e)) ? money(amountOf(e), e.currency || "EUR") : "unklar"}
      </span>
      <div class="c-status">
        <span class="tag" use:tooltip={"Dieser Beleg passt zu keiner Buchung auf den geladenen Auszügen"}>
          keine Buchung
        </span>
      </div>
    </li>
  {/each}
</ul>

<p class="note">
  Häufige Gründe: der Auszug zu diesem Monat ist noch nicht geladen, der Betrag im PDF
  wurde anders gelesen (z. B. Teilbetrag statt Gesamtsumme), die Buchung steht auf einem
  anderen Konto — oder der Beleg liegt doppelt im Ordner. Über „Beleg holen“ an einer
  offenen Buchung lässt sich einer von Hand zuordnen.
</p>

<style>
  .extras {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content max-content max-content max-content;
    gap: 8px 16px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    --i: 0;
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    padding: 12px 18px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--surface-panel);
  }
  @media (prefers-reduced-motion: no-preference) {
    .row {
      animation: extras-in 0.4s cubic-bezier(0.2, 0, 0, 1) backwards;
      animation-delay: calc(var(--i) * 40ms + 100ms);
    }
    @keyframes extras-in {
      from { opacity: 0; transform: translateY(6px); }
    }
  }
  .c-name { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .name-lines { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex: none;
    background: var(--text-muted);
  }
  .provider.unknown { font-weight: 500; font-style: italic; color: var(--text-muted); }
  .provider {
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file {
    max-width: 100%;
    padding: 0;
    border: 0;
    background: none;
    font-family: var(--font-family-code);
    font-size: 0.74rem;
    line-height: 1.25;
    color: var(--text-muted);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Only the filename opens the PDF, not the row around it. */
  .file.link {
    width: max-content;
    max-width: 100%;
    color: var(--text-secondary);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .file.link:hover { color: var(--accent-brand-deep); }
  .c-folder {
    max-width: 16ch;
    color: var(--text-muted);
    font-size: 0.78rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .c-date {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .c-amount {
    justify-self: end;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
    white-space: nowrap;
  }
  .c-status { justify-self: start; }
  .tag {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 9px;
    border-radius: var(--radius-pill);
    background: var(--surface-panel-muted);
    color: var(--text-muted);
    font-size: 0.76rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .note {
    margin: 16px 0 0;
    max-width: 84ch;
    color: var(--text-muted);
    font-size: 0.79rem;
    line-height: 1.45;
    text-wrap: pretty;
  }

  @media (max-width: 640px) {
    .extras { display: flex; flex-direction: column; }
    .row { grid-template-columns: 1fr auto; column-gap: 12px; row-gap: 4px; }
    .c-name { grid-column: 1; grid-row: 1; }
    .c-amount { grid-column: 2; grid-row: 1; }
    .c-date { grid-column: 1; grid-row: 2; }
    .c-folder { grid-column: 2; grid-row: 2; justify-self: end; }
    .c-status { grid-column: 1 / -1; grid-row: 3; }
  }
</style>

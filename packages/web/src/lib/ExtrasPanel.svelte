<script lang="ts">
  /**
   * The other half of the reconciliation: Belege that were read but that no booking
   * claimed.
   *
   * The missing list alone can't be trusted to mean what it says — "4 Belege fehlen"
   * next to "4 Belege ohne Buchung" is almost never four missing documents, it's four
   * documents the matcher didn't link (a total read wrong, a statement not loaded, a
   * charge that hasn't been booked yet). Putting both sums side by side is what turns
   * "something is off" into "these two are the same money".
   */
  import { money, dDate } from "./report";
  import { tooltip } from "./tooltip";
  import type { ExtraInvoice } from "./engine";

  let {
    extras,
    missingCount,
    missingSum,
    onopen,
  }: {
    extras: ExtraInvoice[];
    missingCount: number;
    missingSum: number;
    /** Open one of these PDFs (only possible while its bytes are in memory). */
    onopen?: (rel: string) => void;
  } = $props();

  const amountOf = (e: ExtraInvoice) => parseFloat(e.total);
  const eurOnly = $derived(extras.filter((e) => !e.currency || e.currency.toUpperCase() === "EUR"));
  const foreign = $derived(extras.filter((e) => !eurOnly.includes(e)));
  const sum = $derived(eurOnly.reduce((n, e) => n + (isFinite(amountOf(e)) ? amountOf(e) : 0), 0));
  const baseName = (rel: string) => rel.split(/[/\\]|\s›\s/).pop() ?? rel;

  // Sorted like the report: biggest first, because that's the one worth chasing.
  const sorted = $derived(
    [...extras].sort((a, b) => (isFinite(amountOf(b)) ? amountOf(b) : 0) - (isFinite(amountOf(a)) ? amountOf(a) : 0)),
  );
</script>

<section class="extras" aria-label="Belege ohne Buchung">
  <div class="extras-head">
    <div>
      <h2>Belege ohne Buchung</h2>
      <span class="sub">
        {#if extras.length === 1}
          Ein Beleg liegt im Ordner, passt aber zu keiner geladenen Buchung
        {:else}
          {extras.length} Belege liegen im Ordner, passen aber zu keiner geladenen Buchung
        {/if}
      </span>
    </div>
    <!-- The comparison, as one sentence of numbers. -->
    <div class="balance" use:tooltip={"Wenn beide Summen ähnlich groß sind, sind es meist dieselben Vorgänge — der Abgleich hat sie nur nicht verknüpft."}>
      <span class="balance-side">
        <strong class="warn">{money(missingSum, "EUR")}</strong>
        <span class="balance-label">{missingCount} ohne Beleg</span>
      </span>
      <span class="balance-vs" aria-hidden="true">↔</span>
      <span class="balance-side">
        <strong>{money(sum, "EUR")}</strong>
        <span class="balance-label">
          {eurOnly.length} ohne Buchung{#if foreign.length}
            · {foreign.length} in Fremdwährung{/if}
        </span>
      </span>
    </div>
  </div>

  <ul class="extras-list">
    {#each sorted as e (e.rel)}
      <li class="extras-row">
        <span class="ex-provider" use:tooltip={{ text: e.provider, truncatedOnly: true }}>
          {e.provider === "Unknown" ? "Anbieter unklar" : e.provider}
        </span>
        <span class="ex-date">{e.date ? dDate(e.date) : "ohne Datum"}</span>
        <span class="ex-amount">
          {isFinite(amountOf(e)) ? money(amountOf(e), e.currency || "EUR") : "Betrag unklar"}
        </span>
        {#if onopen}
          <button
            type="button"
            class="ex-file"
            onclick={() => onopen?.(e.rel)}
            use:tooltip={`${e.rel} — PDF öffnen`}
          >
            {baseName(e.rel)}
          </button>
        {:else}
          <span class="ex-file" use:tooltip={{ text: e.rel, truncatedOnly: true }}>{baseName(e.rel)}</span>
        {/if}
      </li>
    {/each}
  </ul>

  <p class="extras-note">
    Häufige Gründe: der Auszug zu diesem Monat ist noch nicht geladen, der Betrag im PDF
    wurde anders gelesen (z. B. Teilbetrag statt Gesamtsumme), die Buchung steht auf einem
    anderen Konto — oder der Beleg liegt doppelt im Ordner.
  </p>
</section>

<style>
  .extras {
    background: var(--surface-panel);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
    padding: 24px;
    margin-top: 28px;
  }
  .extras-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .extras-head h2 {
    font-size: var(--type-section-title-size);
    font-weight: var(--type-section-title-weight);
    letter-spacing: var(--type-section-title-tracking);
  }
  .sub {
    display: block;
    margin-top: 4px;
    max-width: 60ch;
    color: var(--text-muted);
    font-size: 0.85rem;
    text-wrap: pretty;
  }

  .balance {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 14px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--surface-page);
  }
  .balance-side { display: flex; flex-direction: column; gap: 1px; }
  .balance-side strong {
    font-family: var(--font-family-display);
    font-weight: 800;
    font-size: 1.05rem;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .balance-side strong.warn { color: var(--status-warn-text); }
  .balance-label {
    font-size: var(--type-micro-label-size);
    font-weight: var(--type-micro-label-weight);
    letter-spacing: var(--type-micro-label-tracking);
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .balance-vs { color: var(--text-muted); font-size: 1rem; }

  .extras-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 320px;
    overflow-y: auto;
  }
  .extras-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content max-content minmax(0, 1.2fr);
    align-items: center;
    gap: 14px;
    padding: 8px 12px;
    border-radius: var(--radius-control);
    background: var(--surface-page);
    font-size: 0.88rem;
  }
  .ex-provider {
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ex-date { color: var(--text-muted); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
  .ex-amount { justify-self: end; font-weight: 700; font-variant-numeric: tabular-nums; }
  .ex-file {
    justify-self: end;
    max-width: 100%;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: 0.82rem;
    color: var(--text-muted);
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button.ex-file { cursor: pointer; }
  button.ex-file:hover { color: var(--accent-brand-deep); text-decoration: underline; }
  .extras-note {
    margin: 14px 0 0;
    max-width: 84ch;
    color: var(--text-muted);
    font-size: 0.79rem;
    line-height: 1.45;
    text-wrap: pretty;
  }

  @media (max-width: 640px) {
    .extras { padding: 18px; }
    .extras-row { grid-template-columns: minmax(0, 1fr) max-content; row-gap: 2px; }
    .ex-file { grid-column: 1 / -1; justify-self: start; text-align: left; }
    .ex-date { grid-column: 1; }
    .ex-amount { grid-column: 2; grid-row: 1; }
  }
</style>

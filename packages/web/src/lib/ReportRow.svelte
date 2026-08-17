<script lang="ts">
  import { type ReportEntry, money, dDate, invoiceUrlFor } from "./report";
  import { tooltip } from "./tooltip";
  let {
    entry,
    index = 0,
    child = false,
    onpick,
  }: { entry: ReportEntry; index?: number; child?: boolean; onpick?: (e: ReportEntry) => void } = $props();
  const url = $derived(entry.status === "missing" ? invoiceUrlFor(entry.provider) : undefined);
  // With a Beleg in hand, the useful thing on hover is WHERE it is — its path
  // inside the picked folder. Without one, fall back to revealing a clipped name.
  const nameTip = $derived(
    entry.status === "matched" && entry.invoice
      ? { text: `${entry.provider} · ${entry.invoice}` }
      : { text: entry.provider, truncatedOnly: true },
  );

  // A Beleg linked via exchange rate carries a note saying so — surface it, since
  // the amounts on screen (18,15 €) and in the PDF (20 $) won't look alike.
  const matchedTip = $derived(
    [entry.invoice ? `Zugeordneter Beleg: ${entry.invoice}` : "Ein passender Beleg wurde gefunden", entry.note]
      .filter(Boolean)
      .join(" · "),
  );

  // "Beleg holen": open the assign picker. The vendor page is opened only when the
  // user clicks "herunterladen" inside it — a direct gesture, so it's never blocked.
  function pick() {
    onpick?.(entry);
  }
</script>

<li class="row" class:child style={`--i:${index}`} data-status={entry.status}>
  <div class="c-name">
    <span class="dot" aria-hidden="true"></span>
    <span class="provider" use:tooltip={nameTip}>{entry.provider}</span>
  </div>

  <span class="c-date">{dDate(entry.date)}</span>

  <span class="c-amount">{money(entry.amount, entry.currency)}</span>

  <div class="c-status">
    {#if entry.status === "matched"}
      <span
        class="tag ok"
        use:tooltip={matchedTip}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
        Beleg da
      </span>
    {:else if entry.status === "missing"}
      <span class="tag warn" use:tooltip={"Zu dieser Buchung wurde kein Beleg im Ordner gefunden"}>Beleg fehlt</span>
    {:else}
      <span class="tag neutral" use:tooltip={"Für diese Buchung wird kein Beleg erwartet (z. B. Gehalt, Steuer, Kartenabrechnung)"}>{entry.note ?? "kein Beleg nötig"}</span>
    {/if}
  </div>

  <div class="c-action">
    {#if entry.status === "missing"}
      <button
        type="button"
        class="action"
        onclick={pick}
        use:tooltip={url
          ? `Belegseite bei ${entry.provider} öffnen und Rechnung hier zuordnen`
          : "Rechnung herunterladen und dieser Buchung zuordnen"}
      >
        Beleg holen
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3L4 12" /></svg>
      </button>
    {/if}
  </div>
</li>

<style>
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
  @keyframes row-in {
    from { opacity: 0; transform: translateY(6px); }
  }
  @media (prefers-reduced-motion: no-preference) {
    .row {
      animation: row-in 0.4s cubic-bezier(0.2, 0, 0, 1) backwards;
      animation-delay: calc(var(--i) * 45ms + 120ms);
    }
  }

  /* col 1 — name */
  .c-name {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  /* group member — subtler, indented under its parent */
  .row.child {
    background: var(--surface-panel-muted);
    border-color: transparent;
  }
  .row.child .c-name { padding-left: 22px; }
  .row.child .provider { font-weight: 600; }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex: none;
    background: var(--text-muted);
  }
  .row[data-status="matched"] .dot { background: var(--accent-brand-deep); }
  .row[data-status="missing"] .dot { background: var(--status-warn); }
  .provider {
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* col 2 — date */
  .c-date {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* col 3 — amount */
  .c-amount {
    justify-self: end;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
    white-space: nowrap;
  }

  /* col 4 — status */
  .c-status { justify-self: start; }
  /* col 5 — action */
  .c-action { justify-self: end; }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 24px;
    padding: 0 9px;
    border-radius: var(--radius-pill);
    font-size: 0.76rem;
    font-weight: 700;
    white-space: nowrap;
    border: 1px solid transparent;
  }
  .tag svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tag.ok { color: var(--text-success); background: var(--surface-callout-success); }
  .tag.warn { color: var(--status-warn-text); background: var(--status-warn-surface); border-color: var(--status-warn-border); }
  .tag.neutral { color: var(--text-muted); background: var(--surface-panel-muted); }

  .action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 28px;
    padding: 0 11px;
    border: none;
    border-radius: var(--radius-control);
    font-family: var(--font-family-body);
    font-size: 0.78rem;
    font-weight: 700;
    text-decoration: none;
    color: var(--text-inverse);
    background: var(--accent-brand-deep);
    cursor: pointer;
    transition: background-color 0.15s ease, scale 0.12s ease;
    white-space: nowrap;
  }
  .action svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .action:hover { background: var(--text-success); }
  .action:active { scale: 0.96; }
  .action.muted {
    color: var(--text-muted);
    background: var(--surface-panel-muted);
    cursor: default;
  }

  /* phones — drop the subgrid, stack into name+amount / date / status+action */
  @media (max-width: 640px) {
    .row {
      grid-template-columns: 1fr auto;
      column-gap: 12px;
      row-gap: 4px;
    }
    .c-name { grid-column: 1; grid-row: 1; }
    .c-amount { grid-column: 2; grid-row: 1; }
    .c-date { grid-column: 1 / -1; grid-row: 2; }
    .c-status { grid-column: 1; grid-row: 3; }
    .c-action { grid-column: 2; grid-row: 3; }
  }
</style>

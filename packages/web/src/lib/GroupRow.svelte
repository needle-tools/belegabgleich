<script lang="ts">
  import ReportRow from "./ReportRow.svelte";
  import { tooltip } from "./tooltip";
  import { openBeleg } from "./openBeleg";
  import { money, invoiceUrlFor, type EntryGroup, type ReportEntry } from "./report";

  let {
    group,
    index = 0,
    onpick,
  }: {
    group: EntryGroup;
    index?: number;
    /** Opens the assign picker for ONE booking. Must reach the expanded child
     *  rows — they carry their own "Beleg holen", and without it it does nothing. */
    onpick?: (e: ReportEntry) => void;
  } = $props();

  let open = $state(false);
  const toggle = () => (open = !open);

  const provider = $derived(group.items[0].provider);
  const url = $derived(group.status !== "matched" ? invoiceUrlFor(provider) : undefined);
  const statusLabel = $derived(
    group.status === "matched" ? "Beleg da" : group.status === "mixed" ? "teilweise belegt" : "Beleg fehlt",
  );
  const statusCls = $derived(group.status === "matched" ? "ok" : "warn");
  // Like a single row: with Belege in hand, hovering the name shows where they are.
  const invoices = $derived([
    ...new Set(group.items.map((i) => i.invoice).filter((v): v is string => !!v)),
  ]);
  const nameTip = $derived(
    invoices.length
      ? { text: `${provider} · ${invoices.join(" · ")}` }
      : { text: provider, truncatedOnly: true },
  );
</script>

<li class="row group-parent" data-status={group.status} style={`--i:${index}`}>
  <div class="c-name">
    <button
      class="toggle"
      type="button"
      aria-expanded={open}
      onclick={toggle}
      use:tooltip={open ? "Einzelne Buchungen ausblenden" : "Einzelne Buchungen anzeigen"}
    >
      <svg class="chev" class:open viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" /></svg>
      <span class="dot" aria-hidden="true"></span>
      <span class="provider" use:tooltip={nameTip}>{provider}</span>
    </button>
  </div>

  <span class="c-date" use:tooltip={"Mehrere Buchungen desselben Kontos — zusammengefasst"}>
    {group.items.length} Buchungen
  </span>

  <span class="c-amount">{money(group.sum, group.currency)}</span>

  <div class="c-status">
    <span class="tag {statusCls}">{statusLabel}</span>
  </div>

  <div class="c-action">
    {#if group.status !== "matched" && url}
      <a
        class="action"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onclick={(e) => { e.preventDefault(); openBeleg(url!); }}
        use:tooltip={`Rechnungen bei ${provider} herunterladen (öffnet die Belegseite im Popup)`}
      >
        Beleg holen
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3L4 12" /></svg>
      </a>
    {/if}
  </div>
</li>

{#if open}
  <!-- Two charges from one vendor can genuinely share a day and an amount (they
       differ only by transaction id, which dedupeCharges keeps them apart by), so
       provider+date+amount is not unique — the index is what separates them. -->
  {#each group.items as item, i (item.provider + item.date + item.amount + "#" + i)}
    <ReportRow entry={item} child {onpick} />
  {/each}
{/if}

<style>
  .group-parent {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    padding: 12px 18px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--surface-panel);
  }
  .c-name { display: flex; align-items: center; min-width: 0; }
  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font: inherit;
    color: inherit;
    text-align: left;
  }
  .chev {
    width: 14px;
    height: 14px;
    flex: none;
    fill: none;
    stroke: var(--text-muted);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.15s ease;
  }
  .chev.open { transform: rotate(90deg); }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex: none;
    background: var(--status-warn);
  }
  .group-parent[data-status="matched"] .dot { background: var(--accent-brand-deep); }
  .provider {
    font-weight: 800;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .c-date { color: var(--text-muted); font-size: 0.85rem; white-space: nowrap; }
  .c-amount {
    justify-self: end;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
    white-space: nowrap;
  }
  .c-status { justify-self: start; }
  .c-action { justify-self: end; }

  .tag {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 9px;
    border-radius: var(--radius-pill);
    font-size: 0.76rem;
    font-weight: 700;
    white-space: nowrap;
    border: 1px solid transparent;
  }
  .tag.ok { color: var(--text-success); background: var(--surface-callout-success); }
  .tag.warn { color: var(--status-warn-text); background: var(--status-warn-surface); border-color: var(--status-warn-border); }

  .action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 28px;
    padding: 0 11px;
    border-radius: var(--radius-control);
    font-size: 0.78rem;
    font-weight: 700;
    text-decoration: none;
    color: var(--text-inverse);
    background: var(--accent-brand-deep);
    transition: background-color 0.15s ease, scale 0.12s ease;
    white-space: nowrap;
  }
  .action svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .action:hover { background: var(--text-success); }
  .action:active { scale: 0.96; }

  @media (max-width: 640px) {
    .group-parent { grid-template-columns: 1fr auto; column-gap: 12px; row-gap: 4px; }
    .c-name { grid-column: 1; grid-row: 1; }
    .c-amount { grid-column: 2; grid-row: 1; }
    .c-date { grid-column: 1 / -1; grid-row: 2; }
    .c-status { grid-column: 1; grid-row: 3; }
    .c-action { grid-column: 2; grid-row: 3; }
  }
</style>

<script lang="ts">
  import ReportRow from "./ReportRow.svelte";
  import { tooltip } from "./tooltip";
  import { money, invoiceUrlFor, sourceShort, rowKey, type EntryGroup, type ReportEntry } from "./report";

  let {
    group,
    index = 0,
    showSource = false,
    sourceNames,
    justMatched,
    onpick,
    onpickgroup,
    onunmatch,
  }: {
    group: EntryGroup;
    index?: number;
    /** Render the "Quelle" column — on only when several documents are loaded. */
    showSource?: boolean;
    /** rel → short, distinguishing name of that document. */
    sourceNames?: Map<string, string>;
    /** Row keys that were matched a moment ago and are on their way out. */
    justMatched?: Set<string>;
    /** Opens the assign picker for ONE booking. Must reach the expanded child
     *  rows — they carry their own "Beleg holen", and without it it does nothing. */
    onpick?: (e: ReportEntry) => void;
    /** Opens the assign dialog for the whole group: one vendor trip, all invoices. */
    onpickgroup?: (g: EntryGroup) => void;
    /** Release a booking's Beleg again. Reaches the child rows too. */
    onunmatch?: (e: ReportEntry) => void;
  } = $props();

  let open = $state(false);
  const toggle = () => (open = !open);

  const provider = $derived(group.items[0].provider);
  // Newest booking in the group: for a vendor whose invoice page filters by date,
  // that's the one you're most likely here to fetch.
  const newest = $derived(group.items.reduce((a, b) => (b.date > a.date ? b : a), group.items[0]).date);
  const url = $derived(group.status !== "matched" ? invoiceUrlFor(provider, newest) : undefined);
  const oldest = $derived(group.items.reduce((a, b) => (b.date < a.date ? b : a), group.items[0]).date);
  /** "Mai 25 – Sep 25", or the plain date when they all fall in one month. */
  const monthFmt = new Intl.DateTimeFormat("de-DE", { month: "short", year: "2-digit" });
  const asMonth = (iso: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
    const [y, m] = iso.split("-").map(Number);
    return monthFmt.format(new Date(y, m - 1, 1));
  };
  const span = $derived(
    asMonth(oldest) === asMonth(newest) ? asMonth(newest) : `${asMonth(oldest)} – ${asMonth(newest)}`,
  );
  /** The documents this group's bookings came from — one name, or how many. */
  const sources = $derived([...new Set(group.items.map((i) => i.source?.rel).filter((v): v is string => !!v))]);
  /** Every booking in this group was just covered — the group says so before it goes. */
  const fresh = $derived(
    group.status === "matched" && group.items.every((i) => justMatched?.has(rowKey(i))),
  );
  const statusLabel = $derived(
    fresh
      ? "Belege zugeordnet"
      : group.status === "matched"
        ? "Beleg da"
        : group.status === "mixed"
          ? "teilweise belegt"
          : "Beleg fehlt",
  );
  const statusCls = $derived(group.status === "matched" ? "ok" : "warn");
  // Like a single row: with Belege in hand, hovering the name shows where they are.
  const invoices = $derived([
    ...new Set(group.items.map((i) => i.invoice).filter((v): v is string => !!v)),
  ]);
  // Tooltips keep newlines, so several Belege list one per line rather than running
  // together behind separators.
  const nameTip = $derived(
    invoices.length
      ? { text: [provider, ...invoices].join("\n") }
      : { text: provider, truncatedOnly: true },
  );
</script>

<li class="row group-parent" class:fresh data-status={group.status} style={`--i:${index}`}>
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

  {#if showSource}
    <span class="c-source">
      {#if sources.length === 1}
        <span class="source-name" use:tooltip={sources[0]}>
          {sourceNames?.get(sources[0]) || sourceShort(sources[0])}
        </span>
      {:else if sources.length > 1}
        <span class="source-name" use:tooltip={sources.join(" · ")}>{sources.length} Dokumente</span>
      {:else}
        <span class="source-name">—</span>
      {/if}
    </span>
  {/if}

  <!-- Says WHY these rows are one row, and over which months — the grouping rule was
       invisible before, which made it look arbitrary. -->
  <span
    class="c-date"
    use:tooltip={group.status === "matched"
      ? `${group.items.length} Buchungen, die derselbe Beleg abdeckt — zusammengefasst. Aufklappen zeigt sie einzeln.`
      : `Alle offenen Buchungen von ${provider} — zusammengefasst. Aufklappen zeigt sie einzeln.`}
  >
    <span class="count-lines">
      <span>{group.items.length} Buchungen</span>
      <span class="span">{span}</span>
    </span>
  </span>

  <span class="c-amount">{money(group.sum, group.currency)}</span>

  <div class="c-status">
    <span class="tag {statusCls}">{statusLabel}</span>
  </div>

  <div class="c-action">
    {#if group.status === "matched" && onunmatch && !fresh}
      <!-- One invoice covering several bookings is released as a whole; that's how it
           was matched. -->
      <button
        type="button"
        class="action release"
        onclick={() => group.items.forEach((i) => onunmatch?.(i))}
        use:tooltip={`Zuordnung für alle ${group.items.length} Buchungen aufheben`}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        Aufheben
      </button>
    {:else if group.status !== "matched"}
      <!-- One trip to the vendor covers every booking in the group, and one dialog
           takes all of the invoices you come back with — including the vendor link
           itself, so there's no reason to leave the group to fetch them. -->
      <button
        type="button"
        class="action"
        onclick={() => onpickgroup?.(group)}
        use:tooltip={url
          ? `Rechnungen bei ${provider} holen und alle auf einmal diesen ${group.items.length} Buchungen zuordnen`
          : `Rechnungen für diese ${group.items.length} Buchungen auf einmal zuordnen`}
      >
        Belege holen
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3L4 12" /></svg>
      </button>
    {/if}
  </div>
</li>

{#if open}
  <!-- Two charges from one vendor can genuinely share a day and an amount (they
       differ only by transaction id, which dedupeCharges keeps them apart by), so
       provider+date+amount is not unique — the index is what separates them. -->
  {#each group.items as item, i (item.provider + item.date + item.amount + "#" + i)}
    <ReportRow entry={item} child {showSource} {sourceNames} {justMatched} {onpick} {onunmatch} />
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
  .count-lines { display: flex; flex-direction: column; gap: 1px; }
  .span { font-size: 0.74rem; opacity: 0.85; font-variant-numeric: tabular-nums; }
  .c-source { min-width: 0; }
  .source-name {
    display: block;
    max-width: 14ch;
    color: var(--text-muted);
    font-size: 0.78rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .c-amount {
    justify-self: end;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--text-primary);
    white-space: nowrap;
  }
  .c-status { justify-self: start; }
  /* The buttons fill the column instead of hugging their text: "Beleg holen" and
     "Belege holen" differ by a few pixels of glyph, and a column of buttons whose
     edges wobble by a few pixels looks broken. */
  .c-action { justify-self: stretch; }

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
  .group-parent.fresh {
    background: var(--surface-callout-success);
    border-color: color-mix(in srgb, var(--accent-brand) 45%, transparent);
    transition: background-color 0.25s ease, border-color 0.25s ease;
  }
  .tag.warn { color: var(--status-warn-text); background: var(--status-warn-surface); border-color: var(--status-warn-border); }

  .action {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: center;
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
  /* The same affordance is an <a> (vendor page) or a <button> (expand), so the
     button needs the element defaults stripped to match. */
  button.action { border: none; cursor: pointer; font-family: var(--font-family-body); }
  /* An exit, not a call to action — same treatment as on a single row. */
  .action.release { background: transparent; color: var(--text-muted); font-weight: 650; }
  .action.release:hover { color: var(--status-warn-text); background: var(--status-warn-surface); }
  .action.release svg { width: 11px; height: 11px; }
  .action svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .action:hover { background: var(--text-success); }
  .action:active { scale: 0.96; }

  @media (max-width: 640px) {
    .group-parent { grid-template-columns: 1fr auto; column-gap: 12px; row-gap: 4px; }
    .c-name { grid-column: 1; grid-row: 1; }
    .c-amount { grid-column: 2; grid-row: 1; }
    .c-date { grid-column: 1; grid-row: 2; }
    .c-source { grid-column: 2; grid-row: 2; justify-self: end; }
    .c-status { grid-column: 1; grid-row: 3; }
    .c-action { grid-column: 2; grid-row: 3; }
  }
</style>

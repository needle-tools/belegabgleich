<script lang="ts">
  /**
   * The same invoice lying in more than one place.
   *
   * This happens to everyone sorting a year of downloads by hand — a March invoice
   * ends up in both 03 and 04 because it wasn't clear which month it belonged to —
   * and nothing about the report gives it away: both copies read fine, one matches a
   * booking, the other quietly joins "Belege ohne Buchung". Naming them is enough;
   * deleting is the user's call, in their own file manager.
   */
  import { money, dDate } from "./report";
  import { tooltip } from "./tooltip";
  import type { DuplicateGroup } from "./engine";

  let { duplicates }: { duplicates: DuplicateGroup[] } = $props();

  /**
   * The folder a copy sits in, short enough to read in a list.
   *
   * Two things made this unreadable: a ZIP contributes its whole archive name to
   * every path ("drive-download-20260609T124109Z-3-001.zip › 03"), and several copies
   * in ONE folder repeated that folder once per copy ("06 und 06 und 06"). So the
   * archive prefix is dropped, only the last two path segments are kept, and copies
   * are counted per folder instead of listed.
   */
  function shortDir(rel: string): string {
    const inside = rel.includes("›") ? rel.slice(rel.lastIndexOf("›") + 1) : rel;
    const parts = inside.split(/[/\\]/).map((p) => p.trim()).filter(Boolean);
    parts.pop(); // the file itself
    return parts.slice(-2).join("/") || "Hauptordner";
  }

  /** "01, 02 (2×), Hauptordner" — where the copies are, once each. */
  function places(rels: string[]): string {
    const counts = new Map<string, number>();
    for (const rel of rels) {
      const dir = shortDir(rel);
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
    return [...counts].map(([dir, n]) => (n > 1 ? `${dir} (${n}×)` : dir)).join(", ");
  }

  const amountOf = (d: DuplicateGroup) => parseFloat(d.total);
  const copies = $derived(duplicates.reduce((n, d) => n + d.rels.length, 0));
</script>

<div class="dup" role="status">
  <svg class="dup-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v5M8 11.5v.5" /></svg>
  <div class="dup-body">
    <strong>
      {duplicates.length === 1
        ? "Ein Beleg liegt mehrfach im Ordner"
        : `${duplicates.length} Belege liegen mehrfach im Ordner`}
      <span class="dup-copies">({copies} Dateien insgesamt)</span>
    </strong>
    <ul class="scroll-subtle" class:scrolls={duplicates.length > 6}>
      {#each duplicates as d (d.rels.join("|"))}
        <li>
          <span class="dup-doc">
            {d.provider} · {d.date ? dDate(d.date) : "ohne Datum"} ·
            {isFinite(amountOf(d)) ? money(amountOf(d), d.currency || "EUR") : "Betrag unklar"}
          </span>
          <span class="dup-where" use:tooltip={d.rels.join("\n")}>
            {d.rels.length}× in {places(d.rels)}
          </span>
        </li>
      {/each}
    </ul>
    <span class="dup-hint">
      Nur eine Kopie behalten — sonst zählt derselbe Beleg zweimal, und die zweite
      taucht als „Beleg ohne Buchung“ auf.
    </span>
  </div>
</div>

<style>
  .dup {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-top: 16px;
    padding: 11px 13px;
    border: 1px solid #f0d8b6;
    border-radius: var(--radius-card);
    background: #fdf3e7;
    color: #9a5b1a;
    font-size: 0.86rem;
  }
  .dup-ic {
    width: 16px;
    height: 16px;
    flex: none;
    margin-top: 2px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .dup-body { min-width: 0; flex: 1; }
  .dup-copies { font-weight: 500; opacity: 0.8; }
  /* Column widths on the list, rows subgrid them — sized per row, a long document
     line would shove its "3× in 01, 02" out of line with the row above it. */
  ul {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: 3px 14px;
  }
  /* A folder full of duplicates is a long list; it scrolls rather than pushing the
     rest of the report down. */
  ul.scrolls {
    max-height: 190px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  li {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: baseline;
    font-size: 0.83rem;
  }
  .dup-doc {
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dup-where {
    justify-self: end;
    max-width: 24ch;
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dup-hint {
    display: block;
    margin-top: 8px;
    font-size: 0.79rem;
    opacity: 0.9;
    text-wrap: pretty;
  }
</style>

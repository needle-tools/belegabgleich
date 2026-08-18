<script lang="ts">
  /**
   * The same invoice lying in more than one place.
   *
   * This happens to everyone sorting a year of downloads by hand — a March invoice ends
   * up in both 03 and 04 because it wasn't clear which month it belonged to — and
   * nothing about the report gives it away: both copies read fine, one matches a
   * booking, the other quietly joins "Belege ohne Buchung".
   *
   * Naming them is most of the job; deciding which copy to keep needs seeing them, so a
   * row opens into its files and each file opens as a PDF. Expanded in place rather than
   * in a floating layer on purpose: this list lives inside a scrolling callout, where
   * anything floating gets clipped or ends up behind something.
   */
  import { money, dDate } from "./report";
  import { tooltip } from "./tooltip";
  import type { DuplicateGroup } from "./engine";

  let {
    duplicates,
    onopen,
  }: {
    duplicates: DuplicateGroup[];
    /** Open one copy (only possible while its bytes are in memory). */
    onopen?: (rel: string) => void;
  } = $props();

  /** Which group is expanded, by its key. */
  let open = $state("");
  const keyOf = (d: DuplicateGroup) => d.rels.join("|");

  /**
   * The folder a copy sits in, short enough to read in a list: a ZIP contributes its
   * whole archive name to every path ("drive-download-20260609T124109Z-3-001.zip › 03"),
   * so the archive prefix goes and only the last two segments stay.
   */
  function shortDir(rel: string): string {
    const inside = rel.includes("›") ? rel.slice(rel.lastIndexOf("›") + 1) : rel;
    const parts = inside.split(/[/\\]/).map((p) => p.trim()).filter(Boolean);
    parts.pop(); // the file itself
    return parts.slice(-2).join("/") || "Hauptordner";
  }

  /**
   * "2× in 04" · "3× in 04 (2×), 05".
   *
   * The per-folder count only appears when there is more than one folder — with every
   * copy in one place it merely repeated the total, which read as "2× in 04 (2×)".
   */
  function where(rels: string[]): string {
    const counts = new Map<string, number>();
    for (const rel of rels) {
      const dir = shortDir(rel);
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
    const places =
      counts.size === 1
        ? [...counts.keys()][0]
        : [...counts].map(([dir, n]) => (n > 1 ? `${dir} (${n}×)` : dir)).join(", ");
    return `${rels.length}× in ${places}`;
  }

  const baseName = (rel: string) => rel.split(/[/\\]|\s›\s/).pop() ?? rel;
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

    <!-- Column widths on the container, rows subgrid them, so the "2× in 04" column
         lines up down the block however long a document line is. -->
    <div class="dups scroll-subtle" class:scrolls={duplicates.length > 6}>
      {#each duplicates as d (keyOf(d))}
        {@const expanded = open === keyOf(d)}
        <button
          type="button"
          class="dup-row"
          aria-expanded={expanded}
          onclick={() => (open = expanded ? "" : keyOf(d))}
          use:tooltip={expanded ? "" : "Die einzelnen Kopien anzeigen"}
        >
          <span class="dup-doc">
            <svg class="chev" class:open={expanded} viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" /></svg>
            <span class="dup-doc-text">
              {d.provider} · {d.date ? dDate(d.date) : "ohne Datum"} ·
              {isFinite(amountOf(d)) ? money(amountOf(d), d.currency || "EUR") : "Betrag unklar"}
            </span>
          </span>
          <span class="dup-where">{where(d.rels)}</span>
        </button>

        {#if expanded}
          <ul class="dup-files">
            {#each d.rels as rel (rel)}
              <li>
                {#if onopen}
                  <button
                    type="button"
                    class="dup-file link"
                    onclick={() => onopen?.(rel)}
                    use:tooltip={`${rel} — PDF in einem neuen Tab öffnen`}
                  >
                    <span class="dup-file-dir">{shortDir(rel)}/</span>{baseName(rel)}
                  </button>
                {:else}
                  <span class="dup-file" use:tooltip={rel}>
                    <span class="dup-file-dir">{shortDir(rel)}/</span>{baseName(rel)}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      {/each}
    </div>

    <span class="dup-hint">
      Nur eine Kopie behalten — sonst zählt derselbe Beleg zweimal, und die zweite taucht
      als „Beleg ohne Buchung“ auf.
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

  .dups {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: 2px 14px;
    margin-top: 6px;
  }
  /* A folder full of duplicates is a long list; it scrolls rather than pushing the rest
     of the report down. */
  .dups.scrolls {
    max-height: 220px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .dup-row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: baseline;
    gap: 14px;
    margin: 0;
    padding: 2px 4px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.83rem;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.12s ease;
  }
  .dup-row:hover { background: rgba(154, 91, 26, 0.09); }
  .chev {
    width: 11px;
    height: 11px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.7;
    transition: transform 0.15s ease;
  }
  .chev.open { transform: rotate(90deg); }
  .dup-doc {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .dup-doc-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dup-where {
    justify-self: end;
    max-width: 24ch;
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dup-files {
    grid-column: 1 / -1;
    list-style: none;
    margin: 1px 0 6px;
    padding: 0 0 0 21px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .dup-file {
    max-width: 100%;
    padding: 1px 0;
    border: 0;
    background: none;
    color: inherit;
    font-family: var(--font-family-code);
    font-size: 0.76rem;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .dup-file.link { cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .dup-file.link:hover { color: var(--text-primary); }
  .dup-file-dir { opacity: 0.65; }

  .dup-hint {
    display: block;
    margin-top: 8px;
    font-size: 0.79rem;
    opacity: 0.9;
  }
</style>

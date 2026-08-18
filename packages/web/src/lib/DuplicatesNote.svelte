<script lang="ts">
  /**
   * The same invoice lying in two folders.
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
  const dirOf = (rel: string) => {
    const parts = rel.split(/[/\\]/);
    parts.pop();
    return parts.join("/") || "Hauptordner";
  };
</script>

<div class="dup" role="status">
  <svg class="dup-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v5M8 11.5v.5" /></svg>
  <div class="dup-body">
    <strong>
      {duplicates.length === 1
        ? "Ein Beleg liegt doppelt im Ordner"
        : `${duplicates.length} Belege liegen doppelt im Ordner`}
    </strong>
    <ul>
      {#each duplicates as d (d.rels.join("|"))}
        <li>
          <span class="dup-doc">
            {d.provider} · {d.date ? dDate(d.date) : "ohne Datum"} ·
            {isFinite(parseFloat(d.total)) ? money(parseFloat(d.total), d.currency || "EUR") : "Betrag unklar"}
          </span>
          <span class="dup-where" use:tooltip={d.rels.join("\n")}>
            in {d.rels.map(dirOf).join(" und ")}
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
  .dup-body { min-width: 0; }
  ul {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 0.83rem;
  }
  .dup-doc { font-weight: 650; font-variant-numeric: tabular-nums; }
  .dup-where { opacity: 0.85; overflow-wrap: anywhere; }
  .dup-hint {
    display: block;
    margin-top: 6px;
    font-size: 0.79rem;
    opacity: 0.9;
    text-wrap: pretty;
  }
</style>

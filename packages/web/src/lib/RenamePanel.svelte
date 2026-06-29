<script lang="ts">
  import { track, bucket } from "@kah/analytics";
  import { tooltip } from "./tooltip";
  import { canRenameInPlace, downloadRenamedZip, renameInPlace, type RenamePlan } from "./rename";

  let { plans }: { plans: RenamePlan[] } = $props();

  const canInPlace = $derived(canRenameInPlace(plans));
  let busy = $state(false);
  let done = $state("");
  let error = $state("");

  function exportZip() {
    downloadRenamedZip(plans);
    track("rename_applied", { bucket: bucket(plans.length) });
    done = `${plans.length} ${plans.length === 1 ? "Beleg" : "Belege"} als ZIP heruntergeladen.`;
    error = "";
  }

  async function applyInPlace() {
    busy = true;
    error = "";
    done = "";
    try {
      const r = await renameInPlace(plans);
      if (r.denied) {
        error = "Ohne Schreibrechte für den Ordner kann nicht umbenannt werden.";
      } else {
        track("rename_applied", { bucket: bucket(r.ok) });
        done =
          `${r.ok} ${r.ok === 1 ? "Beleg" : "Belege"} im Ordner umbenannt.` +
          (r.failed.length ? ` ${r.failed.length} fehlgeschlagen.` : "");
      }
    } catch {
      error = "Beim Umbenennen ist etwas schiefgelaufen.";
    } finally {
      busy = false;
    }
  }
</script>

<section class="rename" aria-label="Belege umbenennen">
  <div class="rename-head">
    <div>
      <h2>Belege umbenennen</h2>
      <span class="sub">
        {plans.length}
        {plans.length === 1 ? "Rechnung erhält" : "Rechnungen erhalten"} einen einheitlichen Namen
      </span>
    </div>
    <div class="rename-actions">
      {#if canInPlace}
        <button
          type="button"
          class="btn-ghost"
          disabled={busy}
          onclick={applyInPlace}
          use:tooltip={"Benennt die Original-Dateien direkt in deinem Ordner um (fragt einmalig nach Schreibrechten)"}
        >
          Im Ordner umbenennen
        </button>
      {/if}
      <button
        type="button"
        class="btn-primary"
        disabled={busy}
        onclick={exportZip}
        use:tooltip={"Lädt umbenannte Kopien als ZIP herunter — deine Originale bleiben unverändert"}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10" /></svg>
        Als ZIP herunterladen
      </button>
    </div>
  </div>

  {#if done}
    <p class="rename-msg ok" role="status">{done}</p>
  {/if}
  {#if error}
    <p class="rename-msg err" role="alert">{error}</p>
  {/if}

  <ul class="rename-list">
    {#each plans as p (p.from)}
      <li class="rename-row">
        <span class="from" use:tooltip={{ text: p.from, truncatedOnly: true }}>{p.from}</span>
        <svg class="arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
        <span class="to" use:tooltip={{ text: p.base, truncatedOnly: true }}>{p.base}</span>
      </li>
    {/each}
  </ul>
  {#if !canInPlace}
    <p class="rename-hint">
      Tipp: Öffne deinen Rechnungsordner über „Ordner wählen“, um direkt im Ordner umzubenennen
      (statt als ZIP). Funktioniert in Chrome/Edge.
    </p>
  {/if}
</section>

<style>
  .rename {
    background: var(--surface-panel);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-panel);
    padding: 24px;
    margin-top: 28px;
  }
  .rename-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .rename-head h2 {
    font-size: var(--type-section-title-size);
    font-weight: var(--type-section-title-weight);
    letter-spacing: var(--type-section-title-tracking);
  }
  .sub {
    display: block;
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  .rename-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .btn-primary,
  .btn-ghost {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 0 18px;
    border-radius: var(--radius-control);
    font-family: var(--font-family-body);
    font-weight: 700;
    font-size: 0.9rem;
    cursor: pointer;
    transition: scale 0.12s ease, background-color 0.15s ease, border-color 0.15s ease;
  }
  .btn-primary {
    background: var(--accent-brand-deep);
    color: var(--text-inverse);
    border: 1px solid transparent;
    box-shadow: var(--shadow-subtle);
  }
  .btn-primary:hover { background: var(--text-success); }
  .btn-primary svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .btn-ghost {
    background: var(--surface-panel);
    color: var(--text-primary);
    border: 1px solid var(--border-strong);
  }
  .btn-ghost:hover { border-color: var(--accent-brand-deep); }
  .btn-primary:active, .btn-ghost:active { scale: 0.96; }
  .btn-primary:disabled, .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .rename-msg {
    margin: 0 0 14px;
    padding: 10px 14px;
    border-radius: var(--radius-control);
    font-size: 0.88rem;
    font-weight: 600;
  }
  .rename-msg.ok {
    background: var(--surface-callout-success);
    color: var(--text-success);
  }
  .rename-msg.err {
    background: color-mix(in srgb, var(--status-warn-text) 12%, transparent);
    color: var(--status-warn-text);
  }

  .rename-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 320px;
    overflow-y: auto;
  }
  .rename-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: var(--radius-control);
    background: var(--surface-page);
    font-size: 0.88rem;
    font-variant-numeric: tabular-nums;
  }
  .from {
    color: var(--text-muted);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .to {
    color: var(--text-primary);
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .arrow { width: 16px; height: 16px; fill: none; stroke: var(--accent-brand-deep); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  .rename-hint {
    margin: 14px 0 0;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  @media (max-width: 560px) {
    .rename { padding: 18px; }
    .rename-row { grid-template-columns: 1fr; gap: 2px; }
    .from { text-align: left; }
    .arrow { display: none; }
  }
</style>

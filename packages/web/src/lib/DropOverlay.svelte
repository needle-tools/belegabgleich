<script lang="ts">
  /**
   * Full-window drop target: drag a folder or PDFs anywhere onto the page and an
   * overlay appears; dropping runs detection + Zuordnung straight away (same
   * pipeline as the Dropzone panel). Because the overlay covers the viewport while
   * dragging, it — not the panel — receives the drop, so there's no double-handling.
   */
  import { collectFromDataTransfer, type CollectedPdf } from "./collect";

  let { onload, disabled = false }: { onload: (pdfs: CollectedPdf[]) => void; disabled?: boolean } = $props();

  let active = $state(false);
  let depth = 0; // dragenter/leave fire per element; count to avoid flicker

  const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

  function onEnter(e: DragEvent) {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    depth++;
    active = true;
  }
  function onOver(e: DragEvent) {
    if (!active) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }
  function onLeave() {
    if (--depth <= 0) {
      depth = 0;
      active = false;
    }
  }
  async function onDrop(e: DragEvent) {
    if (!active || !e.dataTransfer) return;
    e.preventDefault();
    depth = 0;
    active = false;
    const pdfs = await collectFromDataTransfer(e.dataTransfer);
    if (pdfs.length) onload(pdfs);
  }
</script>

<svelte:window ondragenter={onEnter} ondragover={onOver} ondragleave={onLeave} ondrop={onDrop} />

{#if active}
  <div class="drop-overlay" role="presentation">
    <div class="drop-overlay-card">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 16V4m0 0L7 9m5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <p class="t">Zum Abgleich hier ablegen</p>
      <p class="s">Kontoauszug · Kreditkartenabrechnung · Rechnungen — wird sofort ausgelesen</p>
    </div>
  </div>
{/if}

<style>
  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: color-mix(in srgb, var(--surface-page) 55%, transparent);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    animation: drop-overlay-in 0.12s ease;
  }
  .drop-overlay-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: min(560px, 100%);
    padding: 48px 32px;
    text-align: center;
    border: 2px dashed var(--accent-brand-deep);
    border-radius: var(--radius-panel);
    background: var(--surface-panel);
    box-shadow: var(--shadow-panel);
  }
  .drop-overlay-card svg {
    width: 44px;
    height: 44px;
    fill: none;
    stroke: var(--accent-brand-deep);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .drop-overlay-card .t {
    margin: 0;
    font-family: var(--font-family-display);
    font-weight: 800;
    font-size: 1.3rem;
    color: var(--text-primary);
  }
  .drop-overlay-card .s {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.92rem;
  }
  @keyframes drop-overlay-in {
    from { opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .drop-overlay { animation: none; }
  }
</style>

<script lang="ts">
  // The signature element: a calm ring whose center answers the page's one
  // question — "how many Belege are still missing?". The ring fills by coverage
  // (progress toward complete) while the count in the middle counts to the number
  // of missing Belege. Both honour prefers-reduced-motion.
  import { onMount, untrack } from "svelte";

  let { coverage = 0, matched = 0, total = 0 }: { coverage: number; matched: number; total: number } = $props();

  const R = 52;
  const C = 2 * Math.PI * R;

  const missing = $derived(Math.max(0, total - matched));

  let drawn = $state(false);
  let shownCount = $state(0);

  const dashoffset = $derived(drawn ? C * (1 - coverage) : C);

  const label = $derived(
    missing === 0 ? "nichts fehlt" : missing === 1 ? "Beleg fehlt" : "Belege fehlen",
  );
  /**
   * The ring must not congratulate you for a bad number. A nearly empty ring with
   * 43 missing Belege in the middle read as "all good" in the brand's green, so the
   * colour follows the state it depicts: warm while most Belege are missing, amber
   * on the way, green only once it's nearly done.
   */
  const state = $derived(
    missing === 0 ? "done" : coverage >= 0.9 ? "close" : coverage >= 0.5 ? "partial" : "poor",
  );
  // "von 11 Buchungen" beside a summary that counts 15 reads as a contradiction:
  // the ring only ever covers the bookings that need a Beleg at all, and it has to
  // say so.
  const sub = $derived(
    missing === 0
      ? `alle ${total} belegpflichtigen gedeckt`
      : `von ${total} belegpflichtigen`,
  );

  // let the first frame paint the empty ring, then the CSS transition fills it
  onMount(() => requestAnimationFrame(() => (drawn = true)));

  // Count the number up to the target — and re-run whenever it changes (e.g. when
  // real data replaces the demo), animating from the value currently shown rather
  // than snapping or sticking on the old number.
  $effect(() => {
    const target = missing;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      shownCount = target;
      return;
    }
    const from = untrack(() => shownCount);
    const duration = 900;
    let start = 0;
    let raf = requestAnimationFrame(function tick(t) {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic, matches the ring
      shownCount = Math.round(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  });
</script>

<figure
  class="meter"
  data-complete={missing === 0}
  data-state={state}
  aria-label={`${missing} von ${total} belegpflichtigen Buchungen ohne Beleg`}
>
  <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
    <defs>
      <linearGradient id="meterStroke" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="var(--meter-from)" />
        <stop offset="100%" stop-color="var(--meter-to)" />
      </linearGradient>
    </defs>
    <circle class="track" cx="60" cy="60" r={R} />
    <circle
      class="value"
      cx="60"
      cy="60"
      r={R}
      stroke-dasharray={C}
      stroke-dashoffset={dashoffset}
      transform="rotate(-90 60 60)"
    />
  </svg>
  <figcaption>
    <strong class="count">{shownCount}</strong>
    <span class="label">{label}</span>
    <span class="ratio">{sub}</span>
  </figcaption>
</figure>

<style>
  .meter {
    position: relative;
    width: 220px;
    height: 220px;
    margin: 0;
    flex: none;
    /* default (and the "close" state): the brand's green */
    --meter-from: var(--accent-highlight);
    --meter-to: var(--accent-secondary);
    --meter-count: var(--text-primary);
  }
  /* Most Belege still missing — warm, because that's what it is. */
  .meter[data-state="poor"] {
    --meter-from: #f0a04a;
    --meter-to: var(--status-warn);
    --meter-count: var(--status-warn-text);
  }
  /* On the way: amber, neither alarm nor congratulation. */
  .meter[data-state="partial"] {
    --meter-from: #f2c14e;
    --meter-to: #e08b3c;
    --meter-count: var(--text-primary);
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .track {
    fill: none;
    stroke: var(--border-subtle);
    stroke-width: 11;
  }
  .value {
    fill: none;
    stroke: url(#meterStroke);
    stroke-width: 11;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.9s cubic-bezier(0.2, 0, 0, 1);
  }
  @media (prefers-reduced-motion: reduce) {
    .value { transition: none; }
  }

  figcaption {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    text-align: center;
  }
  .count {
    font-family: var(--font-family-display);
    font-weight: 800;
    font-size: 3.4rem;
    line-height: 1;
    letter-spacing: -0.04em;
    color: var(--meter-count);
    font-variant-numeric: tabular-nums;
    transition: color 0.4s ease;
  }
  .meter[data-complete="true"] .count { color: var(--text-success); }
  .label {
    margin-top: 2px;
    font-size: var(--type-micro-label-size);
    font-weight: var(--type-micro-label-weight);
    letter-spacing: var(--type-micro-label-tracking);
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .ratio {
    margin-top: 4px;
    font-size: 0.85rem;
    font-weight: 650;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>

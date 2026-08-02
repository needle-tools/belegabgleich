/**
 * Reusable page sections. These are the pieces that repeat across the landing,
 * the audience pages and the articles — written once so the wording and the
 * markup stay identical everywhere.
 */

import { SITE, APP_PATH } from "./site.mjs";
import { esc, toolCta } from "./layout.mjs";

/**
 * The signature element, as a static SVG: a ring that fills with the share of
 * bookings that already have a Beleg, with the number still missing in the
 * middle. Mirrors `src/lib/CompletenessMeter.svelte` so the landing and the tool
 * show the same object.
 */
export function meter({ matched = 23, total = 28 } = {}) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const missing = Math.max(0, total - matched);
  const offset = C * (1 - (total ? matched / total : 1));
  const label = missing === 1 ? "Beleg fehlt" : "Belege fehlen";
  return `<figure class="meter" aria-label="${missing} von ${total} Buchungen ohne Beleg">
          <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
            <defs>
              <linearGradient id="meterStroke" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="var(--accent-highlight)" />
                <stop offset="100%" stop-color="var(--accent-secondary)" />
              </linearGradient>
            </defs>
            <circle class="meter-track" cx="60" cy="60" r="${R}" />
            <circle class="meter-value" cx="60" cy="60" r="${R}"
              stroke-dasharray="${C.toFixed(2)}"
              stroke-dashoffset="${offset.toFixed(2)}"
              style="--meter-from:${C.toFixed(2)}"
              transform="rotate(-90 60 60)" />
          </svg>
          <figcaption>
            <strong class="meter-count">${missing}</strong>
            <span class="meter-label">${label}</span>
            <span class="meter-ratio">von ${total} Buchungen</span>
          </figcaption>
        </figure>`;
}

/** A short excerpt of a statement — the artifact the whole tool is about. */
export function ledger() {
  const rows = [
    { name: "Hetzner", date: "19. Sep", amount: "12,90 €", state: "ok" },
    { name: "GitHub", date: "18. Sep", amount: "38,08 €", state: "ok" },
    { name: "Cloudflare", date: "21. Sep", amount: "25,00 €", state: "missing" },
    { name: "Stadtwerke", date: "10. Okt", amount: "84,00 €", state: "ok" },
    { name: "Lohnsteuer", date: "10. Okt", amount: "412,60 €", state: "none" },
  ];
  const badge = {
    ok: '<span class="ledger-badge ledger-badge-ok">zugeordnet</span>',
    missing: '<span class="ledger-badge ledger-badge-missing">Beleg fehlt</span>',
    none: '<span class="ledger-badge ledger-badge-none">kein Beleg nötig</span>',
  };
  return `<ul class="ledger" aria-label="Beispiel eines abgeglichenen Auszugs">
        ${rows
          .map(
            (r) => `<li class="ledger-row" data-state="${r.state}">
          <span class="ledger-name">${esc(r.name)}</span>
          <span class="ledger-date">${esc(r.date)}</span>
          <span class="ledger-amount">${esc(r.amount)}</span>
          ${badge[r.state]}
        </li>`,
          )
          .join("\n        ")}
      </ul>`;
}

/** The three steps. Order genuinely carries meaning here, so it is numbered. */
export function stepsSection({ id = "so-gehts", title = "In drei Schritten" } = {}) {
  const steps = [
    {
      h: "Auszug laden",
      p: "Kontoauszug oder Kreditkartenabrechnung als PDF auswählen. Der Browser liest die Datei — hochgeladen wird nichts.",
    },
    {
      h: "Rechnungsordner wählen",
      p: "Den Ordner mit deinen Rechnungen freigeben. Auch die PDFs darin verlassen deinen Rechner nicht.",
    },
    {
      h: "Lücken sehen",
      p: "Jede Buchung wird ihrer Rechnung zugeordnet. Was übrig bleibt, steht ganz oben — mit Link zur Rechnungsseite des Anbieters.",
    },
  ];
  return `<section class="section" id="${id}">
      <div class="section-head">
        <h2>${esc(title)}</h2>
      </div>
      <ol class="steps">
        ${steps
          .map(
            (s, i) => `<li class="step">
          <span class="step-n">${i + 1}</span>
          <h3>${esc(s.h)}</h3>
          <p>${esc(s.p)}</p>
        </li>`,
          )
          .join("\n        ")}
      </ol>
      <div class="section-foot">${toolCta()}</div>
    </section>`;
}

/** Supported vendors — trust, plus a lot of long-tail "Rechnung X finden" search. */
export function providersSection(providers) {
  const tags = providers
    .map((p) =>
      p.invoiceUrl
        ? `<li><a class="provider-tag" href="${esc(p.invoiceUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.name)}</a></li>`
        : `<li><span class="provider-tag">${esc(p.name)}</span></li>`,
    )
    .join("\n          ");

  return `<section class="section" id="anbieter">
      <div class="section-head">
        <h2>Erkennt Buchungen von über ${providers.length} Diensten</h2>
        <p class="section-lede">Belegabgleich ordnet die kryptischen Zahlungsempfänger auf
          deinem Auszug dem richtigen Anbieter zu und führt dich mit einem Klick zu dessen
          Rechnungsseite. Die Liste ist offen — jeder kann sie ergänzen.</p>
      </div>
      <ul class="provider-tags">
          ${tags}
      </ul>
      <p class="section-note">Dein Anbieter fehlt?
        <a href="${SITE.providersFile}" target="_blank" rel="noopener noreferrer">In <code>providers.json</code> ergänzen →</a>
        oder kurz eine Mail an
        <a href="mailto:${SITE.contactMail}?subject=Anbieter%20f%C3%BCr%20Belegabgleich">${SITE.contactMail}</a>,
        wir tragen ihn ein.
      </p>
    </section>`;
}

/** Audience cards — the entry points into the four landing pages. */
export function audienceSection(audiences) {
  return `<section class="section" id="fuer-wen">
      <div class="section-head">
        <h2>Gemacht für Leute, die ihre Vorbuchhaltung selbst machen</h2>
        <p class="section-lede">Dieselbe Mechanik, vier sehr verschiedene Anlässe. Such dir aus,
          was auf dich zutrifft.</p>
      </div>
      <ul class="card-grid">
        ${audiences
          .map(
            (a) => `<li class="card">
          <a href="${esc(a.path)}">
            <h3>${esc(a.cardTitle)}</h3>
            <p>${esc(a.cardText)}</p>
            <span class="card-more">${esc(a.cardCta)} →</span>
          </a>
        </li>`,
          )
          .join("\n        ")}
      </ul>
    </section>`;
}

/** A closing call to action. Never let a page end without a way into the tool. */
export function ctaBand({
  title = "Sieh in einer Minute, was fehlt",
  text = "Kein Konto, keine Installation, kein Upload. Auszug wählen, Rechnungsordner wählen, fertig.",
  label = "Belege abgleichen",
} = {}) {
  return `<section class="cta-band">
      <div class="cta-band-inner">
        <h2>${esc(title)}</h2>
        <p>${esc(text)}</p>
        <div class="cta-row">
          ${toolCta(label)}
          <a class="btn btn-ghost" href="${SITE.github}" target="_blank" rel="noopener noreferrer">Quellcode ansehen</a>
        </div>
      </div>
    </section>`;
}

/** An FAQ block, rendered as real details/summary so it works without JS. */
export function faqSection(items, { id = "faq", title, lede } = {}) {
  return `<section class="section" id="${id}">
      <div class="section-head">
        ${title ? `<h2>${esc(title)}</h2>` : ""}
        ${lede ? `<p class="section-lede">${lede}</p>` : ""}
      </div>
      <div class="faq-list">
        ${items
          .map(
            (f) => `<details class="faq-item">
          <summary><h3>${esc(f.q)}</h3></summary>
          <div class="faq-answer">${f.a}</div>
        </details>`,
          )
          .join("\n        ")}
      </div>
    </section>`;
}

/** Matching structured data, so the same answers can win a rich result. */
export function faqJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        // strip tags — schema.org wants the answer, not our markup
        text: f.a.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
      },
    })),
  };
}

export function breadcrumbJsonLd(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.label,
      item: SITE.origin + t.path,
    })),
  };
}

export function breadcrumb(trail) {
  return `<nav class="breadcrumb" aria-label="Brotkrumen">
        ${trail
          .map((t, i) =>
            i === trail.length - 1
              ? `<span aria-current="page">${esc(t.label)}</span>`
              : `<a href="${esc(t.path)}">${esc(t.label)}</a><span class="breadcrumb-sep" aria-hidden="true">/</span>`,
          )
          .join("\n        ")}
      </nav>`;
}

/** "Weiterlesen" list at the end of a page. */
export function relatedLinks(links, title = "Weiterlesen") {
  if (!links.length) return "";
  return `<section class="section related">
      <h2>${esc(title)}</h2>
      <ul class="related-list">
        ${links
          .map(
            (l) => `<li><a href="${esc(l.path)}">
          <strong>${esc(l.title)}</strong>
          <span>${esc(l.blurb)}</span>
        </a></li>`,
          )
          .join("\n        ")}
      </ul>
    </section>`;
}

/** The inline "try it" box that sits inside long prose. */
export function inlineCta(text = "Belegabgleich zeigt dir das in Sekunden — lokal, ohne Upload.") {
  return `<aside class="inline-cta">
        <p>${esc(text)}</p>
        <a class="btn btn-primary btn-sm" href="${APP_PATH}">Jetzt abgleichen</a>
      </aside>`;
}

/** Standing disclaimer for everything that touches tax or bookkeeping rules. */
export const DISCLAIMER = `<p class="disclaimer"><strong>Kein Rechts- oder Steuerrat.</strong>
        Dieser Text gibt allgemeine Informationen wieder, erhebt keinen Anspruch auf
        Richtigkeit, Vollständigkeit oder Aktualität und ersetzt keine Beratung im
        Einzelfall. Rechtslage und Verwaltungspraxis ändern sich. Im Zweifel frag deine
        Steuerberaterin oder deinen Steuerberater.
        <a href="/haftungsausschluss/">Vollständiger Haftungsausschluss</a>.</p>`;

/**
 * The HTML shell every page is rendered into: head/meta, the shared header and
 * the shared footer.
 *
 * The static marketing pages and the Svelte tool deliberately use the SAME
 * header/footer markup and the same class names (styled once in
 * `public/site.css`), so moving between the landing and `/app/` doesn't feel
 * like crossing into a different site.
 */

import { SITE, NAV, FOOTER_COLUMNS, APP_PATH } from "./site.mjs";

/** Escape a value for use in text or a double-quoted attribute. */
export const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const GH_PATH =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z";

export const ghIcon = (size = 17) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><path d="${GH_PATH}" /></svg>`;

/** Arrow used on every "into the tool" call to action. */
const ARROW = `<svg class="btn-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>`;

/**
 * The primary call to action. Every page has at least one — the whole point of
 * splitting marketing from the tool is that the way back in is never more than
 * one click away.
 */
export const toolCta = (label = "Belege abgleichen", cls = "btn btn-primary") =>
  `<a class="${cls}" href="${APP_PATH}">${esc(label)}${ARROW}</a>`;

function navLinks(cls) {
  return NAV.map(
    (n) => `<a class="${cls}" href="${esc(n.href)}">${esc(n.label)}</a>`,
  ).join("\n        ");
}

function header() {
  return `<div class="header-pill-shell">
    <header class="header-pill" data-menu-open="false">
      <a class="header-pill-brand" href="/" aria-label="Belegabgleich — Startseite">
        <img class="header-pill-logo" src="/icon.svg" alt="" width="40" height="40" />
        <span class="header-pill-brand-label">Belegabgleich</span>
      </a>
      <nav class="header-pill-nav" aria-label="Hauptnavigation">
        ${navLinks("header-pill-link")}
      </nav>
      <div class="header-pill-actions">
        <a class="ghicon" href="${SITE.github}" target="_blank" rel="noopener noreferrer" aria-label="Quellcode auf GitHub" title="Quellcode auf GitHub">${ghIcon()}</a>
        ${toolCta("Tool öffnen", "btn btn-primary btn-sm")}
      </div>
      <button class="header-pill-hamburger" type="button" aria-label="Menü" aria-expanded="false" aria-controls="site-menu">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <line class="hamburger-top" x1="3" y1="7" x2="21" y2="7" />
          <line class="hamburger-mid" x1="3" y1="12" x2="21" y2="12" />
          <line class="hamburger-bot" x1="3" y1="17" x2="21" y2="17" />
        </svg>
      </button>
      <div class="header-pill-dropdown" id="site-menu">
        <nav class="header-pill-dropdown-nav" aria-label="Menü">
          ${navLinks("header-pill-link")}
        </nav>
        <div class="header-pill-dropdown-actions">
          ${toolCta("Tool öffnen", "btn btn-primary")}
          <a class="btn btn-ghost" href="${SITE.github}" target="_blank" rel="noopener noreferrer">${ghIcon(15)} GitHub</a>
        </div>
      </div>
    </header>
  </div>`;
}

function footer(version) {
  const columns = FOOTER_COLUMNS.map(
    (col) => `<div class="site-footer-col">
          <span class="site-footer-col-title">${esc(col.title)}</span>
          ${col.links
            .map(
              (l) =>
                `<a href="${esc(l.href)}"${l.external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(l.label)}</a>`,
            )
            .join("\n          ")}
        </div>`,
  ).join("\n        ");

  return `<footer class="site-footer">
    <div class="site-footer-inner">
      <div class="site-footer-main">
        <div class="site-footer-brand">
          <a class="site-footer-wordmark" href="/">
            <img src="/icon.svg" alt="" width="34" height="34" />
            <span>Belegabgleich</span>
          </a>
          <p>Gleicht deinen Kontoauszug gegen deine Rechnungen ab und zeigt, welcher
            Buchung noch ein Beleg fehlt. Kostenlos, Open Source, 100&nbsp;% lokal.</p>
          <p class="site-footer-vendor">Ein Open-Source-Werkzeug von
            <a href="${SITE.vendorUrl}" target="_blank" rel="noopener noreferrer" aria-label="Needle — needle.tools">
              <img src="/logos/logo_needle_black_no_padding.svg" alt="Needle" width="86" height="22" />
            </a>
          </p>
        </div>
        ${columns}
      </div>
      <div class="site-footer-legal">
        <span>© ${new Date().getFullYear()} <a href="${SITE.vendorUrl}" target="_blank" rel="noopener noreferrer">Needle</a> · MIT-Lizenz</span>
        <span class="site-footer-version">${esc(version)}</span>
      </div>
    </div>
  </footer>`;
}

/** JSON-LD that belongs on every page: who publishes this and what it is. */
function baseJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.origin + "/",
    inLanguage: "de-DE",
    publisher: {
      "@type": "Organization",
      name: SITE.vendor,
      url: SITE.vendorUrl,
    },
  };
}

/**
 * Render a full page document.
 *
 * @param {object} page
 * @param {string} page.path      absolute path, always trailing-slashed ("/wissen/")
 * @param {string} page.title     <title> and og:title
 * @param {string} page.description meta description
 * @param {string} page.body      the page's inner HTML (without header/footer)
 * @param {"page"|"app"} [page.kind]  "app" renders a bare shell for the Svelte tool
 * @param {object[]} [page.jsonLd]  extra structured data blocks
 * @param {string} [page.bodyClass]
 * @param {object} ctx
 * @param {string} ctx.version    build stamp shown in the footer
 */
export function renderPage(page, ctx) {
  const url = SITE.origin + page.path;
  const isApp = page.kind === "app";
  const blocks = isApp ? [] : [baseJsonLd(), ...(page.jsonLd || [])];

  const head = `<meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}" />
    <link rel="canonical" href="${esc(url)}" />
    <meta name="theme-color" content="#F0F4EF" />
    ${isApp ? '<meta name="robots" content="noindex" />\n    ' : ""}<meta property="og:type" content="${page.ogType || "website"}" />
    <meta property="og:site_name" content="${SITE.name}" />
    <meta property="og:locale" content="${SITE.locale}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:title" content="${esc(page.title)}" />
    <meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:image" content="${SITE.origin}/og.jpg" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Belegabgleich — Kaktus-Maskottchen ordnet Belege am Schreibtisch" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(page.title)}" />
    <meta name="twitter:description" content="${esc(page.description)}" />
    <meta name="twitter:image" content="${SITE.origin}/og.jpg" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <link rel="preload" href="/fonts/NunitoSans-Variable.ttf" as="font" type="font/ttf" crossorigin />
    <link rel="stylesheet" href="/brand.css" />
    <link rel="stylesheet" href="/site.css" />${blocks
      .map(
        (b) =>
          `\n    <script type="application/ld+json">${JSON.stringify(b)}</script>`,
      )
      .join("")}`;

  if (isApp) {
    return `<!doctype html>
<html lang="${SITE.lang}">
  <head>
    ${head}
  </head>
  <body class="body-app">
    <div id="app"></div>
    <noscript>
      <div class="noscript-note">
        <p><strong>Belegabgleich braucht JavaScript.</strong> Der ganze Abgleich läuft in
          deinem Browser — es gibt keinen Server, der das für dich übernehmen könnte.</p>
        <p><a href="/">Zur Startseite</a> · <a href="/datenschutz/">Warum das gut für deine Daten ist</a></p>
      </div>
    </noscript>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;
  }

  return `<!doctype html>
<html lang="${SITE.lang}">
  <head>
    ${head}
  </head>
  <body class="${page.bodyClass || "body-site"}">
    <a class="skip-link" href="#main">Zum Inhalt springen</a>
    ${header()}
    <main id="main">
${page.body}
    </main>
    ${footer(ctx.version)}
    <script src="/site.js" defer></script>
  </body>
</html>
`;
}

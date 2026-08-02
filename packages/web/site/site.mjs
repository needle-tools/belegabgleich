/**
 * Site-wide constants: identity, navigation and footer.
 *
 * Everything the static pages and the tool shell share lives here so a URL or a
 * nav label is only ever written once. Consumed by `layout.mjs` (rendering) and
 * `build.mjs` (sitemap).
 */

export const SITE = {
  name: "Belegabgleich",
  origin: "https://belegabgleich.de",
  locale: "de_DE",
  lang: "de",
  claim: "Keine Buchung ohne Beleg.",
  github: "https://github.com/needle-tools/belegabgleich",
  providersFile:
    "https://github.com/needle-tools/belegabgleich/blob/main/providers.json",
  parsersDir:
    "https://github.com/needle-tools/belegabgleich/tree/main/packages/parsers",
  // The tool is made by Needle — the imprint is theirs, and so is the backlink.
  vendor: "Needle",
  vendorUrl: "https://needle.tools",
  // Trailing slashes are the canonical form — needle.tools 301s to them.
  vendorImprint: "https://needle.tools/imprint/",
  vendorPrivacy: "https://needle.tools/privacy/",
  contactMail: "hi@needle.tools",
};

/** The tool's own URL — deliberately its own page, not the landing. */
export const APP_PATH = "/app/";

/** Primary navigation. `href` may be an absolute path or a landing anchor. */
export const NAV = [
  { label: "So geht's", href: "/#so-gehts" },
  { label: "Für wen", href: "/#fuer-wen" },
  { label: "Wissen", href: "/wissen/" },
  { label: "Datenschutz", href: "/datenschutz/" },
];

/**
 * Footer columns. Kept explicit (rather than derived from the page list) so the
 * order is an editorial choice, not an accident of the build.
 */
export const FOOTER_COLUMNS = [
  {
    title: "Werkzeug",
    links: [
      { label: "Belege abgleichen", href: APP_PATH },
      { label: "So geht's", href: "/#so-gehts" },
      { label: "Unterstützte Anbieter", href: "/#anbieter" },
      { label: "Häufige Fragen", href: "/#faq" },
    ],
  },
  {
    title: "Für wen",
    links: [
      { label: "Freelancer", href: "/fuer-freelancer/" },
      { label: "Kleinunternehmen", href: "/fuer-kleinunternehmen/" },
      { label: "Vereine", href: "/fuer-vereine/" },
      { label: "Sparkasse-Auszüge", href: "/sparkasse-kontoauszug-belege/" },
    ],
  },
  {
    title: "Wissen",
    links: [
      { label: "Alle Beiträge", href: "/wissen/" },
      { label: "Das Belegprinzip", href: "/wissen/belegprinzip/" },
      { label: "Beleg verloren?", href: "/wissen/beleg-verloren-eigenbeleg/" },
      { label: "Aufbewahrungsfristen", href: "/wissen/belege-aufbewahren-fristen/" },
    ],
  },
  {
    title: "Rechtliches",
    links: [
      { label: "Datenschutz", href: "/datenschutz/" },
      { label: "Haftungsausschluss", href: "/haftungsausschluss/" },
      { label: "Impressum", href: SITE.vendorImprint, external: true },
      { label: "Quellcode (MIT)", href: SITE.github, external: true },
      { label: "needle.tools", href: SITE.vendorUrl, external: true },
    ],
  },
];

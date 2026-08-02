/**
 * The landing page, the four audience pages and the privacy page.
 *
 * Copy lives here as data. Every page states one job in its H1, answers it, and
 * ends with a way into the tool at /app/.
 */

import { SITE, APP_PATH } from "./site.mjs";
import { esc, toolCta } from "./layout.mjs";
import {
  meter,
  ledger,
  stepsSection,
  providersSection,
  audienceSection,
  ctaBand,
  faqSection,
  faqJsonLd,
  breadcrumb,
  breadcrumbJsonLd,
  relatedLinks,
  DISCLAIMER,
} from "./partials.mjs";

/* ------------------------------------------------------------------ landing */

const LANDING_FAQ = [
  {
    q: "Wie finde ich heraus, für welche Buchung ein Beleg fehlt?",
    a: `<p>Lade deinen Sparkassen-Kontoauszug oder deine Kreditkartenabrechnung und
      zeig auf den Ordner mit deinen Rechnungen. Belegabgleich vergleicht jede Buchung
      mit deinen Belegen und zeigt sofort, zu welcher Abbuchung noch keine Rechnung
      vorliegt.</p>`,
  },
  {
    q: "Mein Steuerberater fragt nach fehlenden Belegen — wie sammle ich sie schnell?",
    a: `<p>Belegabgleich listet genau die Buchungen ohne Beleg auf und verlinkt für viele
      Anbieter direkt die Rechnungsseite. Du lädst gezielt nur das Fehlende herunter,
      statt alles durchzugehen. Die Liste kannst du als CSV exportieren und weitergeben.</p>`,
  },
  {
    q: "Werden meine Kontoauszüge oder Bankdaten hochgeladen?",
    a: `<p>Nein. Belegabgleich läuft zu 100&nbsp;% lokal in deinem Browser. Deine Auszüge
      und Rechnungen verlassen den Rechner nicht — es gibt kein Backend und keine
      Cloud-KI. Nachzulesen in der <a href="/datenschutz/">Datenschutzerklärung</a>.</p>`,
  },
  {
    q: "Welche Banken werden unterstützt?",
    a: `<p>Aktuell Kontoauszüge und Kreditkartenabrechnungen der Sparkasse als PDF.
      Weitere Banken lassen sich über <a href="${SITE.parsersDir}" target="_blank" rel="noopener noreferrer">quelloffene
      Parser</a> ergänzen — oder du schreibst uns einfach an
      <a href="mailto:${SITE.contactMail}?subject=Bank%20f%C3%BCr%20Belegabgleich">${SITE.contactMail}</a>,
      welche Bank dir fehlt.</p>`,
  },
  {
    q: "Was kostet Belegabgleich?",
    a: `<p>Nichts. Belegabgleich ist kostenlos und Open Source unter MIT-Lizenz. Es gibt
      kein Konto, kein Abo und keine Bezahlschranke.</p>`,
  },
  {
    q: "Kann ich die fehlenden Belege als Liste exportieren?",
    a: `<p>Ja. Der Bericht lässt sich als CSV speichern — Excel-kompatibel und praktisch
      für die Buchhaltung oder den Steuerberater.</p>`,
  },
  {
    q: "Kann Belegabgleich meine Belege automatisch umbenennen?",
    a: `<p>Ja. Auf Wunsch benennt Belegabgleich deine Rechnungen einheitlich um, etwa zu
      <code>2026-03-14_Hetzner_12,90EUR.pdf</code>. Du siehst jede Umbenennung vorher und
      bestätigst sie selbst.</p>`,
  },
];

function landing({ providers, audiences }) {
  const body = `    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Kostenlos · Open Source · ohne Upload</p>
        <h1>Welcher Buchung fehlt der Beleg?</h1>
        <p class="lede">Lade deinen Kontoauszug oder deine Kreditkartenabrechnung und zeig auf
          deinen Rechnungsordner. Belegabgleich vergleicht beides und sagt dir in Sekunden,
          zu welcher Abbuchung noch eine Rechnung fehlt — und wo du sie bekommst.</p>
        <div class="cta-row">
          ${toolCta("Belege abgleichen")}
          <a class="btn btn-ghost" href="#so-gehts">So funktioniert's</a>
        </div>
        <p class="hero-note">Läuft komplett im Browser. Kein Konto, keine Installation,
          keine Datei verlässt deinen Rechner.</p>
      </div>
      <a class="hero-card" href="${APP_PATH}" aria-label="Zum Belegabgleich">
        <div class="hero-card-head">
          <span class="micro-label">Belegquote</span>
          <span class="hero-card-period">Sep – Okt 2026</span>
        </div>
        ${meter({ matched: 23, total: 28 })}
        <span class="hero-card-foot">Beispielbericht ansehen →</span>
      </a>
    </section>

    <section class="trust-strip" aria-label="Grundsätze">
      <div><strong>100 % lokal</strong><span>kein Server, kein Upload</span></div>
      <div><strong>Keine Cloud-KI</strong><span>deterministisch, optional lokales Ollama</span></div>
      <div><strong>Open Source</strong><span>~700 Zeilen Abgleich-Logik, MIT</span></div>
      <div><strong>Kostenlos</strong><span>kein Konto, kein Abo</span></div>
    </section>

    <section class="section" id="was-du-bekommst">
      <div class="section-head">
        <h2>Aus einem Auszug wird eine Aufgabenliste</h2>
        <p class="section-lede">Nicht „hier sind deine Daten“, sondern „das hier fehlt noch“.
          Bezahlte Buchungen mit Beleg verschwinden aus dem Weg, Gehalt und Steuer werden
          als „kein Beleg nötig“ erkannt — übrig bleibt, was du wirklich noch besorgen musst.</p>
      </div>
      ${ledger()}
      <div class="section-foot">${toolCta("Mit eigenen Dateien ausprobieren")}</div>
    </section>

    ${stepsSection()}

    ${audienceSection(audiences)}

    ${providersSection(providers)}

    <section class="section" id="datenschutz-teaser">
      <div class="callout">
        <h2>Deine Daten bleiben auf deinem Rechner — es gibt gar keinen anderen Ort</h2>
        <ul>
          <li><strong>Nichts wird hochgeladen.</strong> Deine Auszüge und Rechnungen werden direkt
            in deinem Browser gelesen. Wir betreiben keinen Server, der sie annehmen könnte.</li>
          <li><strong>Keine Cloud-KI.</strong> Der normale Abgleich rechnet einfach nach und braucht
            gar keine KI. Wer möchte, kann ein KI-Modell zuschalten — auch das läuft auf dem eigenen Rechner.</li>
          <li><strong>Keine Cookies, keine Profile.</strong> Wir zählen anonym mit, wie oft die Seite
            benutzt wird — niemals Inhalte, Beträge, Anbieter oder Kontodaten.</li>
          <li><strong>Zum Nachprüfen offen.</strong> Du musst uns nicht glauben:
            <a href="${SITE.github}" target="_blank" rel="noopener noreferrer">der komplette Quellcode ist öffentlich</a>.</li>
        </ul>
        <a class="callout-more" href="/datenschutz/">Datenschutz im Detail →</a>
      </div>
    </section>

    ${faqSection(LANDING_FAQ, {
      title: "Belege für Steuer und Steuerberater zusammenstellen",
      lede: `Ob Steuererklärung, Jahresabschluss oder Rückfrage vom Finanzamt: Zu jeder
          Abbuchung gehört ein Beleg — und am Ende fehlen fast immer ein paar Rechnungen.
          Die häufigsten Fragen dazu:`,
    })}

    ${ctaBand()}`;

  return {
    path: "/",
    title: "Belegabgleich — fehlende Belege zum Kontoauszug finden",
    description:
      "Kontoauszug oder Kreditkartenabrechnung gegen deine Rechnungen abgleichen: fehlende Belege finden, der richtigen Buchung zuweisen und automatisch benennen. Keine Buchung ohne Beleg. 100 % lokal, kein Upload, Open Source.",
    body,
    jsonLd: [
      faqJsonLd(LANDING_FAQ),
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: SITE.name,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: SITE.origin + APP_PATH,
        inLanguage: "de-DE",
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        author: { "@type": "Organization", name: SITE.vendor, url: SITE.vendorUrl },
      },
    ],
  };
}

/* ------------------------------------------------------- audience landings */

/**
 * Four audiences, one mechanic. Each page owns its own search intent, so the
 * H1, the pains and the FAQ are genuinely different — only the tool is shared.
 */
export const AUDIENCES = [
  {
    slug: "fuer-freelancer",
    path: "/fuer-freelancer/",
    cardTitle: "Freelancer & Selbstständige",
    cardText:
      "Ein Konto, viele kleine Abos — und im März die Frage, wo die Rechnung von letztem Juli liegt.",
    cardCta: "Belege für die Steuer sammeln",
    title: "Belege für die Steuererklärung finden — für Freelancer",
    description:
      "Als Freelancer alle Belege für die Steuererklärung zusammenbekommen: Kontoauszug gegen den Rechnungsordner abgleichen, fehlende Rechnungen gezielt nachholen. Kostenlos und ohne Upload.",
    h1: "Alle Belege für die Steuererklärung — ohne das ganze Jahr durchzublättern",
    lede: `Als Freelancer läuft fast alles über ein Konto: Hosting, Software-Abos,
      Fachliteratur, das Café, in dem du den Workshop vorbereitet hast. Die Rechnungen
      liegen in fünf Postfächern und drei Ordnern — und beim Zusammenstellen fehlen am
      Ende immer ein paar.`,
    pains: [
      {
        h: "Abos, die keiner mehr auf dem Schirm hat",
        p: "12,90 € im Monat fallen nicht auf, bis sie in der Buchhaltung als 12 unbelegte Buchungen auftauchen. Belegabgleich fasst wiederkehrende Abbuchungen desselben Anbieters zusammen, damit die Liste kurz bleibt.",
      },
      {
        h: "Kryptische Zahlungsempfänger",
        p: "Auf dem Auszug steht „CLOUDFLARE.COUS“, nicht „Cloudflare“. Über 130 Anbieter sind hinterlegt, samt Link auf die Seite, wo die Rechnung liegt.",
      },
      {
        h: "Belege, die überall heißen wie nichts",
        p: "„rechnung_final(2).pdf“ hilft in zwei Jahren niemandem. Auf Wunsch benennt Belegabgleich deine Belege einheitlich nach Datum, Anbieter und Betrag um.",
      },
    ],
    faq: [
      {
        q: "Ich habe nur PDFs und keine Buchhaltungssoftware — reicht das?",
        a: `<p>Ja. Belegabgleich braucht nichts außer deinem Auszug als PDF und einem Ordner
          mit Rechnungs-PDFs. Es ersetzt keine Buchhaltung, es sorgt dafür, dass vor der
          Buchhaltung nichts fehlt.</p>`,
      },
      {
        q: "Was ist mit Bargeld und Buchungen ohne Rechnung?",
        a: `<p>Gehalt, Steuervorauszahlungen, Sozialabgaben und Kartenabrechnungen erkennt
          Belegabgleich als „kein Beleg nötig“ und hält sie aus der Fehlend-Liste heraus.
          Bareinkäufe stehen naturgemäß nicht auf dem Kontoauszug — die musst du weiterhin
          selbst erfassen.</p>`,
      },
      {
        q: "Kann ich das Ergebnis meiner Steuerberatung geben?",
        a: `<p>Ja, exportiere den Bericht als CSV. Darin steht jede Buchung mit Datum, Betrag,
          Anbieter und Status — und damit genau die Liste, die sonst per Mail hin und her geht.</p>`,
      },
    ],
    related: ["belegprinzip", "beleg-verloren-eigenbeleg", "belege-benennen-dateinamen"],
  },
  {
    slug: "fuer-kleinunternehmen",
    path: "/fuer-kleinunternehmen/",
    cardTitle: "Kleinunternehmen & kleine GmbH",
    cardText:
      "Vorbuchhaltung im Team vorbereiten, ohne die Kontoauszüge in eine Cloud-SaaS zu laden.",
    cardCta: "Vorbuchhaltung vorbereiten",
    title: "Vorbuchhaltung für Kleinunternehmen — Belege prüfen ohne Cloud",
    description:
      "Belegprüfung für kleine Unternehmen und GmbHs: Kontoauszug gegen den Belegordner abgleichen, Lücken vor der Übergabe an die Steuerkanzlei schließen. Läuft lokal, keine Daten in fremden Systemen.",
    h1: "Vollständige Belege an die Kanzlei übergeben — ohne fremde Cloud",
    lede: `Die monatliche Übergabe an die Steuerkanzlei scheitert selten am guten Willen,
      sondern an drei fehlenden Rechnungen, die erst beim Buchen auffallen. Dann geht die
      Rückfrage raus, und die Buchung liegt zwei Wochen.`,
    pains: [
      {
        h: "Rückfragen, die Wochen kosten",
        p: "Fehlt der Beleg erst beim Buchen, ist der Vorgang längst kalt. Prüfe die Vollständigkeit, bevor die Unterlagen rausgehen — die Lücken siehst du in Sekunden statt beim dritten Nachhaken.",
      },
      {
        h: "Finanzdaten gehören nicht in irgendein SaaS",
        p: "Kontoauszüge sind mit die sensibelsten Unterlagen im Unternehmen. Belegabgleich hat kein Backend: Es gibt keinen Ort, an dem eure Auszüge liegen könnten. Auftragsverarbeitung wird damit gegenstandslos.",
      },
      {
        h: "Jeder benennt Belege anders",
        p: "Ein einheitliches Schema aus Datum, Anbieter und Betrag macht den Ordner durchsuchbar — auch für die Vertretung im Urlaub.",
      },
    ],
    faq: [
      {
        q: "Brauchen wir dafür einen Auftragsverarbeitungsvertrag?",
        a: `<p>Nein. Ein AV-Vertrag regelt, wie ein Dienstleister personenbezogene Daten in
          eurem Auftrag verarbeitet. Belegabgleich verarbeitet eure Dokumente ausschließlich
          im Browser auf eurem eigenen Gerät und überträgt sie nirgendwohin — es gibt keine
          Verarbeitung durch uns. Details in der <a href="/datenschutz/">Datenschutzerklärung</a>.</p>`,
      },
      {
        q: "Können mehrere Leute das benutzen?",
        a: `<p>Ja. Es gibt keine Lizenzen und keine Konten — jede Person öffnet die Seite und
          arbeitet mit ihren eigenen Dateien. Weil nichts synchronisiert wird, sieht auch
          niemand die Dateien der anderen.</p>`,
      },
      {
        q: "Lässt sich das selbst hosten?",
        a: `<p>Ja. Der Code steht unter MIT-Lizenz auf <a href="${SITE.github}" target="_blank" rel="noopener noreferrer">GitHub</a>;
          das Ergebnis ist eine statische Seite, die ihr auf jeden Webserver oder ins Intranet
          legen könnt.</p>`,
      },
    ],
    related: ["gobd-fuer-freelancer", "belege-aufbewahren-fristen", "belege-benennen-dateinamen"],
  },
  {
    slug: "fuer-vereine",
    path: "/fuer-vereine/",
    cardTitle: "Vereins-Schatzmeister",
    cardText:
      "Vor der Kassenprüfung wissen, zu welcher Abbuchung der Beleg im Ordner fehlt.",
    cardCta: "Kassenprüfung vorbereiten",
    title: "Kassenprüfung im Verein vorbereiten — fehlende Belege finden",
    description:
      "Als Schatzmeister die Kassenprüfung vorbereiten: Vereinskonto-Auszug gegen die Belegsammlung abgleichen und fehlende Belege vor der Prüfung finden. Kostenlos, lokal, ohne Anmeldung.",
    h1: "Vor der Kassenprüfung wissen, welcher Beleg fehlt",
    lede: `Das Ehrenamt macht die Kasse nebenbei, die Prüfung kommt einmal im Jahr — und
      dann sitzt man mit einem Ordner und einem Stapel Auszüge da und hakt von Hand ab.
      Genau dieses Abhaken übernimmt Belegabgleich.`,
    pains: [
      {
        h: "Abhaken von Hand dauert einen Abend",
        p: "Zeile für Zeile im Auszug gegen den Ordner: Das ist die Arbeit, die niemand machen will. Der Abgleich läuft in Sekunden und markiert nur, was übrig bleibt.",
      },
      {
        h: "Der Wechsel im Amt",
        p: "Wer die Kasse übernimmt, erbt einen Ordner und eine Vermutung. Ein Bericht mit Status je Buchung macht sichtbar, was tatsächlich belegt ist.",
      },
      {
        h: "Mitgliederdaten gehören nicht ins Netz",
        p: "Auf Vereinsauszügen stehen Namen von Mitgliedern. Weil nichts hochgeladen wird, bleibt das auch so.",
      },
    ],
    faq: [
      {
        q: "Wir haben kein Sparkassen-Konto — geht das trotzdem?",
        a: `<p>Momentan werden Sparkassen-Auszüge und -Kreditkartenabrechnungen als PDF
          gelesen. Andere Banken kommen über <a href="${SITE.parsersDir}" target="_blank" rel="noopener noreferrer">offene
          Parser</a> dazu; Beiträge sind willkommen.</p>
          <p>Kein GitHub-Konto? Schreib uns einfach an
          <a href="mailto:${SITE.contactMail}?subject=Bank%20f%C3%BCr%20Belegabgleich">${SITE.contactMail}</a>
          und sag uns, um welche Bank es geht. Ein Beispiel-Auszug hilft sehr —
          bitte vorher Beträge, Namen und Kontonummern schwärzen, wir brauchen nur
          den Aufbau der Seite.</p>`,
      },
      {
        q: "Was ist mit Mitgliedsbeiträgen und Spenden?",
        a: `<p>Das sind Einnahmen und keine Ausgaben mit Beleganspruch — Belegabgleich prüft
          die Abbuchungen. Spendenbescheinigungen und Beitragslisten führst du weiterhin
          getrennt.</p>`,
      },
      {
        q: "Können die Kassenprüfer das Ergebnis nachvollziehen?",
        a: `<p>Ja. Der CSV-Export enthält jede Buchung mit Datum, Betrag, Empfänger und Status.
          Zusammen mit dem Ordner ist das eine prüffähige Übersicht.</p>`,
      },
    ],
    related: ["belegprinzip", "belege-aufbewahren-fristen", "fehlende-belege-finden"],
  },
  {
    slug: "sparkasse-kontoauszug-belege",
    path: "/sparkasse-kontoauszug-belege/",
    cardTitle: "Sparkasse-Kontoauszüge",
    cardText:
      "Kontoauszug und Kreditkartenabrechnung der Sparkasse werden direkt als PDF gelesen.",
    cardCta: "Auszug abgleichen",
    title: "Sparkasse-Kontoauszug mit Belegen abgleichen (PDF)",
    description:
      "Sparkassen-Kontoauszug oder Kreditkartenabrechnung als PDF gegen deine Rechnungen abgleichen: welche Buchung hat noch keinen Beleg? Läuft lokal im Browser, kostenlos und ohne Upload.",
    h1: "Sparkassen-Kontoauszug gegen deine Belege abgleichen",
    lede: `Der Auszug kommt als PDF aus dem Online-Banking, die Rechnungen liegen in einem
      Ordner — dazwischen steht bisher Handarbeit. Belegabgleich liest beide Seiten und
      führt sie zusammen: Buchung für Buchung, inklusive Kreditkartenabrechnung.`,
    pains: [
      {
        h: "Kontoauszug und Kreditkarte gehören zusammen",
        p: "Die Sammelbuchung „Einzug Visa“ auf dem Girokonto sagt nichts darüber, was auf der Karte lag. Lade beide PDFs zusammen: Die Sammelbuchung wird als Kartenabrechnung erkannt, geprüft werden die Einzelposten.",
      },
      {
        h: "Der Verwendungszweck ist kein Anbietername",
        p: "„PAYPAL .ADOBE SYSTE“ ist für Menschen lesbar, für einen Ordnervergleich nicht. Der Abgleich normalisiert diese Zeichenketten auf den tatsächlichen Anbieter.",
      },
      {
        h: "Die PDFs bleiben, wo sie sind",
        p: "Ein Bankauszug ist nichts, was man auf eine fremde Website lädt. Belegabgleich liest ihn im Browser — es gibt keinen Server, der ihn empfangen könnte.",
      },
    ],
    faq: [
      {
        q: "Welche Sparkassen-PDFs funktionieren?",
        a: `<p>Die regulären Kontoauszüge und die Kreditkartenabrechnungen, wie sie im
          Online-Banking als PDF bereitstehen. Wichtig ist, dass es echte Text-PDFs sind —
          eingescannte Papierauszüge enthalten keinen auslesbaren Text.</p>`,
      },
      {
        q: "Werden meine Bankdaten irgendwohin übertragen?",
        a: `<p>Nein. Es gibt kein Backend und keine Cloud-KI. IBAN, Kontostand und Buchungen
          bleiben im Browser; beim Schließen des Tabs sind sie weg.</p>`,
      },
      {
        q: "Kommen andere Banken dazu?",
        a: `<p>Die Parser sind bewusst klein und quelloffen. Wer eine weitere Bank ergänzen
          will, findet sie <a href="${SITE.parsersDir}" target="_blank" rel="noopener noreferrer">hier im Repository</a>.
          Genauso gern per Mail an
          <a href="mailto:${SITE.contactMail}?subject=Bank%20f%C3%BCr%20Belegabgleich">${SITE.contactMail}</a> —
          sag uns einfach, welche Bank du nutzt.</p>`,
      },
    ],
    related: ["fehlende-belege-finden", "belegprinzip", "belege-benennen-dateinamen"],
  },
];

function audiencePage(a, articleIndex) {
  const trail = [
    { label: "Start", path: "/" },
    { label: a.cardTitle, path: a.path },
  ];
  const related = a.related
    .map((slug) => articleIndex.get(slug))
    .filter(Boolean)
    .map((art) => ({ path: art.path, title: art.linkTitle, blurb: art.blurb }));

  const body = `    ${breadcrumb(trail)}

    <section class="page-hero">
      <div class="page-hero-copy">
        <p class="eyebrow">${esc(a.cardTitle)}</p>
        <h1>${esc(a.h1)}</h1>
        <p class="lede">${a.lede}</p>
        <div class="cta-row">
          ${toolCta()}
          <a class="btn btn-ghost" href="#so-gehts">So funktioniert's</a>
        </div>
      </div>
      <div class="page-hero-aside">${meter({ matched: 23, total: 28 })}</div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Woran es meistens hakt</h2></div>
      <ul class="card-grid card-grid-plain">
        ${a.pains
          .map(
            (p) => `<li class="card">
          <h3>${esc(p.h)}</h3>
          <p>${esc(p.p)}</p>
        </li>`,
          )
          .join("\n        ")}
      </ul>
    </section>

    ${stepsSection({ title: "So läuft es bei dir" })}

    ${faqSection(a.faq, { title: "Fragen dazu" })}

    ${relatedLinks(related)}

    ${ctaBand()}`;

  return {
    path: a.path,
    title: a.title,
    description: a.description,
    body,
    jsonLd: [faqJsonLd(a.faq), breadcrumbJsonLd(trail)],
  };
}

/* ------------------------------------------------------------------ privacy */

const PRIVACY_FAQ = [
  {
    q: "Werden meine Kontoauszüge gespeichert?",
    a: `<p>Nicht bei uns — wir haben keinen Server, der sie annehmen könnte. Im Browser wird
      der zuletzt erzeugte Bericht lokal zwischengespeichert (IndexedDB), damit ein Neuladen
      die Arbeit nicht verwirft. „Zurücksetzen“ im Werkzeug löscht ihn sofort, ebenso das
      Leeren der Browserdaten.</p>`,
  },
  {
    q: "Was genau misst die Statistik?",
    a: `<p>Nur, dass ein Schritt stattgefunden hat, und grobe Größenordnungen — etwa
      „Bericht erzeugt, 11–50 Positionen“. Die möglichen Ereignisnamen und Eigenschaften sind
      im Code fest verdrahtet; Dokumentinhalte, Dateinamen, Anbieternamen aus deinen
      Dokumenten, Beträge und Kontodaten können technisch nicht übertragen werden.</p>`,
  },
  {
    q: "Setzt ihr Cookies?",
    a: `<p>Nein. Es gibt keine Cookies und kein Tracking über Websites hinweg, deshalb auch
      kein Cookie-Banner.</p>`,
  },
];

function privacy() {
  const trail = [
    { label: "Start", path: "/" },
    { label: "Datenschutz", path: "/datenschutz/" },
  ];

  const body = `    ${breadcrumb(trail)}

    <article class="prose">
      <p class="eyebrow">Datenschutz</p>
      <h1>Was mit deinen Daten passiert — und was nicht</h1>
      <p class="lede">Die kurze Fassung: Deine Kontoauszüge und Rechnungen werden in deinem
        Browser gelesen und verlassen deinen Rechner nicht. Es gibt keinen Server, der sie
        entgegennehmen könnte. Alles Weitere steht darunter im Detail.</p>

      <div class="privacy-grid">
        <div class="privacy-card privacy-card-good">
          <strong>Bleibt bei dir</strong>
          <ul>
            <li>Kontoauszüge und Kreditkartenabrechnungen</li>
            <li>Rechnungen und alle anderen PDFs</li>
            <li>IBAN, Beträge, Empfänger, Verwendungszwecke</li>
            <li>Dateinamen und Ordnerstrukturen</li>
            <li>der erzeugte Bericht</li>
          </ul>
        </div>
        <div class="privacy-card">
          <strong>Verlässt deinen Rechner</strong>
          <ul>
            <li>der Abruf der Seite selbst (Server-Logs beim Hoster)</li>
            <li>anonyme Nutzungsereignisse ohne Inhalte</li>
            <li>nur wenn du klickst: der Aufruf einer Anbieter-Rechnungsseite</li>
          </ul>
        </div>
      </div>

      <h2>Verantwortlicher</h2>
      <p>Verantwortlich im Sinne der DSGVO ist Needle, der Herausgeber dieses Werkzeugs.
        Die vollständigen Anbieterangaben stehen im
        <a href="${SITE.vendorImprint}" target="_blank" rel="noopener noreferrer">Impressum auf needle.tools</a>.
        Fragen zum Datenschutz gehen an
        <a href="mailto:${SITE.contactMail}">${SITE.contactMail}</a>.</p>

      <h2>Deine Dokumente</h2>
      <p>Zu Belegabgleich gehört kein Server, der deine Dateien entgegennimmt. Auszüge und
        Rechnungen werden von deinem Browser direkt von der Festplatte gelesen (technisch:
        über die File System Access API) und nur im Arbeitsspeicher deines Geräts
        verarbeitet. Eine Übermittlung an uns oder an Dritte findet nicht statt — weder
        vollständig noch in Ausschnitten, weder zur Verarbeitung noch zum Training von
        KI-Modellen.</p>
      <p>Damit ein versehentliches Neuladen nicht die Arbeit vernichtet, legt das Werkzeug
        den zuletzt erzeugten Bericht lokal in der IndexedDB deines Browsers ab. Diese Daten
        bleiben auf deinem Gerät. Du löschst sie mit „Zurücksetzen“ im Werkzeug oder über
        die Browsereinstellungen.</p>

      <h2>Künstliche Intelligenz</h2>
      <p>Der reguläre Abgleich ist vollständig deterministisch und kommt ohne KI aus. Für
        schwer erkennbare Rechnungen kannst du optional ein lokales Ollama-Modell aktivieren;
        es läuft auf deinem eigenen Rechner. Eine Cloud-KI wird nicht verwendet — auch nicht
        optional.</p>

      <h2>Reichweitenmessung</h2>
      <p>Auf der Live-Seite läuft eine anonyme, cookielose Statistik über
        <a href="https://rybbit.com" target="_blank" rel="noopener noreferrer">Rybbit</a>,
        betrieben auf unserer eigenen Infrastruktur (analytics-2.needle.tools). Es werden
        keine Cookies gesetzt, keine geräteübergreifenden Profile gebildet und keine Daten
        an Dritte weitergegeben. Erfasst werden Seitenaufrufe sowie eine feste, im Quellcode
        festgelegte Liste von Ereignissen mit groben Größenklassen — niemals Inhalte deiner
        Dokumente.</p>
      <p>Rechtsgrundlage ist unser berechtigtes Interesse an einer datensparsamen
        Reichweitenmessung (Art. 6 Abs. 1 lit. f DSGVO). Du kannst der Messung widersprechen,
        indem du die „Do Not Track“-Einstellung deines Browsers aktivierst oder einen
        Inhaltsblocker verwendest; die Funktion des Werkzeugs bleibt davon unberührt.</p>

      <h2>Hosting und Server-Logs</h2>
      <p>Die Seite wird als statische Anwendung ausgeliefert. Beim Abruf fallen wie bei jedem
        Webserver technisch notwendige Verbindungsdaten an (IP-Adresse, Zeitpunkt, angefragte
        Ressource, User-Agent). Sie dienen dem sicheren Betrieb und werden nicht mit anderen
        Daten zusammengeführt.</p>

      <h2>Externe Links</h2>
      <p>Für fehlende Belege verlinkt das Werkzeug direkt auf die Rechnungsseiten der
        jeweiligen Anbieter. Diese Links werden nur aufgerufen, wenn du sie anklickst; danach
        gelten die Datenschutzbestimmungen des jeweiligen Anbieters.</p>

      <h2>Deine Rechte</h2>
      <p>Dir stehen die Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung der
        Verarbeitung, Datenübertragbarkeit und Widerspruch zu (Art. 15–21 DSGVO) sowie ein
        Beschwerderecht bei einer Aufsichtsbehörde. In der Praxis liegen uns über dich
        allerdings keine personenbezogenen Daten vor, aus denen sich ein Bezug zu dir
        herstellen ließe — die Statistik ist anonym und deine Dokumente erreichen uns nie.</p>

      <h2>Nachprüfbar statt versprochen</h2>
      <p>Der gesamte Quellcode steht unter MIT-Lizenz
        <a href="${SITE.github}" target="_blank" rel="noopener noreferrer">auf GitHub</a>.
        Die Analytics-Schicht liegt in <code>packages/analytics</code> und erlaubt an der
        API-Grenze nur eine feste Aufzählung von Ereignisnamen und eine Whitelist
        unkritischer Eigenschaften — das ist im Code erzwungen, nicht bloß Richtlinie.</p>
    </article>

    ${faqSection(PRIVACY_FAQ, { title: "Häufige Fragen zum Datenschutz" })}

    ${ctaBand({
      title: "Überzeug dich selbst",
      text: "Trenn die Internetverbindung und gleich trotzdem ab — das Werkzeug funktioniert weiter.",
    })}`;

  return {
    path: "/datenschutz/",
    title: "Datenschutz — Belegabgleich",
    description:
      "Datenschutzerklärung von Belegabgleich: Kontoauszüge und Rechnungen werden ausschließlich lokal im Browser verarbeitet, kein Upload, kein Backend, keine Cookies, anonyme selbst gehostete Statistik.",
    body,
    jsonLd: [faqJsonLd(PRIVACY_FAQ), breadcrumbJsonLd(trail)],
  };
}

/* --------------------------------------------------------------- liability */

/**
 * Warranty and liability disclaimer.
 *
 * The tool guesses: it matches statement lines against invoices heuristically
 * and will sometimes miss one or pair the wrong two. Saying so plainly is both
 * honest and the point of this page. Note that German law does not permit a
 * blanket exclusion of liability, hence the carve-outs for intent, gross
 * negligence, essential contractual duties, personal injury and the
 * Produkthaftungsgesetz.
 */
function liability() {
  const trail = [
    { label: "Start", path: "/" },
    { label: "Haftungsausschluss", path: "/haftungsausschluss/" },
  ];

  const body = `    ${breadcrumb(trail)}

    <article class="prose">
      <p class="eyebrow">Haftungsausschluss</p>
      <h1>Was wir zusagen — und was ausdrücklich nicht</h1>
      <p class="lede">Belegabgleich ist ein kostenloses Hilfsmittel, kein Prüfsiegel. Es nimmt
        dir das Suchen ab, nicht die Verantwortung für deine Buchführung.</p>

      <h2>Keine Gewähr für das Ergebnis des Abgleichs</h2>
      <p>Die Zuordnung zwischen Buchungen und Belegen erfolgt automatisch anhand von Datum,
        Betrag und erkanntem Anbieter. Dieses Verfahren arbeitet mit Wahrscheinlichkeiten und
        kann fehlerhaft sein: Es kann Belege übersehen, sie der falschen Buchung zuordnen,
        Buchungen falsch als „kein Beleg nötig“ einstufen oder Positionen eines Auszugs gar
        nicht erst erkennen — etwa bei ungewöhnlichen PDF-Formaten, Scans ohne Text,
        Fremdwährungen, Teilzahlungen, Sammelrechnungen oder Gutschriften.</p>
      <p><strong>Ein leerer Fehlend-Bericht ist deshalb kein Nachweis dafür, dass deine
        Buchführung vollständig ist.</strong> Das Ergebnis ist ein Vorschlag, den du prüfen
        musst. Die Verantwortung für Vollständigkeit und Richtigkeit deiner Aufzeichnungen
        bleibt bei dir beziehungsweise bei deiner steuerlichen Beratung.</p>

      <h2>Keine Steuer-, Rechts- oder Unternehmensberatung</h2>
      <p>Sämtliche Inhalte dieser Website, insbesondere die Beiträge unter
        <a href="/wissen/">Wissen</a>, sind allgemeine, unverbindliche Informationen. Sie
        stellen keine Steuer- oder Rechtsberatung dar, berücksichtigen deinen Einzelfall nicht
        und begründen kein Mandatsverhältnis. Angaben zu Fristen, Betragsgrenzen und
        Anforderungen können sich ändern oder auf deinen Fall nicht zutreffen. Eine Gewähr für
        Richtigkeit, Vollständigkeit und Aktualität wird nicht übernommen.</p>

      <h2>Bereitstellung „wie besehen“</h2>
      <p>Die Software wird unentgeltlich und ohne jede Gewährleistung zur Verfügung gestellt
        („as is“), wie in der
        <a href="${SITE.github}/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT-Lizenz</a>
        geregelt. Insbesondere wird keine Gewähr für Verfügbarkeit, Fehlerfreiheit oder
        Eignung für einen bestimmten Zweck übernommen. Ein Anspruch auf Betrieb,
        Weiterentwicklung oder Fortbestand des Angebots besteht nicht.</p>
      <p>Sichere deine Belege vor dem Umbenennen. Die Umbenennungsfunktion ändert Dateinamen
        in einem von dir freigegebenen Ordner; auch wenn jede Änderung vorher angezeigt und
        von dir bestätigt wird, ersetzt das keine eigene Datensicherung.</p>

      <h2>Haftung</h2>
      <p>Wir haften unbeschränkt für Schäden aus der Verletzung des Lebens, des Körpers oder
        der Gesundheit, bei Vorsatz und grober Fahrlässigkeit, bei arglistigem Verschweigen
        von Mängeln sowie nach dem Produkthaftungsgesetz.</p>
      <p>Bei einfacher Fahrlässigkeit haften wir nur bei Verletzung einer wesentlichen
        Pflicht, deren Erfüllung die ordnungsgemäße Nutzung des Angebots überhaupt erst
        ermöglicht und auf deren Einhaltung du regelmäßig vertrauen darfst, und begrenzt auf
        den bei Bereitstellung typischerweise vorhersehbaren Schaden. Im Übrigen ist die
        Haftung ausgeschlossen — insbesondere für entgangenen Gewinn, Datenverlust,
        Steuernachforderungen, Zinsen, Säumniszuschläge oder Bußgelder, die auf ein
        unvollständiges oder unrichtiges Abgleichergebnis zurückgehen.</p>

      <h2>Externe Links</h2>
      <p>Für fehlende Belege verweisen wir auf die Rechnungsseiten der jeweiligen Anbieter.
        Auf deren Inhalte haben wir keinen Einfluss; für sie ist ausschließlich der jeweilige
        Anbieter verantwortlich. Zum Zeitpunkt der Aufnahme waren keine Rechtsverstöße
        erkennbar. Wird uns eine Rechtsverletzung bekannt, entfernen wir den Link umgehend.</p>

      <h2>Anbieterliste</h2>
      <p>Die Liste unterstützter Dienste wird von der Community gepflegt. Genannte Marken- und
        Produktnamen sind Eigentum der jeweiligen Inhaber und dienen ausschließlich der
        Identifikation. Eine geschäftliche Verbindung oder Empfehlung ist damit nicht
        verbunden.</p>

      <h2>Anbieter</h2>
      <p>Verantwortlich für dieses Angebot ist Needle. Die vollständigen Anbieterangaben
        stehen im <a href="${SITE.vendorImprint}" target="_blank" rel="noopener noreferrer">Impressum
        auf needle.tools</a>. Wie mit Daten umgegangen wird, steht in der
        <a href="/datenschutz/">Datenschutzerklärung</a>.</p>
    </article>

    ${ctaBand({
      title: "Trotzdem: die Lücken findest du schneller",
      text: "Prüfen musst du selbst — aber du musst nicht mehr suchen.",
    })}`;

  return {
    path: "/haftungsausschluss/",
    title: "Haftungsausschluss — Belegabgleich",
    description:
      "Haftungsausschluss und Gewährleistung für Belegabgleich: Der automatische Abgleich kann Belege übersehen oder falsch zuordnen. Keine Steuer- oder Rechtsberatung, Bereitstellung ohne Gewähr.",
    body,
    jsonLd: [breadcrumbJsonLd(trail)],
  };
}

/* ------------------------------------------------------------------ exports */

export function buildStaticPages({ providers, articleIndex }) {
  return [
    landing({ providers, audiences: AUDIENCES }),
    ...AUDIENCES.map((a) => audiencePage(a, articleIndex)),
    privacy(),
    liability(),
  ];
}

export { DISCLAIMER };

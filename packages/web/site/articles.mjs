/**
 * The /wissen/ section: short explainers that answer one search question each,
 * are worth linking to, and always leave a door open into the tool.
 *
 * Deliberately kept at ~500 words. These are reference pages, not essays — a
 * person who lands here from a search wants the answer, then wants to get on
 * with their bookkeeping.
 */

import { SITE } from "./site.mjs";
import { esc, toolCta } from "./layout.mjs";
import {
  breadcrumb,
  breadcrumbJsonLd,
  relatedLinks,
  inlineCta,
  ctaBand,
  DISCLAIMER,
} from "./partials.mjs";

/** Last substantive review of the article text. Shown, and used in the sitemap. */
const REVIEWED = "2026-08-02";

export const ARTICLES = [
  {
    slug: "belegprinzip",
    linkTitle: "Das Belegprinzip",
    blurb: "Warum zu jeder Buchung ein Beleg gehört — und was passiert, wenn er fehlt.",
    title: "Keine Buchung ohne Beleg: das Belegprinzip in der Praxis",
    description:
      "Das Belegprinzip verlangt zu jeder Buchung einen Nachweis. Was das konkret heißt, welche Angaben ein Beleg braucht und was passiert, wenn einer fehlt.",
    h1: "Keine Buchung ohne Beleg",
    lede: `„Keine Buchung ohne Beleg“ ist der älteste Satz der Buchführung und der einzige,
      den man sich merken muss. Er klingt bürokratisch, hat aber einen sehr praktischen Kern.`,
    body: `
      <h2>Was der Grundsatz verlangt</h2>
      <p>Jede Zahl in deiner Buchführung muss auf ein Dokument zurückführbar sein, das
        unabhängig von dir entstanden ist. Nicht, weil dir jemand misstraut, sondern weil
        eine Zahl ohne Nachweis nichts beweist — weder gegenüber dem Finanzamt noch gegenüber
        dir selbst, wenn du zwei Jahre später wissen willst, wofür die 340&nbsp;€ im April
        eigentlich waren.</p>
      <p>Der Beleg ist dabei die Brücke zwischen zwei Welten: Auf der einen Seite steht dein
        Kontoauszug, der sagt, dass Geld geflossen ist. Auf der anderen Seite steht die
        Rechnung, die sagt, wofür. Erst beides zusammen ergibt eine belastbare Buchung.</p>

      <h2>Was auf einem brauchbaren Beleg steht</h2>
      <ul>
        <li>wer geliefert oder geleistet hat, und an wen</li>
        <li>was genau geliefert oder geleistet wurde</li>
        <li>wann das passiert ist</li>
        <li>welcher Betrag, aufgeteilt in Netto, Steuersatz und Steuerbetrag</li>
        <li>eine Rechnungsnummer und das Rechnungsdatum</li>
      </ul>
      <p>Bei Kleinbeträgen bis 250&nbsp;€ darf es weniger sein — Empfänger und
        Rechnungsnummer dürfen dort fehlen. Der Kassenbon vom Bürobedarf ist also in Ordnung,
        solange er lesbar bleibt. Thermopapier verblasst allerdings; ein Foto oder Scan davon
        gehört gleich mit in den Ordner.</p>

      ${inlineCta("Belegabgleich vergleicht deinen Auszug mit deinem Rechnungsordner und zeigt dir genau die Buchungen, denen noch ein Beleg fehlt.")}

      <h2>Was passiert, wenn ein Beleg fehlt</h2>
      <p>Nicht viel — solange es die Ausnahme bleibt. Eine einzelne Buchung ohne Nachweis
        führt in der Regel dazu, dass die Betriebsausgabe nicht anerkannt wird: Du versteuerst
        den Betrag also, als hättest du ihn nie ausgegeben. Beim Vorsteuerabzug ist es
        strenger, denn dafür braucht es zwingend eine ordnungsgemäße Rechnung.</p>
      <p>Unangenehm wird es erst, wenn Lücken zum Muster werden. Häufen sich unbelegte
        Buchungen, steht die Ordnungsmäßigkeit der gesamten Buchführung infrage — und dann
        darf geschätzt werden. Deshalb lohnt es sich, Lücken früh zu finden, solange man den
        Vorgang noch erinnert und die Rechnung beim Anbieter noch herunterladen kann.</p>

      <h2>Der praktische Trick</h2>
      <p>Prüfe die Vollständigkeit gegen den Kontoauszug, nicht gegen dein Gedächtnis. Der
        Auszug ist die einzige Liste, die garantiert alles enthält, was tatsächlich bezahlt
        wurde. Alles, was dort steht und wofür du keinen Beleg findest, ist deine Aufgabenliste
        — und die ist meist kürzer als befürchtet.</p>
      <p>Falls doch einmal ein Beleg endgültig verloren ist, ist noch nichts verloren:
        <a href="/wissen/beleg-verloren-eigenbeleg/">Ein Eigenbeleg kann einspringen</a>.</p>
      ${DISCLAIMER}`,
    related: ["fehlende-belege-finden", "beleg-verloren-eigenbeleg", "gobd-fuer-freelancer"],
  },

  {
    slug: "fehlende-belege-finden",
    linkTitle: "Fehlende Belege finden",
    blurb: "Drei Wege vom Abhaken auf Papier bis zum automatischen Abgleich — und was sie taugen.",
    title: "Fehlende Belege finden: drei Wege und was sie taugen",
    description:
      "Wie findest du heraus, zu welcher Buchung der Beleg fehlt? Ein Vergleich von manuellem Abhaken, Buchhaltungssoftware und automatischem Abgleich zwischen Kontoauszug und Rechnungsordner.",
    h1: "Wie du herausfindest, welcher Beleg fehlt",
    lede: `Es gibt genau eine verlässliche Quelle dafür, was du tatsächlich bezahlt hast:
      deinen Kontoauszug. Die Frage ist nur, wie du ihn gegen deine Belege hältst.`,
    body: `
      <h2>Weg 1: von Hand abhaken</h2>
      <p>Auszug ausdrucken, Ordner daneben, Zeile für Zeile durchgehen. Das funktioniert
        tadellos und kostet bei einem Jahr Kleinunternehmerbetrieb einen ganzen Abend. Der
        wunde Punkt ist nicht die Sorgfalt, sondern die Aufmerksamkeit: Ab Zeile 200 übersieht
        man Dinge, und wiederkehrende Abos aus demselben Monat verschwimmen ineinander.</p>
      <p><strong>Taugt für:</strong> wenige Buchungen, einmal im Jahr, wenn man ohnehin
        sortiert.</p>

      <h2>Weg 2: Buchhaltungssoftware mit Bankanbindung</h2>
      <p>Klassische Buchhaltungs-SaaS holt die Umsätze per Banking-Schnittstelle und markiert,
        was noch keinen Beleg hat. Das ist bequem und für laufende Buchhaltung sinnvoll. Zwei
        Dinge stören in der Praxis: Du gibst Bankzugang und sämtliche Finanzunterlagen an
        einen externen Anbieter, und du zahlst monatlich — auch in Monaten, in denen du das
        Programm nur für diese eine Frage öffnest.</p>
      <p><strong>Taugt für:</strong> laufende Buchhaltung mit vielen Belegen, wenn die
        Cloud-Frage geklärt ist.</p>

      <h2>Weg 3: Auszug gegen Ordner abgleichen</h2>
      <p>Der Mittelweg braucht keine Bankanbindung und kein Abo: Du nimmst den Auszug, den du
        ohnehin als PDF herunterladen kannst, und den Ordner, in dem deine Rechnungen schon
        liegen. Ein Abgleich ordnet beides über Datum, Betrag und Anbieter einander zu. Übrig
        bleiben die Buchungen ohne Gegenstück — genau die Liste, die du brauchst.</p>
      <p>Genau das macht Belegabgleich. Der Unterschied zu Weg 2: Es gibt kein Konto und
        keinen Server. Die PDFs werden im Browser gelesen und verlassen deinen Rechner nicht.</p>

      ${inlineCta("Auszug wählen, Rechnungsordner wählen, Lücken sehen. Dauert weniger als eine Minute.")}

      <h2>Worauf es beim Abgleich ankommt</h2>
      <ul>
        <li><strong>Kryptische Empfänger auflösen.</strong> Auf dem Auszug steht selten der
          Markenname. „PAYPAL .ADOBE SYSTE“ muss zu „Adobe“ werden, sonst findet kein
          Vergleich etwas.</li>
        <li><strong>Buchungen ohne Beleganspruch aussortieren.</strong> Gehalt, Lohnsteuer,
          Sozialabgaben und die Sammelbuchung der Kreditkarte brauchen keine Lieferantenrechnung.
          Landen sie in der Fehlend-Liste, ist die Liste wertlos.</li>
        <li><strong>Abos zusammenfassen.</strong> Zwölf identische Abbuchungen sind eine
          Aufgabe, nicht zwölf.</li>
        <li><strong>Toleranz bei Datum und Betrag.</strong> Zwischen Rechnungsdatum und
          Abbuchung liegen Tage; bei Fremdwährungen weicht der Betrag ab.</li>
      </ul>

      <h2>Und danach?</h2>
      <p>Für die gefundenen Lücken brauchst du die Rechnung des Anbieters. Bei den meisten
        Diensten liegt sie hinter einem festen Link im Konto — deshalb verlinkt Belegabgleich
        für über 130 Anbieter direkt die Rechnungsseite. Was sich partout nicht auftreiben
        lässt, kann im Zweifel
        <a href="/wissen/beleg-verloren-eigenbeleg/">durch einen Eigenbeleg ersetzt</a> werden.</p>
      ${DISCLAIMER}`,
    related: ["belegprinzip", "beleg-verloren-eigenbeleg", "belege-benennen-dateinamen"],
  },

  {
    slug: "beleg-verloren-eigenbeleg",
    linkTitle: "Beleg verloren?",
    blurb: "Wann ein Eigenbeleg einspringt, was darauf stehen muss und wo die Grenze liegt.",
    title: "Beleg verloren? Wann ein Eigenbeleg reicht",
    description:
      "Rechnung weg, Bon verblasst, Anbieter offline: Wann du eine Ausgabe mit einem Eigenbeleg nachweisen kannst, was darauf stehen muss und warum der Vorsteuerabzug trotzdem verloren geht.",
    h1: "Beleg verloren? Der Eigenbeleg springt ein",
    lede: `Ein Bon ist verblasst, eine Rechnung nie angekommen, ein Dienst abgeschaltet. Für
      solche Fälle gibt es den Eigenbeleg — mit klaren Grenzen.`,
    body: `
      <h2>Zuerst: die Rechnung noch einmal holen</h2>
      <p>Bevor du einen Eigenbeleg schreibst, lohnt der Blick ins Anbieterkonto. Bei fast
        allen digitalen Diensten liegt die Rechnungshistorie dauerhaft im Konto und lässt sich
        Jahre später noch herunterladen. Auch eine kurze Mail an den Lieferanten bringt in der
        Regel eine Zweitschrift. Der Eigenbeleg ist der letzte Ausweg, nicht die Abkürzung.</p>

      ${inlineCta("Belegabgleich zeigt dir bei jeder Lücke direkt den Link zur Rechnungsseite des Anbieters — für über 130 Dienste.")}

      <h2>Was auf einen Eigenbeleg gehört</h2>
      <ul>
        <li>Zahlungsempfänger mit vollständiger Anschrift</li>
        <li>Art der Ausgabe, konkret beschrieben</li>
        <li>Datum der Ausgabe</li>
        <li>Betrag — bei Bargeld möglichst mit Einzelpreisen</li>
        <li>Grund, warum kein Originalbeleg vorliegt</li>
        <li>Datum der Ausstellung und deine Unterschrift</li>
      </ul>
      <p>Je besser der Zusammenhang dokumentiert ist, desto belastbarer wird der Eigenbeleg.
        Der Kontoauszug mit der passenden Abbuchung ist dabei das stärkste Argument, das du
        hast: Er zeigt, dass tatsächlich Geld an diesen Empfänger geflossen ist. Häng ihn dem
        Eigenbeleg an.</p>

      <h2>Wo die Grenze liegt</h2>
      <p>Ein Eigenbeleg kann die Betriebsausgabe plausibel machen — den <strong>Vorsteuerabzug
        rettet er nicht</strong>. Dafür verlangt das Umsatzsteuerrecht eine ordnungsgemäße
        Rechnung des leistenden Unternehmers, und die kannst du dir nicht selbst ausstellen.
        Bei einer Rechnung über 1.000&nbsp;€ netto kostet ein verlorener Beleg dich also rund
        190&nbsp;€ Vorsteuer, selbst wenn die Ausgabe anerkannt wird.</p>
      <p>Ebenso gilt: Eigenbelege sind für Einzelfälle gedacht. Wer sie stapelweise
        produziert, stellt die eigene Buchführung infrage. Als Faustregel gilt — die Ausnahme
        darf man erklären, das Muster nicht.</p>

      <h2>Der beste Eigenbeleg ist der, den du nicht brauchst</h2>
      <p>Belege verschwinden fast immer aus demselben Grund: Sie fallen erst Monate später
        auf, wenn der Vorgang kalt ist und der Anbieter gewechselt hat. Ein Abgleich zwischen
        Kontoauszug und Belegordner alle paar Monate verhindert das zuverlässiger als jede
        Vorsatzerklärung im Januar.</p>
      ${DISCLAIMER}`,
    related: ["belegprinzip", "fehlende-belege-finden", "belege-aufbewahren-fristen"],
  },

  {
    slug: "belege-aufbewahren-fristen",
    linkTitle: "Aufbewahrungsfristen",
    blurb: "Acht Jahre, zehn Jahre, sechs Jahre — welche Frist für welches Dokument gilt.",
    title: "Wie lange musst du Belege aufbewahren?",
    description:
      "Aufbewahrungsfristen für Belege und Geschäftsunterlagen: acht Jahre für Buchungsbelege, zehn für Jahresabschlüsse, sechs für Geschäftsbriefe — und ab wann die Frist überhaupt läuft.",
    h1: "Wie lange Belege aufbewahrt werden müssen",
    lede: `Die Fristen sind kürzer geworden, aber nicht einheitlich. Entscheidend ist, um
      welche Art von Dokument es geht — und ab wann gezählt wird.`,
    body: `
      <h2>Die drei Fristen</h2>
      <ul>
        <li><strong>Acht Jahre — Buchungsbelege.</strong> Rechnungen, Quittungen,
          Kontoauszüge, Kassenbons: alles, was eine einzelne Buchung nachweist. Diese Frist
          wurde zum 1.&nbsp;Januar 2025 von zehn auf acht Jahre verkürzt.</li>
        <li><strong>Zehn Jahre — Bücher und Abschlüsse.</strong> Jahresabschlüsse,
          Inventare, Eröffnungsbilanzen, Lageberichte, Buchführungsunterlagen und die
          Verfahrensdokumentation.</li>
        <li><strong>Sechs Jahre — Handels- und Geschäftsbriefe.</strong> Angebote, Aufträge,
          Verträge, Geschäftskorrespondenz — also alles, was einen Geschäftsvorfall vorbereitet
          oder begleitet, ohne ihn selbst zu belegen.</li>
      </ul>

      <h2>Ab wann die Frist läuft</h2>
      <p>Nicht ab dem Datum auf dem Beleg, sondern ab dem <strong>Ende des Kalenderjahres</strong>,
        in dem der letzte Eintrag gemacht oder das Dokument entstanden ist. Eine Rechnung vom
        März 2026 wird also erst ab dem 31.&nbsp;Dezember 2026 gezählt und darf frühestens
        Anfang 2035 weg. Wer aufräumt, tut das deshalb sinnvollerweise im Januar.</p>
      <p>Und noch ein Vorbehalt: Solange eine Steuerfestsetzung nicht bestandskräftig ist oder
        eine Betriebsprüfung läuft, verlängert sich die Frist. Im Zweifel bleibt der Ordner
        stehen.</p>

      ${inlineCta("Wer Belege ordentlich benennt, findet auch nach acht Jahren noch, was gesucht wird.")}

      <h2>Digital reicht — im Originalformat</h2>
      <p>Elektronisch empfangene Belege müssen elektronisch aufbewahrt werden. Eine per Mail
        erhaltene PDF-Rechnung ausdrucken und das PDF löschen, ist ausdrücklich nicht
        ausreichend: Das Original ist die Datei. Umgekehrt dürfen Papierbelege eingescannt und
        danach vernichtet werden, sofern der Scan bildlich mit dem Original übereinstimmt und
        der Ablauf beschrieben ist.</p>
      <p>Über die ganze Frist hinweg müssen die Dokumente lesbar, vollständig, geordnet und
        maschinell auswertbar bleiben. Praktisch heißt das: ein PDF, kein proprietäres Format,
        ein Dateiname, den man in acht Jahren noch versteht, und mindestens eine Sicherung.</p>

      <h2>Was das für deinen Ordner heißt</h2>
      <p>Ein Ordner pro Jahr, darin PDFs mit
        <a href="/wissen/belege-benennen-dateinamen/">einem einheitlichen Dateinamen</a>, dazu
        die Kontoauszüge desselben Jahres. Damit erfüllst du die Anforderungen ohne
        Spezialsoftware — und findest im Zweifelsfall in einer Minute, wonach die Prüferin
        fragt.</p>
      ${DISCLAIMER}`,
    related: ["gobd-fuer-freelancer", "belege-benennen-dateinamen", "belegprinzip"],
  },

  {
    slug: "belege-benennen-dateinamen",
    linkTitle: "Belege benennen",
    blurb: "Ein Dateinamen-Schema, das sortiert, sucht und auch in fünf Jahren noch trägt.",
    title: "Belege benennen: ein Schema, das in fünf Jahren noch trägt",
    description:
      "Rechnungen sinnvoll benennen: Warum Datum zuerst kommt, welche drei Angaben reichen und wie du aus 'rechnung_final(2).pdf' einen Dateinamen machst, der sich sortieren und durchsuchen lässt.",
    h1: "Ein Dateiname, der auch in fünf Jahren noch etwas sagt",
    lede: `Der Ordner mit den Belegen ist nur so gut wie seine Dateinamen. Drei Angaben in
      fester Reihenfolge reichen — und lösen die meisten Probleme, bevor sie entstehen.`,
    body: `
      <h2>Das Schema</h2>
      <p class="filename-sample"><code>2026-03-14_Hetzner_12,90EUR.pdf</code></p>
      <p>Datum, Anbieter, Betrag. Mehr braucht es nicht, und weniger reicht nicht.</p>

      <h2>Warum das Datum zuerst kommt</h2>
      <p>Im Format <code>JJJJ-MM-TT</code> ist die alphabetische Sortierung identisch mit der
        chronologischen. Der Ordner sortiert sich damit von selbst richtig, in jedem
        Betriebssystem, in jedem Dateidialog, ohne Sortierspalte. <code>14.03.2026</code>
        dagegen landet zwischen dem 13. Januar und dem 15. Dezember — und ist im internationalen
        Kontext obendrein zweideutig.</p>
      <p>Nimm dabei das <strong>Rechnungsdatum</strong>, nicht das Datum der Abbuchung. Das
        Rechnungsdatum steht auf dem Dokument und ändert sich nie; die Abbuchung kann Tage
        später erfolgen und bei Rücklastschriften sogar mehrfach.</p>

      <h2>Warum der Anbieter in die Mitte gehört</h2>
      <p>Nach dem Anbieter suchst du, nicht nach dem Betrag. Schreib den Markennamen so, wie du
        ihn im Kopf hast — „Hetzner“, nicht „Hetzner Online GmbH“ und schon gar nicht die
        Zeichenkette vom Kontoauszug. Bleib dabei konsequent: Entweder immer „GitHub“ oder
        immer „Github“, sonst findet die Suche nur die Hälfte.</p>

      <h2>Warum der Betrag hilft</h2>
      <p>Der Betrag ist der schnellste Weg von einer Zeile im Kontoauszug zur richtigen Datei.
        Du siehst eine Abbuchung über 12,90&nbsp;€ und tippst „12,90“ ins Suchfeld — fertig.
        Genau diese Verknüpfung macht auch den automatischen Abgleich zuverlässig.</p>

      ${inlineCta("Belegabgleich kann deine Rechnungen auf genau dieses Schema umbenennen. Du siehst jede Umbenennung vorher und bestätigst selbst.")}

      <h2>Kleine Regeln, die viel Ärger sparen</h2>
      <ul>
        <li>Keine Leerzeichen — Unterstriche sind in Links und auf Servern unproblematisch.</li>
        <li>Keine Umlaute und keine Sonderzeichen außer <code>-</code> und <code>_</code>.</li>
        <li>Bei mehreren Rechnungen am selben Tag vom selben Anbieter eine Nummer anhängen.</li>
        <li>Gutschriften erkennbar machen, etwa mit <code>_GUTSCHRIFT</code> am Ende.</li>
        <li>Ein Ordner pro Jahr. Unterordner pro Monat schaden mehr, als sie nützen — die
          Sortierung erledigt das Datum schon.</li>
      </ul>

      <h2>Rückwirkend aufräumen</h2>
      <p>Der Gedanke, 300 Altdateien umzubenennen, hält die meisten davon ab. Das muss aber
        nicht von Hand passieren: Anbieter, Datum und Betrag stehen in der Rechnung, lassen
        sich auslesen und in das Schema übertragen. Wichtig ist nur, dass du die Vorschläge
        siehst, bevor etwas passiert — und dass nichts überschrieben wird.</p>
      ${DISCLAIMER}`,
    related: ["belege-aufbewahren-fristen", "fehlende-belege-finden", "gobd-fuer-freelancer"],
  },

  {
    slug: "gobd-fuer-freelancer",
    linkTitle: "GoBD für Freelancer",
    blurb: "Fünf Anforderungen, die für kleine Betriebe tatsächlich relevant sind.",
    title: "GoBD für Freelancer: die Punkte, die wirklich zählen",
    description:
      "Die GoBD in verständlich: Was Nachvollziehbarkeit, Vollständigkeit, Unveränderbarkeit und zeitgerechte Erfassung für Freelancer und kleine Betriebe konkret bedeuten.",
    h1: "GoBD, ohne 40 Seiten zu lesen",
    lede: `Die GoBD regeln, wie Bücher und Belege elektronisch geführt und aufbewahrt werden.
      Für einen Ein-Personen-Betrieb lässt sich das auf fünf Anforderungen eindampfen.`,
    body: `
      <h2>1. Nachvollziehbarkeit</h2>
      <p>Eine sachverständige dritte Person muss deine Buchführung in angemessener Zeit
        verstehen können — ohne dich zu fragen. Konkret: Von jeder Buchung muss man zum Beleg
        kommen und von jedem Beleg zur Buchung. Ein durchdachter Dateiname und ein Ordner pro
        Jahr leisten hier mehr als jedes Werkzeug.</p>

      <h2>2. Vollständigkeit</h2>
      <p>Kein Geschäftsvorfall darf fehlen — auch nicht der unangenehme. Der Kontoauszug ist
        dabei dein bester Prüfstein, weil er lückenlos ist. Was dort steht und in deinen
        Unterlagen fehlt, ist der Punkt, an dem die Vollständigkeit kippt.</p>

      ${inlineCta("Genau diese Lückenprüfung macht Belegabgleich: Auszug gegen Belegordner, in Sekunden statt in Stunden.")}

      <h2>3. Zeitgerechte Erfassung</h2>
      <p>Belege sollen zeitnah erfasst und gegen Verlust gesichert werden — bare Vorgänge
        täglich, unbare zeitnah, in der Praxis meist im Rahmen der Umsatzsteuervoranmeldung.
        Der eigentliche Sinn der Regel ist banal: Was heute erfasst wird, ist noch da. Was im
        Dezember erfasst wird, ist zur Hälfte weg.</p>

      <h2>4. Unveränderbarkeit</h2>
      <p>Eine einmal erfasste Buchung darf nicht spurlos geändert werden. Für den
        Belegordner heißt das vor allem: nicht überschreiben. Wird eine Rechnung korrigiert,
        kommt die Korrektur als zusätzliche Datei dazu, das Original bleibt. Deshalb ist auch
        beim Umbenennen wichtig, dass keine Datei stillschweigend ersetzt wird.</p>

      <h2>5. Aufbewahrung im Originalformat</h2>
      <p>Eine per Mail empfangene PDF-Rechnung ist im Original eine Datei — und muss als
        Datei aufbewahrt werden. Ausdrucken und Löschen genügt nicht. Umgekehrt dürfen
        Papierbelege ersetzend gescannt werden, wenn der Ablauf beschrieben ist. Mehr dazu
        unter <a href="/wissen/belege-aufbewahren-fristen/">Aufbewahrungsfristen</a>.</p>

      <h2>Und die Verfahrensdokumentation?</h2>
      <p>Sie beschreibt, wie Belege bei dir entstehen, abgelegt und gesichert werden. Für
        einen Ein-Personen-Betrieb ist das kein Aktenordner, sondern eine Seite Text: woher die
        Belege kommen, wie sie benannt werden, wo sie liegen, wie gesichert wird, wer Zugriff
        hat. Wer das einmal aufschreibt, hat den unangenehmsten Teil einer Prüfung schon
        hinter sich — und merkt beim Schreiben meistens selbst, wo die Lücken sind.</p>
      ${DISCLAIMER}`,
    related: ["belege-aufbewahren-fristen", "belegprinzip", "belege-benennen-dateinamen"],
  },
].map((a) => ({ ...a, path: `/wissen/${a.slug}/`, updated: REVIEWED }));

/** slug → article, for cross-linking from the audience pages. */
export const ARTICLE_INDEX = new Map(ARTICLES.map((a) => [a.slug, a]));

function articlePage(a, nr) {
  const trail = [
    { label: "Start", path: "/" },
    { label: "Wissen", path: "/wissen/" },
    { label: a.linkTitle, path: a.path },
  ];
  const related = a.related
    .map((slug) => ARTICLE_INDEX.get(slug))
    .filter(Boolean)
    .map((r) => ({ path: r.path, title: r.linkTitle, blurb: r.blurb }));

  const dated = new Date(a.updated).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // The article is printed on a Beleg: torn paper edges, a monospaced header
  // like a till slip, and the standing disclaimer as literal fine print at the
  // bottom. The subject's own artifact, used as the page's form.
  const body = `    ${breadcrumb(trail)}

    <div class="beleg">
      <article class="beleg-sheet prose">
        <header class="beleg-head">
          <p class="beleg-merchant">Belegabgleich.de</p>
          <p class="beleg-docline">Wissen · Nr. ${String(nr).padStart(3, "0")}</p>
        </header>

        <h1>${esc(a.h1)}</h1>
        <p class="lede">${a.lede}</p>

        <p class="beleg-line">
          <span>Zuletzt geprüft</span>
          <span class="beleg-dots" aria-hidden="true"></span>
          <time datetime="${a.updated}">${dated}</time>
        </p>

        ${a.body}
      </article>
    </div>

    ${relatedLinks(related)}

    ${ctaBand()}`;

  return {
    path: a.path,
    title: `${a.title} — Belegabgleich`,
    description: a.description,
    ogType: "article",
    body,
    jsonLd: [
      breadcrumbJsonLd(trail),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: a.title,
        description: a.description,
        inLanguage: "de-DE",
        dateModified: a.updated,
        mainEntityOfPage: SITE.origin + a.path,
        author: { "@type": "Organization", name: SITE.vendor, url: SITE.vendorUrl },
        publisher: { "@type": "Organization", name: SITE.vendor, url: SITE.vendorUrl },
      },
    ],
  };
}

function wissenIndex() {
  const trail = [
    { label: "Start", path: "/" },
    { label: "Wissen", path: "/wissen/" },
  ];

  const body = `    ${breadcrumb(trail)}

    <section class="page-hero page-hero-narrow">
      <div class="page-hero-copy">
        <p class="eyebrow">Wissen</p>
        <h1>Belege, Fristen und Ordnung — kurz erklärt</h1>
        <p class="lede">Was beim Sammeln und Aufbewahren von Belegen tatsächlich zählt, in
          kurzen Texten. Ohne Paragrafenwüste, aber mit den Zahlen, auf die es ankommt.</p>
        <div class="cta-row">${toolCta()}</div>
      </div>
    </section>

    <section class="section">
      <ul class="article-list">
        ${ARTICLES.map(
          (a, i) => `<li>
          <a href="${esc(a.path)}">
            <span class="article-nr">Nr. ${String(i + 1).padStart(3, "0")}</span>
            <h2>${esc(a.linkTitle)}</h2>
            <p>${esc(a.blurb)}</p>
            <span class="card-more">Lesen →</span>
          </a>
        </li>`,
        ).join("\n        ")}
      </ul>
      <p class="section-note">Alle Texte erklären die Praxis, wie wir sie verstehen, und
        ersetzen keine Steuerberatung.</p>
    </section>

    ${ctaBand()}`;

  return {
    path: "/wissen/",
    title: "Wissen: Belege, Fristen und Ordnung — Belegabgleich",
    description:
      "Kurze Erklärtexte rund um Belege: das Belegprinzip, fehlende Belege finden, Eigenbeleg, Aufbewahrungsfristen, Dateinamen und die GoBD für kleine Betriebe.",
    body,
    jsonLd: [
      breadcrumbJsonLd(trail),
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: ARTICLES.map((a, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: a.title,
          url: SITE.origin + a.path,
        })),
      },
    ],
  };
}

export function buildArticlePages() {
  return [wissenIndex(), ...ARTICLES.map((a, i) => articlePage(a, i + 1))];
}

# Belegabgleich

> **Keine Buchung ohne Beleg.**

*Deutsch · [English below ↓](#belegabgleich--english)*

Belegabgleich gleicht deinen Kontoauszug gegen deine Rechnungen ab — so siehst du
auf einen Blick, **welcher Buchung noch ein Beleg fehlt** — und schließt die Lücke
in Minuten. Kostenlos, Open Source und **100 % lokal**: nichts verlässt je deinen
Browser.

Gemacht für Freelancer, Kleinunternehmer, kleine GmbHs und Vereins-Schatzmeister,
die ihre Vorbuchhaltung selbst machen und ihre Finanzunterlagen nicht in eine
Cloud-SaaS hochladen wollen.

## Was es macht

Du gibst ihm zwei Dinge:

1. deinen Sparkassen-**Kontoauszug** oder deine **Kreditkartenabrechnung** (PDF) und
2. einen Ordner mit **Rechnungen / Belegen** (PDFs).

Dann:

- **Findet** es jede Buchung auf dem Auszug, zu der noch **kein passender Beleg**
  vorliegt.
- **Ordnet** es jede erkannte Rechnung automatisch der richtigen Buchung zu.
- **Benennt** es deine Belege in ein einheitliches, sauberes Schema um
  (z. B. `2026-03-14_Hetzner_12,90EUR.pdf`).
- **Verlinkt** für die Lücken direkt die Rechnungsseite des Anbieters, damit du
  den fehlenden Beleg mit einem Klick holst — und exportiert den ganzen Bericht
  als **CSV**.

Für jede Buchung, die es nicht zuordnen kann, nennt es dir den Anbieter und wo du
die Rechnung herunterlädst — du behältst die Kontrolle, es übernimmt nur das
mühsame Abgleichen.

## Datenschutz — durch Architektur, nicht durch Versprechen

- **Nichts wird hochgeladen. Es gibt kein Backend.** Auszüge und Rechnungen werden
  über die File System Access API im Browser gelesen und verlassen deinen Rechner
  nie.
- **Keine Cloud-KI — niemals.** Abgleich und Rechnungs-Extraktion sind
  standardmäßig vollständig deterministisch und brauchen gar keine KI. Für
  knifflige, unbekannte Anbieter kannst du *optional* ein **lokales Ollama-Modell**
  aktivieren — es läuft auf deinem eigenen Rechner, also wird auch dann nichts in
  eine Cloud gesendet.
- **Anonyme, cookielose, selbst gehostete Statistik.** Nutzungsdaten laufen über
  unsere eigene Rybbit-Instanz (kein Drittanbieter, keine Cookies) und nur auf der
  Live-Seite. Sie können *niemals* Dokumentinhalte, Anbieternamen, Beträge oder
  Kontodaten enthalten — im Code erzwungen (`packages/analytics`), nicht nur per
  Richtlinie.
- **Lies den Quellcode.** Die Abgleich-Logik sind ~700 Zeilen puren, getesteten
  Codes.

## Einen Anbieter beitragen (der einfache Weg)

Die Anbieterliste liegt in einer einzigen, von der Community pflegbaren Datei:
[`providers.json`](./providers.json). Ein neuer Eintrag sorgt dafür, dass
Belegabgleich den Anbieter auf dem Auszug erkennt und dich direkt zu seiner
Rechnungsseite führt. **Kein Code nötig** — einfach JSON bearbeiten und einen PR
öffnen.

Ein Eintrag sieht so aus:

```json
{
  "name": "Hetzner",
  "aliases": ["hetzner"],
  "invoiceUrl": "https://accounts.hetzner.com/invoice"
}
```

- **`name`** — der saubere Markenname, der in der UI angezeigt wird.
- **`aliases`** — kleingeschriebene Teilstrings, die gegen den (oft kryptischen)
  Händlertext auf dem Auszug gematcht werden, z. B. `"CLOUDFLARE.COUS"` →
  `cloudflare`. Beliebig viele; `*` als Platzhalter (`"google*ads"`).
- **`invoiceUrl`** — die **generische** Rechnungs-/Beleg-Seite des Anbieters. Leer
  (`""`), wenn es keine stabile öffentliche URL gibt.

> ⚠️ Niemals kontospezifische URLs oder IDs committen — nur die generische
> Rechnungsseite.

Eine neue **Bank**? Implementiere das `BankParser`-Interface in `packages/parsers`
(siehe `sparkasse.ts`) und registriere es. Die Engine sieht nur ein normalisiertes
`Charge[]` und bleibt damit komplett bank-agnostisch.

## Entwicklung

```bash
bun install
bun test           # Engine- + Parser-Tests
bun run dev        # Web-App starten (packages/web)
```

Statistik: auf der Live-Seite gehen anonyme, cookielose Nutzungsdaten an unser
selbst gehostetes Rybbit. Überall sonst — localhost, Previews, Forks — ist die
Statistik **aus**. Für eigene Deployments mit `VITE_RYBBIT_SITE_ID` /
`VITE_RYBBIT_HOST` überschreiben.

## Projektstruktur

```
packages/
  core/       @kah/core      reine, isomorphe Engine: canon, Extraktion, Abgleich
  parsers/    @kah/parsers   pluggable Bank-Parser (vorerst nur Sparkasse)
  analytics/  @kah/analytics datenschutzfreundliches Rybbit-Tracking (keine sensiblen Daten)
  web/        @kah/web       Svelte-App: Parsing im Browser, Abgleich, Umbenennen, CSV-Export
providers.json               community-pflegbare Anbieter-Aliase + Rechnungs-Links
```

## Lizenz

[MIT](./LICENSE)

---

# Belegabgleich — English

> **No booking without a receipt.**

Belegabgleich matches your bank statement against your invoices, so you can see
at a glance **which booking is still missing a Beleg** (receipt) — and fix it in
minutes. Free, open source, and **100 % local**: nothing ever leaves your browser.

Built for German freelancers, Kleinunternehmer, small GmbHs and Vereins-
Schatzmeister who do their own pre-accounting and don't want to upload financial
documents to a cloud SaaS.

## What it does

You give it two things:

1. your Sparkasse **Kontoauszug** (account statement) or **Kreditkartenabrechnung**
   (credit-card statement) as PDF, and
2. a folder of **Rechnungen / Belege** (invoices/receipts) as PDFs.

It then:

- **Finds** every booking on the statement that has **no matching Beleg** yet.
- **Assigns** each invoice it recognizes to the right booking automatically.
- **Renames** your Belege into one clean, consistent scheme
  (e.g. `2026-03-14_Hetzner_12,90EUR.pdf`).
- **Links out** to the vendor's billing page for the gaps, so you can grab the
  missing invoice in one click — and exports the whole report as **CSV**.

For each booking it can't place, it tells you the vendor and where to download
the invoice — you stay in control, it just does the tedious matching.

## Privacy first — by architecture, not by promise

- **Nothing is uploaded. There is no backend.** Statements and invoices are read
  in your browser via the File System Access API and never leave your machine.
- **No cloud AI — ever.** Matching and invoice extraction are fully deterministic
  by default and need no AI at all. For tricky, unknown vendors you can
  *optionally* enable a **local Ollama model** — it runs on your own machine, so
  even then nothing is sent to any cloud.
- **Anonymous, cookieless, self-hosted analytics.** Usage stats run through our
  own Rybbit instance (no third party, no cookies) and only on the live site.
  They can *never* carry document content, vendor names, amounts or account data —
  enforced in code (`packages/analytics`), not just policy.
- **Read the source.** The matching engine is ~700 lines of pure, tested code.

## Contributing a vendor (the easy way)

The vendor list lives in one community-editable file:
[`providers.json`](./providers.json). Adding a vendor means Belegabgleich can
recognize it on a statement and point you straight to its invoice page. **No
coding required** — just edit JSON and open a PR.

Each entry looks like this:

```json
{
  "name": "Hetzner",
  "aliases": ["hetzner"],
  "invoiceUrl": "https://accounts.hetzner.com/invoice"
}
```

- **`name`** — the clean brand name shown in the UI.
- **`aliases`** — lowercase substrings matched against the (often noisy)
  merchant text on the statement, e.g. `"CLOUDFLARE.COUS"` → `cloudflare`.
  Add as many as needed; use `*` as a wildcard (`"google*ads"`).
- **`invoiceUrl`** — the vendor's **generic** billing/receipts page. Leave it as
  `""` if there's no stable public URL.

> ⚠️ Never commit account-specific URLs or IDs — only the generic billing page.

Adding a **new bank?** Implement the `BankParser` interface in `packages/parsers`
(see `sparkasse.ts`) and register it. The engine only ever sees a normalized
`Charge[]`, so it stays completely bank-agnostic.

## Develop

```bash
bun install
bun test           # run the engine + parser tests
bun run dev        # start the web app (packages/web)
```

Analytics: on the live site, anonymous cookieless stats go to our self-hosted
Rybbit. Everywhere else — localhost, previews, forks — analytics is **off**.
Override with `VITE_RYBBIT_SITE_ID` / `VITE_RYBBIT_HOST` for your own deployment.

## Repo structure

```
packages/
  core/       @kah/core      pure, isomorphic engine: canon, extraction, matching
  parsers/    @kah/parsers   pluggable bank parsers (Sparkasse only, for now)
  analytics/  @kah/analytics privacy-first Rybbit usage tracking (no sensitive data)
  web/        @kah/web       Svelte app: in-browser parsing, matching, rename, CSV export
providers.json               community-editable vendor aliases + invoice-download links
```

## License

[MIT](./LICENSE)

/**
 * The demo is a REAL, interactive session backed by the bundled PDFs in
 * /public/demo (statements + a few invoices). On first view the app fetches and
 * runs them so "Beleg zuordnen" actually matches.
 *
 * MOCK_ENTRIES below is only an instant placeholder shown for the brief moment
 * before that run finishes — it mirrors the real demo output so nothing visibly
 * jumps when the live demo result swaps in.
 */
import type { ReportEntry } from "./report";

export const MOCK_PERIOD = "Oktober 2025";
export const MOCK_STATEMENT = "Kontoauszug · VISA-Abrechnung";

/** Bundled demo PDFs, fetched + parsed to make the demo interactive. */
export const DEMO_SOURCE_PATHS = [
  "/demo/Kontoauszug-Demo.pdf",
  "/demo/Kreditkartenabrechnung-Demo.pdf",
  "/demo/invoices/GitHub-2025-09-18.pdf",
  "/demo/invoices/Hetzner-2025-09-19.pdf",
  "/demo/invoices/Cloudflare-2025-09-21.pdf",
  "/demo/invoices/Anthropic-2025-09-21.pdf",
  "/demo/invoices/Backblaze-2025-09-25.pdf",
  "/demo/invoices/GoogleCloud-2025-10-01.pdf",
  "/demo/invoices/Stadtwerke-2025-10-10.pdf",
];

export const MOCK_ENTRIES: ReportEntry[] = [
  { provider: "GitHub", date: "2025-09-18", amount: 21, currency: "USD", status: "matched", invoice: "invoices/GitHub-2025-09-18.pdf", merchant: "GITHUB, INC. GITHUB.COM US" },
  { provider: "Hetzner", date: "2025-09-19", amount: 188.01, currency: "EUR", status: "matched", invoice: "invoices/Hetzner-2025-09-19.pdf", merchant: "HETZNER ONLINE GMBH hetzner.com" },
  { provider: "Cloudflare", date: "2025-09-21", amount: 25, currency: "USD", status: "matched", invoice: "invoices/Cloudflare-2025-09-21.pdf", merchant: "CLOUDFLARE CLOUDFLARE.COUS" },
  { provider: "Anthropic", date: "2025-09-21", amount: 100, currency: "EUR", status: "matched", invoice: "invoices/Anthropic-2025-09-21.pdf", merchant: "CLAUDE.AI SUBSCRIPTION ANTHROPIC.COMUS" },
  { provider: "Backblaze", date: "2025-09-26", amount: 41.2, currency: "USD", status: "matched", invoice: "invoices/Backblaze-2025-09-25.pdf", merchant: "BACKBLAZE INC BACKBLAZE.COMUS" },
  { provider: "Google Cloud", date: "2025-10-01", amount: 142.8, currency: "EUR", status: "matched", invoice: "invoices/GoogleCloud-2025-10-01.pdf", merchant: "GOOGLE*CLOUD 3QVCTG CC GOOGLE.COMIE" },
  { provider: "Stadtwerke-Musterstadt", date: "2025-10-10", amount: 179, currency: "EUR", status: "matched", invoice: "invoices/Stadtwerke-2025-10-10.pdf", merchant: "Stadtwerke Musterstadt GmbH" },

  { provider: "OpenAI", date: "2025-10-08", amount: 120, currency: "USD", status: "missing", merchant: "OPENAI OPENAI.COM US" },
  { provider: "Cloudflare", date: "2025-10-17", amount: 80, currency: "USD", status: "missing", merchant: "CLOUDFLARE CLOUDFLARE.COUS" },
  { provider: "Muster-Hosting", date: "2025-10-06", amount: 149.9, currency: "EUR", status: "missing", merchant: "Muster Hosting GmbH" },
  { provider: "Muster-Immobilien", date: "2025-10-15", amount: 2400, currency: "EUR", status: "missing", merchant: "Muster Immobilien GmbH" },

  { provider: "Gehalt", date: "2025-10-20", amount: 14800, currency: "EUR", status: "no_invoice", note: "Gehalt", merchant: "LOHN / GEHALT 10/25 ANZAHL 6" },
  { provider: "Muster BKK", date: "2025-10-20", amount: 772.13, currency: "EUR", status: "no_invoice", note: "Sozialabgabe", merchant: "Muster BKK Beitrag Oktober 2025 DEMO" },
  { provider: "Finanzamt", date: "2025-10-22", amount: 4980, currency: "EUR", status: "no_invoice", note: "Lohnsteuer", merchant: "FINANZAMT MUSTERSTADT 000/000/00000, 10/25 LST." },
  { provider: "Kartenabrechnung", date: "2025-10-23", amount: 686.42, currency: "EUR", status: "no_invoice", note: "Kartenabrechnung", merchant: "SPARKASSE VISA NR. 0000 00XX XXXX 0000 EINZUG DES RECHNUNGSB 17.10" },
];

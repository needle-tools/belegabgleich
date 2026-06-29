/**
 * Pluggable bank-statement parser registry.
 *
 * To add a new bank: implement a `BankParser` (see ./types and ./sparkasse for a
 * worked example) and add it to `parsers` below. The matching engine (@kah/core)
 * consumes only `Charge[]`, so nothing else needs to change.
 *
 * Today only the Sparkasse parser is registered, by design.
 */
import type { BankParser, ParsedStatement } from "./types";
import { sparkasseParser } from "./sparkasse";

export type { BankParser, ParsedStatement } from "./types";
export {
  sparkasseParser,
  parseVisaStatement,
  parseKontoauszug,
  visaSettlementCard,
  expectsNoInvoice,
} from "./sparkasse";

/** All registered parsers, in priority order. */
export const parsers: BankParser[] = [sparkasseParser];

/** A parsed statement, tagged with which parser produced it. */
export type DetectedStatement = ParsedStatement & { parserId: string };

/**
 * Detect the bank from the statement text and parse it. Returns null when no
 * registered parser recognizes the format (the caller may then fall back to an
 * LLM-based extraction, if enabled).
 */
export function parseBankStatement(text: string, filename = ""): DetectedStatement | null {
  const parser = parsers.find((p) => p.detect(text, filename));
  if (!parser) return null;
  return { parserId: parser.id, ...parser.parse(text, filename) };
}

/** True if ANY registered parser considers this merchant a no-invoice debit. */
export function expectsNoInvoiceAny(merchant: string): boolean {
  return parsers.some((p) => p.expectsNoInvoice?.(merchant) ?? false);
}

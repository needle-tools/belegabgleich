import type { Charge } from "@kah/core";

/** A parsed statement: the bank/document kind plus its extracted charges. */
export type ParsedStatement = { kind: string; charges: Charge[] };

/**
 * A pluggable bank-statement parser. Add support for a new bank by implementing
 * this interface and registering it in `index.ts`. The matching engine (@kah/core)
 * only ever sees `Charge[]`, so it stays bank-agnostic.
 */
export interface BankParser {
  /** Stable id, e.g. "sparkasse". */
  id: string;
  /** Human label shown in the UI, e.g. "Sparkasse". */
  label: string;
  /** True when this parser recognizes the given statement text. Cheap content sniff. */
  detect(text: string, filename?: string): boolean;
  /** Parse a recognized statement into charges. Only called after detect() is true. */
  parse(text: string, filename?: string): ParsedStatement;
  /**
   * Optional: debits that intrinsically have NO vendor invoice (salary, wage tax,
   * social-insurance contribution, card settlement). The UI keeps these out of the
   * "Fehlend" list. Omit if the bank's format has no such concept.
   */
  expectsNoInvoice?(merchant: string): boolean;
}

/**
 * Foreign-exchange conversion.
 *
 * Pure functions only — no I/O. The snapshot is injected by the caller, which
 * keeps the core layer free of any file-system or network concerns (and makes
 * the module trivial to test with fixtures).
 *
 * ### Pluggable base currency
 *
 * Rates are expressed as "1 <baseCurrency> = N <currency>". Today the snapshot
 * pivots on USD because the underlying World Bank fields are USD-denominated,
 * but the math here is symmetric: a cross-rate between any two currencies is
 *
 *     rate(from → to) = rates[to] / rates[from]
 *
 * so the base can be swapped (e.g. to IMF SDR, or a PPP-adjusted international
 * dollar) without touching call sites. That matters for a protocol that aims
 * to outlive any single reserve-currency regime.
 */
export interface FxSnapshot {
  /** The pivot currency the rates are expressed relative to. */
  baseCurrency: string;
  /** ISO 8601 date the rates were sampled. */
  asOf: string;
  /** Human-readable provenance string. */
  source: string;
  /** rates[X] = how many X equal 1 baseCurrency. rates[baseCurrency] is always 1. */
  rates: Record<string, number>;
}

export interface Conversion {
  /** The converted amount, in `to` currency. */
  amount: number;
  /** Target currency (ISO 4217). */
  currency: string;
  /** The cross-rate applied: 1 `from` = `rate` × `to`. */
  rate: number;
  /** Date the source snapshot was sampled. */
  rateAsOf: string;
  /** The pivot currency used internally (for audit). */
  baseCurrency: string;
  /** Provenance string copied from the snapshot. */
  source: string;
}

/** Normalize an ISO 4217 code: uppercase, trimmed. */
function norm(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Look up the snapshot's rate for a currency code.
 * Throws if the code is unknown — callers should validate upstream and surface
 * a structured error, rather than silently returning a wrong amount.
 */
function rateOf(snapshot: FxSnapshot, code: string): number {
  const r = snapshot.rates[code];
  if (typeof r !== 'number' || !Number.isFinite(r) || r <= 0) {
    throw new Error(`fx: no rate for '${code}' in snapshot ${snapshot.asOf}`);
  }
  return r;
}

/**
 * Compute the cross-rate from one currency to another.
 * Works via the snapshot's pivot currency; no direct pair table required.
 */
export function crossRate(snapshot: FxSnapshot, from: string, to: string): number {
  const f = norm(from);
  const t = norm(to);
  if (f === t) return 1;
  const fromRate = rateOf(snapshot, f);
  const toRate = rateOf(snapshot, t);
  return toRate / fromRate;
}

/**
 * Convert an amount between two currencies using the snapshot.
 *
 * @returns Conversion result including the rate + provenance so the caller
 *          can surface it in an API response or UI tooltip.
 */
export function convert(
  amount: number,
  from: string,
  to: string,
  snapshot: FxSnapshot,
): Conversion {
  const rate = crossRate(snapshot, from, to);
  return {
    amount: amount * rate,
    currency: norm(to),
    rate,
    rateAsOf: snapshot.asOf,
    baseCurrency: snapshot.baseCurrency,
    source: snapshot.source,
  };
}

/**
 * Whether the snapshot can convert to/from the given currency.
 * Useful for API validation before calling `convert`.
 */
export function isSupportedCurrency(snapshot: FxSnapshot, code: string): boolean {
  return typeof snapshot.rates[norm(code)] === 'number';
}

/**
 * Pick a display currency, given a preferred local code.
 * Returns the preferred code if supported by the snapshot, else the base.
 * Callers in the data/admin layer look up the local code for a country
 * (via `COUNTRY_CURRENCY_MAP`) and pass it in here.
 */
export function pickDisplayCurrency(
  snapshot: FxSnapshot,
  preferred: string | undefined | null,
): string {
  if (preferred && isSupportedCurrency(snapshot, preferred)) return norm(preferred);
  return snapshot.baseCurrency;
}

/**
 * Resolve and validate a user-supplied currency string against the snapshot.
 * Returns the normalized code, or null if the input is not supported.
 * An empty/undefined input returns null (caller should apply its own default).
 */
export function resolveRequestedCurrency(
  snapshot: FxSnapshot,
  input: string | undefined | null,
): string | null {
  if (!input) return null;
  const code = norm(input);
  return isSupportedCurrency(snapshot, code) ? code : null;
}

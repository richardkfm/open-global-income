import { describe, it, expect } from 'vitest';
import {
  convert,
  crossRate,
  isSupportedCurrency,
  pickDisplayCurrency,
  resolveRequestedCurrency,
  type FxSnapshot,
} from './fx.js';

const USD_SNAPSHOT: FxSnapshot = {
  baseCurrency: 'USD',
  asOf: '2026-04-17',
  source: 'test fixture',
  rates: {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.80,
    KES: 132.0,
    SDR: 0.75,
  },
};

// A snapshot pivoted on SDR rather than USD — proves that the math is symmetric
// and the protocol is not locked to USD as the reference unit.
const SDR_SNAPSHOT: FxSnapshot = {
  baseCurrency: 'SDR',
  asOf: '2026-04-17',
  source: 'test fixture',
  rates: {
    SDR: 1.0,
    USD: 1 / 0.75,
    EUR: 0.92 / 0.75,
    GBP: 0.80 / 0.75,
    KES: 132.0 / 0.75,
  },
};

describe('crossRate', () => {
  it('returns 1 for same-currency pairs', () => {
    expect(crossRate(USD_SNAPSHOT, 'USD', 'USD')).toBe(1);
    expect(crossRate(USD_SNAPSHOT, 'EUR', 'EUR')).toBe(1);
  });

  it('converts base → local using the rate directly', () => {
    expect(crossRate(USD_SNAPSHOT, 'USD', 'EUR')).toBeCloseTo(0.92, 10);
    expect(crossRate(USD_SNAPSHOT, 'USD', 'KES')).toBeCloseTo(132.0, 10);
  });

  it('inverts for local → base', () => {
    expect(crossRate(USD_SNAPSHOT, 'EUR', 'USD')).toBeCloseTo(1 / 0.92, 10);
  });

  it('computes non-base cross-rates via the pivot', () => {
    // 1 EUR = 0.80/0.92 GBP
    expect(crossRate(USD_SNAPSHOT, 'EUR', 'GBP')).toBeCloseTo(0.80 / 0.92, 10);
  });

  it('is case-insensitive', () => {
    expect(crossRate(USD_SNAPSHOT, 'usd', 'eur')).toBeCloseTo(0.92, 10);
  });

  it('throws on unknown currencies', () => {
    expect(() => crossRate(USD_SNAPSHOT, 'USD', 'XYZ')).toThrow(/no rate/);
    expect(() => crossRate(USD_SNAPSHOT, 'XYZ', 'USD')).toThrow(/no rate/);
  });
});

describe('convert', () => {
  it('returns amount, currency, rate, and provenance', () => {
    const result = convert(100, 'USD', 'EUR', USD_SNAPSHOT);
    expect(result.amount).toBeCloseTo(92, 6);
    expect(result.currency).toBe('EUR');
    expect(result.rate).toBeCloseTo(0.92, 10);
    expect(result.rateAsOf).toBe('2026-04-17');
    expect(result.baseCurrency).toBe('USD');
    expect(result.source).toBe('test fixture');
  });

  it('round-trips through the base currency', () => {
    const there = convert(1000, 'EUR', 'KES', USD_SNAPSHOT);
    const back = convert(there.amount, 'KES', 'EUR', USD_SNAPSHOT);
    expect(back.amount).toBeCloseTo(1000, 6);
  });
});

describe('pluggable base currency (SDR-ready)', () => {
  it('produces the same cross-rates regardless of which pivot is used', () => {
    // USD→EUR should match whether we pivot on USD or SDR.
    const viaUsd = crossRate(USD_SNAPSHOT, 'USD', 'EUR');
    const viaSdr = crossRate(SDR_SNAPSHOT, 'USD', 'EUR');
    expect(viaSdr).toBeCloseTo(viaUsd, 10);
  });

  it('exposes baseCurrency on conversions for audit', () => {
    const result = convert(100, 'USD', 'EUR', SDR_SNAPSHOT);
    expect(result.baseCurrency).toBe('SDR');
  });
});

describe('isSupportedCurrency', () => {
  it('accepts known codes (any case)', () => {
    expect(isSupportedCurrency(USD_SNAPSHOT, 'EUR')).toBe(true);
    expect(isSupportedCurrency(USD_SNAPSHOT, 'eur')).toBe(true);
  });

  it('rejects unknown codes', () => {
    expect(isSupportedCurrency(USD_SNAPSHOT, 'XYZ')).toBe(false);
  });
});

describe('pickDisplayCurrency', () => {
  it('returns the preferred code when supported', () => {
    expect(pickDisplayCurrency(USD_SNAPSHOT, 'EUR')).toBe('EUR');
  });

  it('falls back to the base when preferred is unsupported', () => {
    expect(pickDisplayCurrency(USD_SNAPSHOT, 'XYZ')).toBe('USD');
  });

  it('falls back to the base when preferred is missing', () => {
    expect(pickDisplayCurrency(USD_SNAPSHOT, null)).toBe('USD');
    expect(pickDisplayCurrency(USD_SNAPSHOT, undefined)).toBe('USD');
  });
});

describe('resolveRequestedCurrency', () => {
  it('returns the normalized code for a supported request', () => {
    expect(resolveRequestedCurrency(USD_SNAPSHOT, 'eur')).toBe('EUR');
  });

  it('returns null for empty input', () => {
    expect(resolveRequestedCurrency(USD_SNAPSHOT, '')).toBeNull();
    expect(resolveRequestedCurrency(USD_SNAPSHOT, undefined)).toBeNull();
  });

  it('returns null for unsupported codes — callers apply their own default', () => {
    expect(resolveRequestedCurrency(USD_SNAPSHOT, 'XYZ')).toBeNull();
  });
});

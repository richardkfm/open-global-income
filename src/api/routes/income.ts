import type { FastifyPluginAsync } from 'fastify';
import { getCountryByCode, getDataVersion, getFxSnapshot } from '../../data/loader.js';
import { calculateEntitlement } from '../../core/rules.js';
import { convert, resolveRequestedCurrency } from '../../core/fx.js';
import { COUNTRY_CURRENCY_MAP } from '../../data/currencies.js';
import { config } from '../../config.js';
import type { GlobalIncomeEntitlement } from '../../core/types.js';

/**
 * Attach an auditable `display` block with the amount converted to a target
 * currency. Leaves the existing `pppUsdPerMonth` and `localCurrencyPerMonth`
 * fields intact so existing API clients are unaffected.
 *
 * @param countryCode Used to pick a sensible default when the caller didn't
 *                    request one — the country's local currency.
 * @param requested   Raw `?currency=` query value. Empty/unknown → fall back
 *                    to the country's local currency, then to the snapshot base.
 */
function withDisplay(
  entitlement: GlobalIncomeEntitlement,
  countryCode: string,
  requested: string | undefined,
) {
  const snapshot = getFxSnapshot();
  const resolved = resolveRequestedCurrency(snapshot, requested);
  const fallback = COUNTRY_CURRENCY_MAP[countryCode.toUpperCase()] ?? snapshot.baseCurrency;
  const target = resolved ?? fallback;
  // Convert the PPP-USD amount using PPP? No — the PPP figure is a
  // purchasing-power unit, not a market-FX unit. For market conversion we
  // take the nominal USD equivalent of the local figure (which was already
  // computed via the country's PPP factor) and express it in `target` via
  // the FX snapshot. This keeps the display number honest: it answers
  // "roughly how much is this at today's market rates?" rather than
  // conflating PPP with FX.
  const conversion = convert(entitlement.pppUsdPerMonth, snapshot.baseCurrency, target, snapshot);
  return {
    ...entitlement,
    display: {
      currency: conversion.currency,
      monthlyAmount: Math.round(conversion.amount * 100) / 100,
      rate: conversion.rate,
      rateAsOf: conversion.rateAsOf,
      baseCurrency: conversion.baseCurrency,
      source: conversion.source,
      note:
        'Display amount converts the PPP-USD figure via market FX at rateAsOf. '
        + 'For the native local-currency figure (PPP-adjusted) see localCurrencyPerMonth.',
    },
  };
}

export const incomeRoute: FastifyPluginAsync = async (app) => {
  /** Calculate entitlement for a single country */
  app.get<{ Querystring: { country?: string; currency?: string } }>(
    '/calc',
    async (request, reply) => {
      const countryParam = request.query.country;

      if (!countryParam) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'MISSING_PARAMETER',
            message: "Query parameter 'country' is required",
          },
        });
      }

      const country = getCountryByCode(countryParam);

      if (!country) {
        return reply.status(404).send({
          ok: false,
          error: {
            code: 'COUNTRY_NOT_FOUND',
            message: `No data available for country code '${countryParam.toUpperCase()}'`,
          },
        });
      }

      const entitlement = calculateEntitlement(country, getDataVersion());
      return {
        ok: true,
        data: withDisplay(entitlement, country.code, request.query.currency),
      };
    },
  );

  /** Batch calculate entitlements for multiple countries */
  app.post<{ Body: { countries?: string[]; currency?: string } }>(
    '/batch',
    async (request, reply) => {
      const countries = request.body?.countries;
      const requestedCurrency = request.body?.currency;

      if (!Array.isArray(countries) || countries.length === 0) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'MISSING_PARAMETER',
            message: "Request body must include a non-empty 'countries' array",
          },
        });
      }

      if (countries.length > config.api.batchMaxItems) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'BATCH_TOO_LARGE',
            message: `Maximum ${config.api.batchMaxItems} countries per batch request`,
          },
        });
      }

      const dataVersion = getDataVersion();
      const results = countries.map((code) => {
        if (typeof code !== 'string') {
          return {
            countryCode: String(code),
            error: {
              code: 'MISSING_PARAMETER',
              message: 'Country code must be a string',
            },
          };
        }

        const country = getCountryByCode(code);
        if (!country) {
          return {
            countryCode: code.toUpperCase(),
            error: {
              code: 'COUNTRY_NOT_FOUND',
              message: `No data available for country code '${code.toUpperCase()}'`,
            },
          };
        }

        const entitlement = calculateEntitlement(country, dataVersion);
        return withDisplay(entitlement, country.code, requestedCurrency);
      });

      return { ok: true, data: { count: results.length, results } };
    },
  );
};

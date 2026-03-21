#!/usr/bin/env node

/**
 * Master Data Importer
 *
 * Orchestrates all data sources (World Bank, ILO, IMF), merges their outputs
 * into enriched country profiles, and writes countries.json.
 *
 * Usage:  npm run data:update
 *
 * Sources:
 *   - World Bank Open Data API (primary: GDP, GNI, PPP, Gini, 12 macro indicators)
 *   - ILO Social Protection Dashboard (social coverage, pension, child benefit)
 *   - IMF Government Finance Statistics (tax revenue breakdown by type)
 *
 * Design: ILO and IMF failures are non-fatal. If either source is unavailable,
 * the importer logs a warning and continues with World Bank data only.
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './worldbank/config.types.js';
import { fetchAllIndicators } from './worldbank/fetcher.js';
import { transformCountries } from './worldbank/transformer.js';
import { validateOutput } from './worldbank/validator.js';
import { runIloImporter } from './ilo/importer.js';
import { runImfImporter } from './imf/importer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const wbConfigPath = resolve(__dirname, 'worldbank/config.json');

  // ── Step 1: World Bank ────────────────────────────────────────────────────
  console.error('=== World Bank ===');
  const wbConfig = loadConfig(wbConfigPath);
  console.error(
    `  ${Object.keys(wbConfig.indicators).length} indicators, ` +
      `${wbConfig.countries.mode === 'all' ? 'all' : wbConfig.countries.codes.length} countries`,
  );

  console.error('\nFetching from World Bank API...');
  const rawData = await fetchAllIndicators(wbConfig);
  console.error(`Received raw data for ${rawData.size} countries.`);

  console.error('\nTransforming...');
  const { countries, warnings } = transformCountries(rawData, wbConfig);
  for (const w of warnings) {
    console.error(`  WARNING: ${w}`);
  }
  console.error(`Transformed ${countries.length} countries.`);

  console.error('\nValidating World Bank data...');
  const wbResult = validateOutput(countries, wbConfig);
  if (!wbResult.valid) {
    console.error('WORLD BANK VALIDATION FAILED — countries.json was NOT overwritten:');
    for (const e of wbResult.errors) {
      console.error(`  ✗ ${e}`);
    }
    process.exit(1);
  }
  console.error('  ✓ World Bank validation passed.');

  // Build a mutable map for enrichment merging
  const countryMap = new Map(countries.map((c) => [c.code, c]));

  // ── Step 2: ILO ───────────────────────────────────────────────────────────
  let iloEnrichmentCount = 0;
  try {
    const iloEnrichment = await runIloImporter(resolve(__dirname, 'ilo/config.json'));

    for (const [iso2, enrichment] of iloEnrichment) {
      const country = countryMap.get(iso2);
      if (!country) continue;
      country.stats.socialProtectionCoveragePercent =
        enrichment.socialProtectionCoveragePercent ?? null;
      country.stats.socialProtectionExpenditureIloPercentGdp =
        enrichment.socialProtectionExpenditureIloPercentGdp ?? null;
      country.stats.pensionCoveragePercent = enrichment.pensionCoveragePercent ?? null;
      country.stats.childBenefitCoveragePercent = enrichment.childBenefitCoveragePercent ?? null;
      iloEnrichmentCount++;
    }
    console.error(`  ✓ ILO data merged for ${iloEnrichmentCount} countries.`);
  } catch (err) {
    console.error(`  WARNING: ILO import failed — continuing without ILO data: ${err}`);
  }

  // ── Step 3: IMF ───────────────────────────────────────────────────────────
  let imfEnrichmentCount = 0;
  try {
    const imfEnrichment = await runImfImporter(resolve(__dirname, 'imf/config.json'));

    for (const [iso2, enrichment] of imfEnrichment) {
      const country = countryMap.get(iso2);
      if (!country) continue;
      country.stats.taxBreakdown = enrichment.taxBreakdown ?? null;
      imfEnrichmentCount++;
    }
    console.error(`  ✓ IMF data merged for ${imfEnrichmentCount} countries.`);
  } catch (err) {
    console.error(`  WARNING: IMF import failed — continuing without IMF data: ${err}`);
  }

  // ── Step 4: Write output ──────────────────────────────────────────────────
  const mergedCountries = Array.from(countryMap.values());
  const year = new Date().getFullYear();
  const dataVersion = `${wbConfig.output.dataVersionPrefix}-${year}`;

  // Data completeness summary
  const totalIndicators = 17; // 5 core + 12 WB macro
  const iloFields = [
    'socialProtectionCoveragePercent',
    'socialProtectionExpenditureIloPercentGdp',
    'pensionCoveragePercent',
    'childBenefitCoveragePercent',
  ] as const;
  const hasSomeIloData = iloEnrichmentCount > 0;
  const hasSomeImfData = imfEnrichmentCount > 0;

  const completenessNotes = [
    `World Bank: ${mergedCountries.length} countries, ${totalIndicators} indicators`,
    `ILO social protection: ${hasSomeIloData ? `${iloEnrichmentCount} countries enriched` : 'not available'}`,
    `IMF fiscal breakdown: ${hasSomeImfData ? `${imfEnrichmentCount} countries enriched` : 'not available'}`,
  ];

  const output = {
    dataVersion,
    source: `Multi-source — World Bank, ILO, IMF — fetched ${new Date().toISOString().slice(0, 10)}`,
    completeness: completenessNotes,
    countries: mergedCountries,
  };

  const outputPath = resolve(__dirname, wbConfig.output.path);
  writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');

  console.error(`\n=== Done! ===`);
  console.error(`Wrote ${mergedCountries.length} countries to ${outputPath}`);
  console.error(`Data version: ${dataVersion}`);
  for (const note of completenessNotes) {
    console.error(`  ${note}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

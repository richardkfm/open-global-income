#!/usr/bin/env node

/**
 * World Bank Data Importer
 *
 * Fetches economic indicators from the World Bank API, transforms them into
 * the internal Country[] format, validates the output, and writes countries.json.
 *
 * Usage:  npm run data:update
 * Config: src/data/worldbank/config.json (edit to change sources, countries, thresholds)
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.types.js';
import { fetchAllIndicators } from './fetcher.js';
import { transformCountries } from './transformer.js';
import { validateOutput } from './validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const configPath = resolve(__dirname, 'config.json');

  // 1. Load and validate config
  console.error('Loading config...');
  const config = loadConfig(configPath);
  console.error(
    `  ${Object.keys(config.indicators).length} indicators, ` +
      `${config.countries.mode === 'all' ? 'all' : config.countries.codes.length} countries`,
  );

  // 2. Fetch all indicators from World Bank API
  console.error('\nFetching data from World Bank API...');
  const rawData = await fetchAllIndicators(config);
  console.error(`\nReceived raw data for ${rawData.size} countries.`);

  // 3. Transform into Country[]
  console.error('\nTransforming...');
  const { countries, warnings } = transformCountries(rawData, config);
  for (const w of warnings) {
    console.error(`  WARNING: ${w}`);
  }
  console.error(`Transformed ${countries.length} countries.`);

  // 4. Validate
  console.error('\nValidating...');
  const result = validateOutput(countries, config);
  if (!result.valid) {
    console.error('VALIDATION FAILED — countries.json was NOT overwritten:');
    for (const e of result.errors) {
      console.error(`  ✗ ${e}`);
    }
    process.exit(1);
  }
  console.error('  ✓ All validation checks passed.');

  // 5. Build data version string
  const year = new Date().getFullYear();
  const dataVersion = `${config.output.dataVersionPrefix}-${year}`;

  // 6. Write output
  const output = {
    dataVersion,
    source: `World Bank Open Data — fetched ${new Date().toISOString().slice(0, 10)}`,
    countries,
  };

  const outputPath = resolve(__dirname, config.output.path);
  writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');

  console.error(`\nDone! Wrote ${countries.length} countries to ${outputPath}`);
  console.error(`Data version: ${dataVersion}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

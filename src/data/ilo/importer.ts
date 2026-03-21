import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIloConfig } from './config.types.js';
import { fetchAllIloIndicators } from './fetcher.js';
import { transformIloData } from './transformer.js';
import { validateIloData } from './validator.js';
import type { IloEnrichment } from './transformer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run the ILO data import pipeline.
 * Returns a Map<ISO2, IloEnrichment> for merging into the main country dataset.
 * Also writes ilo-enrichment.json as a cache (prevents re-fetching on every run).
 */
export async function runIloImporter(
  configPath?: string,
): Promise<Map<string, IloEnrichment>> {
  const resolvedConfig = configPath ?? resolve(__dirname, 'config.json');
  const config = loadIloConfig(resolvedConfig);

  console.error('\nFetching ILO Social Protection data...');
  const rawData = await fetchAllIloIndicators(config);
  console.error(`  Received ILO data for ${rawData.size} countries.`);

  const enrichmentMap = transformIloData(rawData, config);

  const { warnings } = validateIloData(enrichmentMap, config);
  for (const w of warnings) {
    console.error(`  ILO WARNING: ${w}`);
  }

  // Write enrichment cache
  const outputPath = resolve(__dirname, config.output.path);
  const output: Record<string, IloEnrichment> = {};
  for (const [iso2, data] of enrichmentMap) {
    output[iso2] = data;
  }
  writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.error(`  Wrote ILO enrichment for ${enrichmentMap.size} countries to ${outputPath}`);

  return enrichmentMap;
}

// Allow running standalone: node src/data/ilo/importer.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runIloImporter().catch((err) => {
    console.error('ILO importer fatal error:', err);
    process.exit(1);
  });
}

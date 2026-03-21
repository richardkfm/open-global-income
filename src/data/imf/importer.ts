import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadImfConfig } from './config.types.js';
import { fetchAllImfIndicators } from './fetcher.js';
import { transformImfData } from './transformer.js';
import { validateImfData } from './validator.js';
import type { ImfEnrichment } from './transformer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run the IMF data import pipeline.
 * Returns a Map<ISO2, ImfEnrichment> for merging into the main country dataset.
 * Also writes imf-enrichment.json as a cache.
 */
export async function runImfImporter(
  configPath?: string,
): Promise<Map<string, ImfEnrichment>> {
  const resolvedConfig = configPath ?? resolve(__dirname, 'config.json');
  const config = loadImfConfig(resolvedConfig);

  console.error('\nFetching IMF Government Finance Statistics...');
  const rawData = await fetchAllImfIndicators(config);
  console.error(`  Received IMF data for ${rawData.size} countries.`);

  const enrichmentMap = transformImfData(rawData, config);

  const { warnings } = validateImfData(enrichmentMap, config);
  for (const w of warnings) {
    console.error(`  IMF WARNING: ${w}`);
  }

  // Write enrichment cache
  const outputPath = resolve(__dirname, config.output.path);
  const output: Record<string, ImfEnrichment> = {};
  for (const [iso2, data] of enrichmentMap) {
    output[iso2] = data;
  }
  writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.error(`  Wrote IMF enrichment for ${enrichmentMap.size} countries to ${outputPath}`);

  return enrichmentMap;
}

// Allow running standalone: node src/data/imf/importer.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runImfImporter().catch((err) => {
    console.error('IMF importer fatal error:', err);
    process.exit(1);
  });
}

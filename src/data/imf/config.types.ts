import { readFileSync } from 'node:fs';

export type ImfIndicatorField = 'incomeTaxPercentGdp' | 'vatPercentGdp' | 'tradeTaxPercentGdp';

export interface ImfConfig {
  source: {
    baseUrl: string;
    dataset: string;
    retries: number;
    retryDelayMs: number;
  };
  indicators: Record<ImfIndicatorField, string>;
  output: {
    path: string;
    roundDecimals: number;
  };
  validation: {
    percentRange: [number, number];
  };
}

export function loadImfConfig(configPath: string): ImfConfig {
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  if (!raw.source?.baseUrl || !raw.indicators || !raw.output?.path) {
    throw new Error('Invalid IMF config: missing required fields');
  }
  return raw as ImfConfig;
}

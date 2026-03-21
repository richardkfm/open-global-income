import { readFileSync } from 'node:fs';

export type IloIndicatorField =
  | 'socialProtectionCoveragePercent'
  | 'socialProtectionExpenditureIloPercentGdp'
  | 'pensionCoveragePercent'
  | 'childBenefitCoveragePercent';

export interface IloConfig {
  source: {
    baseUrl: string;
    dataflow: string;
    format: string;
    retries: number;
    retryDelayMs: number;
  };
  indicators: Record<IloIndicatorField, string>;
  output: {
    path: string;
    roundDecimals: number;
  };
  validation: {
    coverageRange: [number, number];
  };
}

export function loadIloConfig(configPath: string): IloConfig {
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  if (!raw.source?.baseUrl || !raw.indicators || !raw.output?.path) {
    throw new Error('Invalid ILO config: missing required fields');
  }
  return raw as IloConfig;
}

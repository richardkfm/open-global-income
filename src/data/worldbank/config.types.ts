import { readFileSync } from 'node:fs';

export type IndicatorField =
  | 'gdpPerCapitaUsd'
  | 'gniPerCapitaUsd'
  | 'pppConversionFactor'
  | 'giniIndex'
  | 'population';

export interface ImporterConfig {
  source: {
    baseUrl: string;
    format: string;
    perPage: number;
    retries: number;
    retryDelayMs: number;
  };
  indicators: Record<IndicatorField, string>;
  countries: {
    mode: 'explicit' | 'all';
    codes: string[];
    exclude?: string[];
  };
  dataVersioning?: {
    keepSnapshots: number;
    snapshotDir: string;
  };
  incomeGroupThresholds: Record<string, { min?: number; max?: number }>;
  giniIndex: {
    lookbackYears: number;
    nullable: boolean;
  };
  output: {
    path: string;
    dataVersionPrefix: string;
    roundDecimals: Record<IndicatorField, number>;
  };
  validation: {
    minCountries: number;
    requiredIncomeGroups: string[];
    giniRange: [number, number];
  };
}

const REQUIRED_INDICATORS: IndicatorField[] = [
  'gdpPerCapitaUsd',
  'gniPerCapitaUsd',
  'pppConversionFactor',
  'giniIndex',
  'population',
];

export function validateConfig(raw: unknown): string[] {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return ['Config must be a JSON object'];
  }

  const obj = raw as Record<string, unknown>;

  // source
  if (!obj.source || typeof obj.source !== 'object') {
    errors.push('Missing required section: source');
  } else {
    const src = obj.source as Record<string, unknown>;
    if (typeof src.baseUrl !== 'string') errors.push('source.baseUrl must be a string');
    if (typeof src.perPage !== 'number') errors.push('source.perPage must be a number');
  }

  // indicators
  if (!obj.indicators || typeof obj.indicators !== 'object') {
    errors.push('Missing required section: indicators');
  } else {
    const ind = obj.indicators as Record<string, unknown>;
    for (const field of REQUIRED_INDICATORS) {
      if (typeof ind[field] !== 'string') {
        errors.push(`indicators.${field} must be a string (indicator code)`);
      }
    }
  }

  // countries
  if (!obj.countries || typeof obj.countries !== 'object') {
    errors.push('Missing required section: countries');
  } else {
    const c = obj.countries as Record<string, unknown>;
    if (c.mode !== 'explicit' && c.mode !== 'all') {
      errors.push('countries.mode must be "explicit" or "all"');
    }
    if (!Array.isArray(c.codes)) {
      errors.push('countries.codes must be an array');
    }
  }

  // incomeGroupThresholds
  if (!obj.incomeGroupThresholds || typeof obj.incomeGroupThresholds !== 'object') {
    errors.push('Missing required section: incomeGroupThresholds');
  }

  // output
  if (!obj.output || typeof obj.output !== 'object') {
    errors.push('Missing required section: output');
  } else {
    const out = obj.output as Record<string, unknown>;
    if (typeof out.path !== 'string') errors.push('output.path must be a string');
    if (typeof out.dataVersionPrefix !== 'string') errors.push('output.dataVersionPrefix must be a string');
  }

  // validation
  if (!obj.validation || typeof obj.validation !== 'object') {
    errors.push('Missing required section: validation');
  }

  return errors;
}

export function loadConfig(configPath: string): ImporterConfig {
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  const errors = validateConfig(raw);
  if (errors.length > 0) {
    throw new Error(`Invalid config:\n  ${errors.join('\n  ')}`);
  }
  return raw as ImporterConfig;
}

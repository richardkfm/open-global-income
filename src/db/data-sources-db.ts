import { randomUUID } from 'node:crypto';
import { getDb } from './database.js';

export interface DataSourceRow {
  id: string;
  name: string;
  type: 'api' | 'upload' | 'manual';
  provider: string;
  url: string | null;
  description: string | null;
  config: string | null;
  last_fetched_at: string | null;
  data_year: string | null;
  status: 'active' | 'disabled' | 'error';
  error_message: string | null;
  countries_covered: number;
  indicators_provided: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface CreateDataSourceInput {
  name: string;
  type: 'api' | 'upload' | 'manual';
  provider: string;
  url?: string;
  description?: string;
  config?: Record<string, unknown>;
  data_year?: string;
  indicators_provided?: string[];
}

export function listDataSources(): DataSourceRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM data_sources ORDER BY created_at DESC').all() as DataSourceRow[];
}

export function getDataSourceById(id: string): DataSourceRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM data_sources WHERE id = ?').get(id) as DataSourceRow | undefined;
}

export function createDataSource(input: CreateDataSourceInput): DataSourceRow {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO data_sources (id, name, type, provider, url, description, config, data_year, indicators_provided)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.type,
    input.provider,
    input.url ?? null,
    input.description ?? null,
    input.config ? JSON.stringify(input.config) : null,
    input.data_year ?? null,
    input.indicators_provided ? JSON.stringify(input.indicators_provided) : null,
  );
  return getDataSourceById(id)!;
}

export function updateDataSource(id: string, updates: Partial<Pick<DataSourceRow, 'name' | 'url' | 'description' | 'status' | 'data_year' | 'error_message' | 'last_fetched_at' | 'countries_covered'>> & { config?: string; indicators_provided?: string }): void {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(val);
  }
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE data_sources SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteDataSource(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM data_sources WHERE id = ?').run(id);
}

/** Seed default data sources if the table is empty */
export function seedDefaultDataSources(): void {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as n FROM data_sources').get() as { n: number }).n;
  if (count > 0) return;

  const defaults: CreateDataSourceInput[] = [
    {
      name: 'World Bank Open Data',
      type: 'api',
      provider: 'worldbank',
      url: 'https://api.worldbank.org/v2',
      description: 'Primary data source for GDP, GNI, PPP, population, Gini index, and 17+ macroeconomic indicators',
      data_year: '2023',
      indicators_provided: [
        'gdpPerCapitaUsd', 'gniPerCapitaUsd', 'pppConversionFactor', 'giniIndex', 'population',
        'taxRevenuePercentGdp', 'socialProtectionSpendingPercentGdp', 'inflationRate',
        'laborForceParticipation', 'unemploymentRate', 'governmentDebtPercentGdp',
        'povertyHeadcountRatio', 'gdpGrowthRate', 'healthExpenditurePercentGdp',
        'educationExpenditurePercentGdp', 'urbanizationRate',
      ],
    },
    {
      name: 'ILO Social Protection',
      type: 'api',
      provider: 'ilo',
      url: 'https://www.ilo.org/ilostat-files/Documents/Excel',
      description: 'Social protection expenditure, pension coverage, child benefit coverage from the ILO World Social Protection Database',
      data_year: '2022-2023',
      indicators_provided: [
        'socialProtectionExpenditureIloPercentGdp', 'socialProtectionCoveragePercent',
        'pensionCoveragePercent', 'childBenefitCoveragePercent',
      ],
    },
    {
      name: 'IMF Fiscal Monitor',
      type: 'api',
      provider: 'imf',
      url: 'https://www.imf.org/external/datamapper/api/v1',
      description: 'Government debt, fiscal balances, and tax revenue data from IMF World Economic Outlook',
      data_year: '2023',
      indicators_provided: ['governmentDebtPercentGdp', 'socialContributionsPercentRevenue'],
    },
    {
      name: 'Wikidata',
      type: 'api',
      provider: 'wikidata',
      url: 'https://query.wikidata.org/sparql',
      description: 'Cross-reference source for country-level population, GDP, and geographic data via SPARQL queries',
      data_year: '2023-2024',
      indicators_provided: ['population', 'gdpPerCapitaUsd'],
    },
  ];

  for (const d of defaults) {
    createDataSource(d);
  }
}

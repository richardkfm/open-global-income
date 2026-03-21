-- Funding scenarios: saved funding mechanism configurations and results
CREATE TABLE IF NOT EXISTS funding_scenarios (
  id TEXT PRIMARY KEY,
  name TEXT,
  simulation_id TEXT REFERENCES simulations(id),
  country_code TEXT NOT NULL,
  mechanisms JSONB NOT NULL,
  results JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funding_scenarios_country ON funding_scenarios(country_code);
CREATE INDEX IF NOT EXISTS idx_funding_scenarios_simulation ON funding_scenarios(simulation_id);

-- Migration 003: Add pilot tracking tables for Phase 13

BEGIN;

CREATE TABLE IF NOT EXISTS pilots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  description TEXT,
  simulation_id UUID REFERENCES simulations(id),
  status TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','active','paused','completed')),
  start_date TEXT,
  end_date TEXT,
  target_recipients INTEGER,
  api_key_id UUID REFERENCES api_keys(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pilots_country ON pilots(country_code);
CREATE INDEX IF NOT EXISTS idx_pilots_status ON pilots(status);

CREATE TABLE IF NOT EXISTS pilot_disbursements (
  pilot_id UUID NOT NULL REFERENCES pilots(id),
  disbursement_id UUID NOT NULL REFERENCES disbursements(id),
  PRIMARY KEY (pilot_id, disbursement_id)
);

INSERT INTO schema_migrations (version, name) VALUES (3, '003_add_pilots')
ON CONFLICT (version) DO NOTHING;

COMMIT;

export const REGISTRY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS lab_room_registry (
    code text PRIMARY KEY, experiment text NOT NULL CHECK (experiment IN ('institutions', 'emh', 'judgment', 'evolution'))
  )`,
  `ALTER TABLE lab_room_registry DROP CONSTRAINT IF EXISTS lab_room_registry_experiment_check`,
  `ALTER TABLE lab_room_registry ADD CONSTRAINT lab_room_registry_experiment_check CHECK (experiment IN ('institutions', 'emh', 'judgment', 'evolution'))`,
  `INSERT INTO lab_room_registry (code, experiment) SELECT code, 'evolution' FROM evolution_rooms ON CONFLICT DO NOTHING`,
  `INSERT INTO lab_room_registry (code, experiment) SELECT code, 'institutions' FROM auction_rooms ON CONFLICT DO NOTHING`,
  `INSERT INTO lab_room_registry (code, experiment) SELECT code, 'emh' FROM emh_sessions ON CONFLICT DO NOTHING`,
  `INSERT INTO lab_room_registry (code, experiment) SELECT code, 'judgment' FROM judgment_rooms ON CONFLICT DO NOTHING`,
];

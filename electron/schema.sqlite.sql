-- Created automatically the first time the app opens its data file.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name     TEXT NOT NULL DEFAULT '',
  `rank`        TEXT NOT NULL DEFAULT '',
  service_no    TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'operator',
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  cost          INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requisitions (
  id                     TEXT PRIMARY KEY,
  department             TEXT NOT NULL DEFAULT '',
  visit_date             TEXT,
  time_from              TEXT NOT NULL DEFAULT '',
  time_to                TEXT NOT NULL DEFAULT '',
  purpose                TEXT NOT NULL DEFAULT '',
  place_of_visit         TEXT NOT NULL DEFAULT '',
  file_no                TEXT NOT NULL DEFAULT '',
  requisition_date       TEXT,
  requested_by_rank_name TEXT NOT NULL DEFAULT '',
  security_remarks       TEXT NOT NULL DEFAULT '',
  security_signature     TEXT NOT NULL DEFAULT '',
  pass_no                TEXT NOT NULL DEFAULT '',
  pass_issued_at         TEXT NOT NULL DEFAULT '',
  pass_issued_on         TEXT,
  pass_signed_by         TEXT NOT NULL DEFAULT '',
  status                 TEXT NOT NULL DEFAULT 'draft',
  created_by             TEXT NOT NULL DEFAULT '',
  created_by_service     TEXT NOT NULL DEFAULT '',
  created_by_name        TEXT NOT NULL DEFAULT '',
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_req_visit_date ON requisitions(visit_date);
CREATE INDEX IF NOT EXISTS idx_req_status     ON requisitions(status);
CREATE INDEX IF NOT EXISTS idx_req_department ON requisitions(department);
-- idx_req_service is created by the migration step in db.js, because an
-- existing database does not have created_by_service until it has run.

CREATE TABLE IF NOT EXISTS visitors (
  id             TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  ser            INTEGER NOT NULL DEFAULT 1,
  name           TEXT NOT NULL DEFAULT '',
  sex            TEXT NOT NULL DEFAULT '',
  age            TEXT NOT NULL DEFAULT '',
  nationality    TEXT NOT NULL DEFAULT '',
  id_proof_type  TEXT NOT NULL DEFAULT '',
  id_proof_no    TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_visitors_req      ON visitors(requisition_id);
CREATE INDEX IF NOT EXISTS idx_visitors_name     ON visitors(name);
CREATE INDEX IF NOT EXISTS idx_visitors_id_proof ON visitors(id_proof_no);

CREATE TABLE IF NOT EXISTS vehicles (
  id             TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  regn_no        TEXT NOT NULL DEFAULT '',
  vehicle_type   TEXT NOT NULL DEFAULT '',
  driver_name    TEXT NOT NULL DEFAULT '',
  cdl_no         TEXT NOT NULL DEFAULT '',
  purpose        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_vehicles_req ON vehicles(requisition_id);

CREATE TABLE IF NOT EXISTS escorts (
  id             TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT '',
  rank_desig     TEXT NOT NULL DEFAULT '',
  p_no           TEXT NOT NULL DEFAULT '',
  i_card_no      TEXT NOT NULL DEFAULT '',
  dept           TEXT NOT NULL DEFAULT '',
  mob_no         TEXT NOT NULL DEFAULT '',
  signed         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_escorts_req ON escorts(requisition_id);

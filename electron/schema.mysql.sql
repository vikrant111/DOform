-- Created by `npm run init-db`. Safe to run repeatedly.
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  full_name     VARCHAR(255) NOT NULL DEFAULT '',
  `rank`        VARCHAR(128) NOT NULL DEFAULT '',
  service_no    VARCHAR(64)  NOT NULL DEFAULT '',
  role          VARCHAR(16)  NOT NULL DEFAULT 'operator',
  password_hash VARCHAR(255) NOT NULL,
  salt          VARCHAR(64)  NOT NULL,
  cost          INT          NOT NULL,
  created_at    DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS requisitions (
  id                     VARCHAR(64)  NOT NULL PRIMARY KEY,
  department             VARCHAR(255) NOT NULL DEFAULT '',
  visit_date             DATE         NULL,
  time_from              VARCHAR(10)  NOT NULL DEFAULT '',
  time_to                VARCHAR(10)  NOT NULL DEFAULT '',
  purpose                TEXT,
  place_of_visit         VARCHAR(255) NOT NULL DEFAULT '',
  file_no                VARCHAR(64)  NOT NULL DEFAULT '',
  requisition_date       DATE         NULL,
  requested_by_rank_name VARCHAR(255) NOT NULL DEFAULT '',
  security_remarks       TEXT,
  security_signature     VARCHAR(255) NOT NULL DEFAULT '',
  pass_no                VARCHAR(64)  NOT NULL DEFAULT '',
  pass_issued_at         VARCHAR(10)  NOT NULL DEFAULT '',
  pass_issued_on         DATE         NULL,
  pass_signed_by         VARCHAR(255) NOT NULL DEFAULT '',
  status                 VARCHAR(16)  NOT NULL DEFAULT 'draft',
  created_by             VARCHAR(64)  NOT NULL DEFAULT '',
  created_by_service     VARCHAR(64)  NOT NULL DEFAULT '',
  created_by_name        VARCHAR(255) NOT NULL DEFAULT '',
  created_at             DATETIME     NOT NULL,
  updated_at             DATETIME     NOT NULL,
  KEY idx_visit_date (visit_date),
  KEY idx_status (status),
  KEY idx_department (department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visitors (
  id             VARCHAR(64)  NOT NULL PRIMARY KEY,
  requisition_id VARCHAR(64)  NOT NULL,
  ser            INT          NOT NULL DEFAULT 1,
  name           VARCHAR(255) NOT NULL DEFAULT '',
  sex            VARCHAR(16)  NOT NULL DEFAULT '',
  age            VARCHAR(8)   NOT NULL DEFAULT '',
  nationality    VARCHAR(64)  NOT NULL DEFAULT '',
  id_proof_type  VARCHAR(64)  NOT NULL DEFAULT '',
  id_proof_no    VARCHAR(128) NOT NULL DEFAULT '',
  address        TEXT,
  KEY idx_req (requisition_id),
  KEY idx_name (name),
  KEY idx_id_proof (id_proof_no),
  CONSTRAINT fk_visitors_req FOREIGN KEY (requisition_id)
    REFERENCES requisitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicles (
  id             VARCHAR(64)  NOT NULL PRIMARY KEY,
  requisition_id VARCHAR(64)  NOT NULL,
  regn_no        VARCHAR(64)  NOT NULL DEFAULT '',
  vehicle_type   VARCHAR(64)  NOT NULL DEFAULT '',
  driver_name    VARCHAR(255) NOT NULL DEFAULT '',
  cdl_no         VARCHAR(64)  NOT NULL DEFAULT '',
  purpose        VARCHAR(255) NOT NULL DEFAULT '',
  KEY idx_req (requisition_id),
  CONSTRAINT fk_vehicles_req FOREIGN KEY (requisition_id)
    REFERENCES requisitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS escorts (
  id             VARCHAR(64)  NOT NULL PRIMARY KEY,
  requisition_id VARCHAR(64)  NOT NULL,
  name           VARCHAR(255) NOT NULL DEFAULT '',
  rank_desig     VARCHAR(128) NOT NULL DEFAULT '',
  p_no           VARCHAR(64)  NOT NULL DEFAULT '',
  i_card_no      VARCHAR(64)  NOT NULL DEFAULT '',
  dept           VARCHAR(128) NOT NULL DEFAULT '',
  mob_no         VARCHAR(32)  NOT NULL DEFAULT '',
  signed         TINYINT(1)   NOT NULL DEFAULT 0,
  KEY idx_req (requisition_id),
  CONSTRAINT fk_escorts_req FOREIGN KEY (requisition_id)
    REFERENCES requisitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

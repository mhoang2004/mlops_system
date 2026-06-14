-- Migration: Add evaluation tables
-- Run once against the postgres DB, OR just restart the API container
-- (SQLAlchemy auto-creates all tables on startup via Base.metadata.create_all)

CREATE TABLE IF NOT EXISTS evaluations (
    id              SERIAL PRIMARY KEY,
    project_id      INTEGER NOT NULL REFERENCES projects(id)     ON DELETE CASCADE,
    ml_model_id     INTEGER NOT NULL REFERENCES ml_models(id)    ON DELETE RESTRICT,
    checkpoint_id   INTEGER NOT NULL REFERENCES checkpoints(id)  ON DELETE RESTRICT,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    server_id       VARCHAR(100) NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    celery_task_id  VARCHAR(255),
    overall_metrics JSONB,
    dataset_results JSONB,
    error_message   TEXT,
    started_at      TIMESTAMP,
    finished_at     TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluation_datasets (
    id                  SERIAL PRIMARY KEY,
    evaluation_id       INTEGER NOT NULL REFERENCES evaluations(id)      ON DELETE CASCADE,
    dataset_version_id  INTEGER NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE
);

-- One Postgres instance, two databases: POSTGRES_DB (the app's own
-- tickets/sessions data, added in Phase 3) and this one, for Airflow's
-- own metadata. Per the plan's "Airflow ↔ Spark wiring" / cost-table
-- note: a whole separate Postgres install just for Airflow's internal
-- state would be a second thing to back up, monitor, and keep patched
-- for zero actual isolation benefit at this scale.
CREATE DATABASE airflow;

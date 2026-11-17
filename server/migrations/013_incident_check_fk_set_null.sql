-- La limpieza por antiguedad nunca funciono: borraba checks que seguian
-- referidos desde incidents (first_check_id / last_check_id) y Postgres la
-- rechazaba con "viola la llave foranea incidents_first_check_id_fkey". Como
-- era la primera sentencia, tampoco se limpiaban notifications ni incidents.
--
-- Con SET NULL el incidente conserva sus fechas de inicio y fin aunque se
-- borre el check que lo abrio o lo cerro. Nada en la app lee esas columnas
-- para mostrar incidentes.
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_first_check_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_first_check_id_fkey
  FOREIGN KEY (first_check_id) REFERENCES checks(id) ON DELETE SET NULL;

ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_last_check_id_fkey;
ALTER TABLE incidents
  ADD CONSTRAINT incidents_last_check_id_fkey
  FOREIGN KEY (last_check_id) REFERENCES checks(id) ON DELETE SET NULL;

-- El borrado por fecha necesita este indice para no recorrer la tabla entera,
-- y cada check borrado obliga a buscar incidentes que lo referencien.
CREATE INDEX IF NOT EXISTS idx_checks_checked_at ON checks (checked_at);
CREATE INDEX IF NOT EXISTS idx_incidents_first_check ON incidents (first_check_id);
CREATE INDEX IF NOT EXISTS idx_incidents_last_check ON incidents (last_check_id);

WITH node_data AS (
  SELECT * FROM (VALUES
    ('RIS', '10.7.80.182', 5000, ARRAY['ivan.leiva@redsalud.gob.cl','dario.perez@redsalud.gob.cl','mesadeayuda.hec@redsalud.gob.cl','vicente.vallejos@redsalud.gob.cl']::text[]),
    ('PACS LTS', '10.7.80.108', 104, ARRAY['ivan.leiva@redsalud.gob.cl','dario.perez@redsalud.gob.cl','mesadeayuda.hec@redsalud.gob.cl','vicente.vallejos@redsalud.gob.cl']::text[]),
    ('TELEMEDICINA DB POSTGRES', '10.7.71.21', 5432, ARRAY['jaime.gajardo@redsalud.gob.cl','krisse.vera@redsalud.gob.cl','andres.villegasv@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('TELEMEDICINA', '10.7.71.153', 80, ARRAY['jaime.gajardo@redsalud.gob.cl','krisse.vera@redsalud.gob.cl','andres.villegasv@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('FARMACIA (MYSQL)', '10.7.71.47', 3306, ARRAY['jaime.gajardo@redsalud.gob.cl','krisse.vera@redsalud.gob.cl','andres.villegasv@redsalud.gob.cl','dario.perez@redsalud.gob.cl','oscar.torress@redsalud.gob.cl']::text[]),
    ('ATRYS', '10.7.80.136', 11112, ARRAY['ivan.leiva@redsalud.gob.cl','dario.perez@redsalud.gob.cl','mesadeayuda.hec@redsalud.gob.cl','vicente.vallejos@redsalud.gob.cl']::text[]),
    ('PACS-DAS93', '10.7.80.93', 4100, ARRAY['ivan.leiva@redsalud.gob.cl','dario.perez@redsalud.gob.cl','mesadeayuda.hec@redsalud.gob.cl','vicente.vallejos@redsalud.gob.cl']::text[]),
    ('PACS-DAS187', '10.7.80.187', 104, ARRAY['ivan.leiva@redsalud.gob.cl','dario.perez@redsalud.gob.cl','mesadeayuda.hec@redsalud.gob.cl','vicente.vallejos@redsalud.gob.cl']::text[]),
    ('TELEMEDICINA QA', '10.7.71.126', 6450, ARRAY['jaime.gajardo@redsalud.gob.cl','krisse.vera@redsalud.gob.cl','andres.villegasv@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('ERP ABASTECIMIENTO QA', '10.7.71.129', 8888, ARRAY['jaime.gajardo@redsalud.gob.cl','oscar.torress@redsalud.gob.cl','andres.villegasv@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('ERP ABASTECIMIENTO PRODUCCION', '10.7.71.32', 8888, ARRAY['jaime.gajardo@redsalud.gob.cl','oscar.torress@redsalud.gob.cl','andres.villegasv@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('ERP FRONT', '10.7.71.32', 80, ARRAY['jaime.gajardo@redsalud.gob.cl','oscar.torress@redsalud.gob.cl','andres.villegasv@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('ERP DB', '10.7.71.146', 1433, ARRAY['jaime.gajardo@redsalud.gob.cl','oscar.torress@redsalud.gob.cl','andres.villegasv@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('MOTOR DE INTEGRACION RAYEN', '10.8.169.80', 6660, ARRAY['jaime.gajardo@redsalud.gob.cl','krisse.vera@redsalud.gob.cl','andres.villegasv@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('MOTOR DE INTEGRACION 64', '10.7.71.64', 8443, ARRAY['krisse.vera@redsalud.gob.cl','ivan.leiva@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('MOTOR DE INTEGRACION 111', '10.7.71.111', 8448, ARRAY['krisse.vera@redsalud.gob.cl','ivan.leiva@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('MOTOR DB POSTGRES 73', '10.7.71.73', 5432, ARRAY['jaime.gajardo@redsalud.gob.cl','krisse.vera@redsalud.gob.cl','ivan.leiva@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('APP RECAUDACION', '10.7.71.122', 8080, ARRAY['jaime.gajardo@redsalud.gob.cl','krisse.vera@redsalud.gob.cl','ivan.leiva@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('DB TRAZA DOCUMENTAL', '10.7.71.31', 1433, ARRAY['jaime.gajardo@redsalud.gob.cl','krisse.vera@redsalud.gob.cl','ivan.leiva@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[]),
    ('DB 159', '10.7.71.159', 1433, ARRAY['jaime.gajardo@redsalud.gob.cl','krisse.vera@redsalud.gob.cl','ivan.leiva@redsalud.gob.cl','dario.perez@redsalud.gob.cl']::text[])
  ) AS t(name, host, port, recipients)
),
ins_nodes AS (
  INSERT INTO nodes (name, host, port, enabled, check_interval_sec, retry_interval_sec, timeout_ms)
  SELECT name, host, port, TRUE, 300, 60, 5000
  FROM node_data
  ON CONFLICT (name) DO NOTHING
  RETURNING id, name
),
all_nodes AS (
  SELECT id, name FROM nodes WHERE name IN (SELECT name FROM node_data)
),
ins_recipients AS (
  INSERT INTO recipients (email)
  SELECT DISTINCT unnest(recipients) FROM node_data
  ON CONFLICT (email) DO NOTHING
  RETURNING id, email
),
all_recipients AS (
  SELECT id, email FROM recipients WHERE email IN (SELECT DISTINCT unnest(recipients) FROM node_data)
)
INSERT INTO node_recipients (node_id, recipient_id)
SELECT n.id, r.id
FROM node_data d
JOIN all_nodes n ON n.name = d.name
JOIN all_recipients r ON r.email = ANY(d.recipients)
ON CONFLICT DO NOTHING;

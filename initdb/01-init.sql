-- Table des étudiants
CREATE TABLE IF NOT EXISTS etudiants (
  id         SERIAL PRIMARY KEY,
  nom        VARCHAR(100) NOT NULL,
  programme  VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP   -- requis par GET /api/etudiants
);

INSERT INTO etudiants (nom, programme)
SELECT 'Demba Sow', '420-TT4'
WHERE NOT EXISTS (SELECT 1 FROM etudiants WHERE nom = 'Demba Sow');

INSERT INTO etudiants (nom, programme)
SELECT 'Marc Carney', '420-TT4'
WHERE NOT EXISTS (SELECT 1 FROM etudiants WHERE nom = 'Marc Carney');

-- Table des devoirs (clé étrangère vers etudiants)
CREATE TABLE IF NOT EXISTS devoirs (
  id          SERIAL PRIMARY KEY,
  etudiant_id INTEGER NOT NULL REFERENCES etudiants(id),
  titre       VARCHAR(200) NOT NULL,
  description TEXT,
  date_limite DATE,
  statut      VARCHAR(20) DEFAULT 'a_faire',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT devoirs_statut_check CHECK (statut IN ('a_faire', 'en_cours', 'termine'))
);

INSERT INTO devoirs (etudiant_id, titre, description, date_limite)
SELECT id, 'TP3 — Volumes Docker', 'Démontrer la persistance avec PostgreSQL.', CURRENT_DATE + 7
FROM etudiants WHERE nom = 'Demba Sow';

INSERT INTO devoirs (etudiant_id, titre, description, date_limite)
SELECT id, 'TP5 — Docker Compose', 'Créer une app multi-conteneurs.', CURRENT_DATE + 14
FROM etudiants WHERE nom = 'Marc Carney';

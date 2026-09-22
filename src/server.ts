import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from 'redis';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT ?? 3000);
const here = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'ecole',
  user: process.env.POSTGRES_USER ?? 'etudiant',
  password: process.env.POSTGRES_PASSWORD ?? 'motdepasse_tp5',
});

const cache = createClient({
  socket: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
});
cache.on('error', (error) => console.error('Redis:', error.message));

await cache.connect().catch((error) => console.error('Redis indisponible:', error.message));
app.use(express.json());
app.use(express.static(path.join(here, '../public')));

type AssignmentInput = { etudiant_id?: unknown; titre?: unknown; description?: unknown; date_limite?: unknown; statut?: unknown };
const statuses = ['a_faire', 'en_cours', 'termine'] as const;
const valid = (body: AssignmentInput) => {
  const etudiant_id = Number(body.etudiant_id);
  const titre = typeof body.titre === 'string' ? body.titre.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const date_limite = typeof body.date_limite === 'string' ? body.date_limite : '';
  const statut = typeof body.statut === 'string' && statuses.includes(body.statut as (typeof statuses)[number]) ? body.statut : 'a_faire';
  return Number.isInteger(etudiant_id) && etudiant_id > 0 && titre && date_limite ? { etudiant_id, titre, description, date_limite, statut } : null;
};
const serialize = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : value;
const rows = (items: Record<string, unknown>[]) => items.map((item) => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, serialize(value)])));
const invalidate = async () => { if (cache.isReady) await cache.del('devoirs:liste'); };

app.get('/health', async (_req, res) => {
  const result: Record<string, string> = { status: 'ok', database: 'ok', cache: 'ok' };
  try { await pool.query('SELECT 1'); } catch (error) { res.status(503).json({ status: 'error', database: 'error', detail: String(error) }); return; }
  if (!cache.isReady) result.cache = 'degraded'; else { try { await cache.ping(); } catch { result.cache = 'degraded'; } }
  res.json(result);
});

app.get('/', async (_req, res) => {
  const students = await pool.query('SELECT COUNT(*)::int AS total FROM etudiants');
  const assignments = await pool.query('SELECT COUNT(*)::int AS total FROM devoirs');
  res.json({ message: 'Plateforme de suivi des devoirs', nombre_etudiants: students.rows[0].total, nombre_devoirs: assignments.rows[0].total });
});

app.get('/api/etudiants', async (_req, res) => {
  const result = await pool.query('SELECT id, nom, programme, created_at FROM etudiants ORDER BY id');
  res.json(rows(result.rows));
});

const assignmentQuery = `SELECT d.id, d.titre, d.description, d.date_limite, d.statut, d.etudiant_id, e.nom AS etudiant FROM devoirs d JOIN etudiants e ON e.id = d.etudiant_id`;
app.get('/api/devoirs', async (_req, res) => {
  if (cache.isReady) { const cached = await cache.get('devoirs:liste'); if (cached) { res.setHeader('X-Cache', 'HIT'); res.json(JSON.parse(cached)); return; } }
  const result = await pool.query(`${assignmentQuery} ORDER BY d.date_limite, d.id`);
  const data = rows(result.rows);
  if (cache.isReady) await cache.set('devoirs:liste', JSON.stringify(data), { EX: 30 });
  res.setHeader('X-Cache', 'MISS'); res.json(data);
});

app.get('/api/devoirs/:id', async (req, res) => {
  const result = await pool.query(`${assignmentQuery} WHERE d.id = $1`, [req.params.id]);
  if (!result.rowCount) { res.status(404).json({ error: 'devoir introuvable' }); return; }
  res.json(rows(result.rows)[0]);
});

app.post('/api/devoirs', async (req: Request<{}, {}, AssignmentInput>, res: Response) => {
  const assignment = valid(req.body);
  if (!assignment) { res.status(400).json({ error: 'etudiant_id, titre et date_limite sont obligatoires' }); return; }
  try {
    const result = await pool.query(`INSERT INTO devoirs (etudiant_id, titre, description, date_limite, statut) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [assignment.etudiant_id, assignment.titre, assignment.description, assignment.date_limite, assignment.statut]);
    await invalidate(); res.status(201).json({ id: result.rows[0].id, message: 'devoir créé' });
  } catch (error) { res.status(400).json({ error: 'étudiant inexistant ou données invalides', detail: String(error) }); }
});

app.patch('/api/devoirs/:id', async (req: Request<{ id: string }, {}, { statut?: unknown }>, res: Response) => {
  const statut = req.body.statut ?? 'termine';
  if (typeof statut !== 'string' || !statuses.includes(statut as (typeof statuses)[number])) { res.status(400).json({ error: 'statut invalide' }); return; }
  const result = await pool.query('UPDATE devoirs SET statut = $1 WHERE id = $2 RETURNING id', [statut, req.params.id]);
  if (!result.rowCount) { res.status(404).json({ error: 'devoir introuvable' }); return; }
  await invalidate(); res.json({ id: req.params.id, statut, message: 'devoir mis à jour' });
});

app.listen(port, '0.0.0.0', () => console.log(`TP5 web disponible sur le port ${port}`));

// Ajouter un étudiant (POST) — requête paramétrée contre l'injection SQL
app.post('/api/etudiants', async (req: Request, res: Response) => {
  const nom = typeof req.body.nom === 'string' ? req.body.nom.trim() : '';
  const programme = typeof req.body.programme === 'string' ? req.body.programme.trim() : '';
  if (!nom || !programme) { res.status(400).json({ error: 'nom et programme sont obligatoires' }); return; }
  const result = await pool.query('INSERT INTO etudiants (nom, programme) VALUES ($1, $2) RETURNING id', [nom, programme]);
  res.status(201).json({ id: result.rows[0].id, message: 'étudiant créé' });
});

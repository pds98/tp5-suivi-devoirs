# TP5 — Projet intégrateur : suivi des devoirs

Cette version utilise Node.js, TypeScript, Express, PostgreSQL, Redis et Docker Compose. PostgreSQL conserve les données, Redis accélère temporairement la lecture des devoirs et l’API TypeScript expose les opérations métier.

## Démarrage étudiant

Ouvrir Docker Desktop et attendre qu’il soit prêt. Puis :

```powershell
cd "C:\LaSalle\Automne2026\420TT4\pratiques\Docker_Postgree\TP5_Projet_integrateur_Suivi_Devoirs"
docker --version
docker compose version
docker info
docker compose config
docker compose up -d --build
docker compose ps
```

Attendre que `db` et `redis` soient `healthy`, puis ouvrir `http://localhost:5002`.

## Services

| Service | Fonction | Accès |
|---|---|---|
| web | API Express TypeScript et interface | http://localhost:5002 |
| db | PostgreSQL 16 | db:5432 |
| redis | cache Redis 7 | redis:6379 |
| adminer | console PostgreSQL | http://localhost:8085 |

## API

- `GET /` : résumé de la plateforme.
- `GET /health` : état de PostgreSQL et Redis.
- `GET /api/etudiants` : liste des étudiants.
- `GET /api/devoirs` : liste avec cache Redis de 30 secondes.
- `GET /api/devoirs/:id` : détail d’un devoir.
- `POST /api/devoirs` : création validée.
- `PATCH /api/devoirs/:id` : changement de statut.

## Tests PowerShell

```powershell
Invoke-RestMethod http://localhost:5002/health
Invoke-RestMethod http://localhost:5002/api/devoirs
.\scripts\test-api.ps1
```

Créer un devoir :

```powershell
$body = @{ etudiant_id = 1; titre = 'TP5 intégrateur'; description = 'Finaliser la plateforme'; date_limite = '2026-10-01' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:5002/api/devoirs -ContentType 'application/json' -Body $body
```

Terminer un devoir :

```powershell
$body = @{ statut = 'termine' } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri http://localhost:5002/api/devoirs/1 -ContentType 'application/json' -Body $body
```

## PostgreSQL et Adminer

```powershell
docker compose exec db psql -U etudiant -d ecole -c "SELECT * FROM etudiants;"
docker compose exec db psql -U etudiant -d ecole -c "SELECT * FROM devoirs ORDER BY date_limite;"
```

Dans Adminer : système PostgreSQL, serveur `db`, utilisateur `etudiant`, mot de passe `motdepasse_tp5`, base `ecole`.

## Cache Redis

La route `/api/devoirs` renvoie `X-Cache: MISS` à la première lecture puis souvent `X-Cache: HIT` pendant 30 secondes. Les opérations de création et de modification invalident le cache. Si Redis est arrêté, l’API continue de répondre avec un cache dégradé.

```powershell
docker compose stop redis
Invoke-RestMethod http://localhost:5002/health
docker compose start redis
```

## Sauvegarde et restauration

```powershell
.\scripts\backup.ps1
```

Si PowerShell bloque les scripts, utilisez :

```powershell
docker compose exec -T db pg_dump -U etudiant -d ecole > backups/ecole_manuel.sql
docker compose exec db createdb -U etudiant restauration_test
Get-Content backups/ecole_manuel.sql -Raw | docker compose exec -T db psql -U etudiant -d restauration_test
docker compose exec db psql -U etudiant -d restauration_test -c "SELECT COUNT(*) FROM devoirs;"
docker compose exec db dropdb -U etudiant restauration_test
```

## Cycle de vie

```powershell
docker compose logs -f web
docker compose logs db
docker compose logs redis
docker compose stop
docker compose start
docker compose down
```

`docker compose down` conserve les volumes. `docker compose down -v` supprime les données et réinitialise le TP.

## Développement local facultatif

```powershell
npm install
npm run check
npm run dev
```

Ne lancez pas `node src/server.ts`. Utilisez `tsx` en développement ou compilez avec `npm run build` avant `npm start`.

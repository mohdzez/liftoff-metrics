# Liftoff DB Demo

A tiny Postgres-backed web app for testing the **Liftoff** platform. Deploy it to
exercise — and demo — the database, migration, logs, and metrics features.

## What it shows

- **Live DB connection status** — reads `DATABASE_URL` (injected by Liftoff when
  you connect a PostgreSQL resource) and displays connection state, the Postgres
  version, and the host.
- **Migrations via a release command** — `npm run migrate` creates a `demo_visits`
  table. Set it as the service's **Release command** in Liftoff; it runs as a
  pre-deploy job (with `DATABASE_URL` injected) and rolls the deploy back if it fails.
- **DB writes** — every page load records a row in `demo_visits` and shows the
  running total + recent visits, proving reads/writes work.
- **Runtime logs** — every request and a 15s heartbeat are logged to stdout, so the
  Logs panel has real output.
- **Metrics** — a **Generate CPU load** button spikes CPU for a few seconds so the
  CPU/memory charts show movement.

## Routes

| Route        | Purpose                                              |
|--------------|------------------------------------------------------|
| `/`          | Dashboard (records a visit, auto-refreshes every 10s)|
| `/health`    | Healthcheck (no DB) — point Liftoff's healthcheck here|
| `/api/stats` | JSON status                                          |
| `/load?ms=N` | Burns CPU for N ms (max 15000)                        |

## Run locally

```bash
npm install
# DigitalOcean Postgres needs sslmode=require; a local one doesn't.
export DATABASE_URL="postgresql://user:pass@127.0.0.1:5432/mydb"
npm run migrate      # create the schema
npm start            # http://localhost:3000
```

With no `DATABASE_URL` the app still boots and shows a "no database connected" state.

## Deploy on Liftoff

1. Push this repo to GitHub and connect it to a Liftoff project.
2. On the canvas, open the service settings and set:
   - **Build strategy:** Dockerfile
   - **Port:** `3000`, **Healthcheck:** `/health`
   - **Release command:** `npm run migrate`
3. Add a **PostgreSQL** resource, then draw an edge from it **to** the service
   (DB → service). That injects `DATABASE_URL`.
4. **Deploy.** The release command migrates the DB before the app goes live.
5. Open the app URL — you should see **Connected · schema ready** and a growing
   visit count. Click **Generate CPU load**, then watch the Metrics tab.

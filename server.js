'use strict';

const os = require('os');
const express = require('express');
const { createPool, connectionString } = require('./db');

const PORT = parseInt(process.env.PORT || '3000', 10);
const INSTANCE = os.hostname();
const STARTED_AT = Date.now();
const PROJECT = process.env.LIFTOFF_PROJECT || '(local)';
const ENVIRONMENT = process.env.LIFTOFF_ENVIRONMENT || '(local)';

const pool = createPool();
const app = express();
app.disable('x-powered-by');

// Log every request to stdout — this is what shows up in Liftoff's runtime logs.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[req] ${req.method} ${req.path} -> ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

function uptimeSec() {
  return Math.round((Date.now() - STARTED_AT) / 1000);
}

function maskedHost() {
  if (!connectionString) return null;
  try {
    const u = new URL(connectionString);
    return `${u.hostname}:${u.port || '5432'}`;
  } catch {
    return 'unknown';
  }
}

// Reads connection + migration state without writing anything.
async function getDbStatus() {
  if (!pool) {
    return {
      state: 'no-url',
      message: 'DATABASE_URL is not set. Connect a PostgreSQL resource to this service in Liftoff and redeploy.',
    };
  }
  try {
    const { rows } = await pool.query('SELECT version() AS version');
    const { rows: t } = await pool.query(
      "SELECT to_regclass('public.demo_visits') IS NOT NULL AS migrated",
    );
    return {
      state: 'connected',
      version: rows[0].version,
      migrated: t[0].migrated,
      host: maskedHost(),
    };
  } catch (err) {
    return { state: 'error', message: err.message, host: maskedHost() };
  }
}

// Records a visit (proves DB writes + that the migration ran) and returns stats.
async function recordVisit(req) {
  if (!pool) return { recorded: false };
  try {
    const { rows: t } = await pool.query(
      "SELECT to_regclass('public.demo_visits') IS NOT NULL AS migrated",
    );
    if (!t[0].migrated) return { recorded: false, migrated: false };

    await pool.query(
      'INSERT INTO demo_visits (instance, path, user_agent) VALUES ($1, $2, $3)',
      [INSTANCE, req.path, String(req.headers['user-agent'] || '').slice(0, 200)],
    );
    const { rows: c } = await pool.query('SELECT count(*)::int AS total FROM demo_visits');
    const { rows: recent } = await pool.query(
      'SELECT id, visited_at, instance FROM demo_visits ORDER BY id DESC LIMIT 6',
    );
    return { recorded: true, migrated: true, total: c[0].total, recent };
  } catch (err) {
    return { recorded: false, error: err.message };
  }
}

function esc(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function badge(db) {
  if (db.state === 'connected' && db.migrated) return { cls: 'ok', text: '● Connected · schema ready' };
  if (db.state === 'connected') return { cls: 'warn', text: '● Connected · migration not run yet' };
  if (db.state === 'no-url') return { cls: 'warn', text: '● No database connected' };
  return { cls: 'err', text: '● Connection error' };
}

function renderPage(db, visit) {
  const b = badge(db);
  const recentRows = (visit.recent || [])
    .map(
      (r) =>
        `<tr><td>#${r.id}</td><td>${esc(new Date(r.visited_at).toISOString())}</td><td class="mono">${esc(r.instance)}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="10" />
<title>Liftoff DB Demo</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         background: #0b0a12; color: #e7e5ef; line-height: 1.5; }
  .wrap { max-width: 820px; margin: 0 auto; padding: 48px 24px 80px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .sub { color: #9b97b3; margin: 0 0 28px; font-size: 14px; }
  .badge { display: inline-block; padding: 8px 14px; border-radius: 999px; font-weight: 600;
           font-size: 14px; margin-bottom: 28px; border: 1px solid; }
  .badge.ok   { color: #34d399; border-color: #34d39955; background: #34d3990f; }
  .badge.warn { color: #fbbf24; border-color: #fbbf2455; background: #fbbf240f; }
  .badge.err  { color: #f87171; border-color: #f8717155; background: #f871710f; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 28px; }
  .card { background: #14121f; border: 1px solid #241f33; border-radius: 12px; padding: 16px 18px; }
  .card .k { color: #9b97b3; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .card .v { font-size: 22px; font-weight: 700; margin-top: 6px; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 13px; word-break: break-all; }
  section { margin-bottom: 28px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .04em; color: #9b97b3; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 8px 10px; border-bottom: 1px solid #1d1a2a; }
  .pre { background: #14121f; border: 1px solid #241f33; border-radius: 10px; padding: 12px 14px; }
  .btn { display: inline-block; background: #6d5efc; color: #fff; border: 0; border-radius: 10px;
         padding: 11px 18px; font-weight: 600; font-size: 14px; cursor: pointer; text-decoration: none; }
  .hint { color: #9b97b3; font-size: 13px; margin-top: 10px; }
  a { color: #a99bff; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Liftoff DB Demo</h1>
    <p class="sub">A test app for the Liftoff platform — database connection, migrations, logs, and metrics.</p>

    <div class="badge ${b.cls}">${b.text}</div>

    <div class="grid">
      <div class="card"><div class="k">Total visits (DB)</div><div class="v">${visit.total != null ? visit.total : '—'}</div></div>
      <div class="card"><div class="k">DB host</div><div class="v mono" style="font-size:15px">${esc(db.host || '—')}</div></div>
      <div class="card"><div class="k">Instance</div><div class="v mono" style="font-size:15px">${esc(INSTANCE)}</div></div>
      <div class="card"><div class="k">Uptime</div><div class="v">${uptimeSec()}s</div></div>
    </div>

    <section>
      <h2>PostgreSQL</h2>
      <div class="pre mono">${esc(db.version || db.message || 'unavailable')}</div>
    </section>

    <section>
      <h2>Injected by Liftoff</h2>
      <div class="pre mono">LIFTOFF_PROJECT = ${esc(PROJECT)}
LIFTOFF_ENVIRONMENT = ${esc(ENVIRONMENT)}
DATABASE_URL = ${connectionString ? 'set ✓ (' + esc(maskedHost()) + ')' : 'not set'}</div>
    </section>

    ${
      recentRows
        ? `<section><h2>Recent visits</h2><table><tbody>${recentRows}</tbody></table></section>`
        : db.state === 'connected' && !db.migrated
          ? `<section class="pre">The <span class="mono">demo_visits</span> table doesn't exist yet. Set the release command to
             <span class="mono">npm run migrate</span> in Liftoff and redeploy — that runs the migration as a pre-deploy job.</section>`
          : ''
    }

    <section>
      <h2>Metrics</h2>
      <a class="btn" href="/load?ms=4000">Generate CPU load (4s)</a>
      <p class="hint">Hammers the CPU for a few seconds so the CPU/memory charts in Liftoff show movement. This page auto-refreshes every 10s.</p>
    </section>
  </div>
</body>
</html>`;
}

app.get('/', async (req, res) => {
  const [db, visit] = await Promise.all([getDbStatus(), recordVisit(req)]);
  res.set('Cache-Control', 'no-store').send(renderPage(db, visit));
});

// Liftoff/App Platform healthcheck — never touches the DB so the container stays
// healthy even before a database is connected.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', instance: INSTANCE, uptimeSec: uptimeSec() });
});

// Machine-readable view of the same data.
app.get('/api/stats', async (req, res) => {
  const db = await getDbStatus();
  let total = null;
  if (pool && db.state === 'connected' && db.migrated) {
    try {
      const { rows } = await pool.query('SELECT count(*)::int AS total FROM demo_visits');
      total = rows[0].total;
    } catch {
      /* ignore */
    }
  }
  res.json({ project: PROJECT, environment: ENVIRONMENT, instance: INSTANCE, uptimeSec: uptimeSec(), db, totalVisits: total });
});

// Burns CPU on demand so the Liftoff metrics charts have something to show.
app.get('/load', (req, res) => {
  const ms = Math.min(Math.max(parseInt(req.query.ms || '4000', 10) || 4000, 500), 15000);
  const end = Date.now() + ms;
  let n = 0;
  while (Date.now() < end) {
    n += Math.sqrt(n + 1) * Math.random();
  }
  console.log(`[load] burned CPU for ${ms}ms`);
  res.json({ ok: true, burnedMs: ms });
});

// Periodic heartbeat so the runtime logs always show signs of life.
setInterval(() => {
  const rss = Math.round(process.memoryUsage().rss / 1048576);
  console.log(`[heartbeat] instance=${INSTANCE} uptime=${uptimeSec()}s rss=${rss}MB`);
}, 15000).unref();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[boot] liftoff-demo listening on :${PORT}`);
  console.log(`[boot] project=${PROJECT} environment=${ENVIRONMENT} instance=${INSTANCE}`);
  console.log(`[boot] DATABASE_URL ${connectionString ? 'is set (' + maskedHost() + ')' : 'is NOT set'}`);
});

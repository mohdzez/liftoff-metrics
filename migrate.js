'use strict';

// Release command — set it in Liftoff (service settings → "Release command":
// `npm run migrate`). Liftoff runs it as a PRE_DEPLOY job using this same image,
// with DATABASE_URL injected when you draw an edge from a PostgreSQL resource to
// this service. Designed to be safe to run on every deploy:
//   - no DATABASE_URL  -> skip (exit 0), so a service with no DB still deploys
//   - DB not ready yet -> retry (a freshly-provisioned cluster takes a moment to
//                          accept connections / propagate the trusted-source rule)
//   - real SQL error   -> fail (exit 1), so App Platform rolls the deploy back

const { createPool, connectionString } = require('./db');

function maskedHost() {
  try {
    const u = new URL(connectionString);
    return `${u.hostname}:${u.port || '5432'}`;
  } catch {
    return 'unknown';
  }
}

async function connectWithRetry(pool, attempts = 12, delayMs = 5000) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.error(`[migrate] connect attempt ${i}/${attempts} failed: ${err.message}`);
      if (i === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  if (!connectionString) {
    console.log('[migrate] DATABASE_URL is not set — skipping migration.');
    console.log('[migrate] Draw an edge from a PostgreSQL resource to this service, then redeploy to run it.');
    return; // exit 0 — don't block the deploy when there is no database connected
  }

  console.log(`[migrate] DATABASE_URL points at ${maskedHost()} — connecting…`);
  const pool = createPool();
  await connectWithRetry(pool);
  console.log('[migrate] connected. applying schema…');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS demo_visits (
      id         BIGSERIAL PRIMARY KEY,
      visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      instance   TEXT,
      path       TEXT,
      user_agent TEXT
    );
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS demo_visits_visited_at_idx ON demo_visits (visited_at DESC);',
  );

  const { rows } = await pool.query('SELECT count(*)::int AS total FROM demo_visits');
  console.log(`[migrate] schema is up to date. demo_visits row count: ${rows[0].total}`);
  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});

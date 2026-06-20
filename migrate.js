'use strict';

// This is the "release command" — set it in Liftoff (service settings →
// "Release command": `npm run migrate`). Liftoff runs it as a PRE_DEPLOY job
// using this same image, with DATABASE_URL injected from the connected DB, and
// rolls the deploy back if it fails. It's idempotent, so it's safe every deploy.

const { createPool } = require('./db');

async function main() {
  const pool = createPool();
  if (!pool) {
    console.error('[migrate] DATABASE_URL is not set — connect a database first.');
    process.exit(1);
  }

  console.log('[migrate] applying schema…');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS demo_visits (
      id         BIGSERIAL PRIMARY KEY,
      visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      instance   TEXT,
      path       TEXT,
      user_agent TEXT
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS demo_visits_visited_at_idx ON demo_visits (visited_at DESC);');

  const { rows } = await pool.query('SELECT count(*)::int AS total FROM demo_visits');
  console.log(`[migrate] schema is up to date. demo_visits row count: ${rows[0].total}`);

  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});

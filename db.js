'use strict';

const { Pool } = require('pg');

// Liftoff injects DATABASE_URL into this service when you draw an edge from a
// PostgreSQL resource to it on the canvas (and deploy).
const connectionString = process.env.DATABASE_URL || '';

/**
 * Creates a pg Pool, or returns null when DATABASE_URL is unset (so the app can
 * still boot and show a "no database connected yet" state instead of crashing).
 *
 * DigitalOcean managed Postgres requires TLS (the connection string carries
 * `sslmode=require`). `pg` doesn't fully honour `sslmode` from the URL, so we
 * enable SSL explicitly. DO presents a CA-signed cert, but to keep this demo
 * dependency-free we don't ship the CA bundle and just disable verification —
 * fine for a test app, not what you'd do for production data.
 */
function createPool() {
  if (!connectionString) return null;

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/i.test(connectionString);
  const wantsSsl = /sslmode=require/i.test(connectionString) || !isLocal;

  return new Pool({
    connectionString,
    ssl: wantsSsl ? { rejectUnauthorized: false } : false,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
}

module.exports = { createPool, connectionString };

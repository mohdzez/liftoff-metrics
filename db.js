'use strict';

const { Pool } = require('pg');

// Liftoff injects DATABASE_URL into this service when you draw an edge from a
// PostgreSQL resource to it on the canvas (and deploy).
const connectionString = process.env.DATABASE_URL || '';

/**
 * Creates a pg Pool, or returns null when DATABASE_URL is unset (so the app can
 * still boot and show a "no database connected" state instead of crashing).
 *
 * DigitalOcean managed Postgres requires TLS and presents a CA-signed cert that
 * Node treats as "self-signed" unless you ship DO's CA bundle. We accept it with
 * `rejectUnauthorized: false` (fine for a test app, not production data).
 *
 * IMPORTANT: newer `pg`/`pg-connection-string` parse `sslmode=require` from the
 * URL and apply FULL verification (verify-full), which OVERRIDES the `ssl` option
 * and fails with "self-signed certificate in certificate chain". So we strip
 * `sslmode` from the URL and configure TLS explicitly here instead.
 */
function createPool() {
  if (!connectionString) return null;

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/i.test(connectionString);

  let url = connectionString;
  let urlWantsSsl = false;
  try {
    const parsed = new URL(connectionString);
    const sslmode = parsed.searchParams.get('sslmode');
    urlWantsSsl = Boolean(sslmode) && sslmode !== 'disable';
    parsed.searchParams.delete('sslmode');
    url = parsed.toString();
  } catch {
    // Non-URL connection string — leave it as-is.
  }

  const useSsl = urlWantsSsl || !isLocal;

  return new Pool({
    connectionString: url,
    // A truthy ssl object enables TLS regardless of the (now sslmode-free) URL.
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
}

module.exports = { createPool, connectionString };

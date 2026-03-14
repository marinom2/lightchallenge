/**
 * offchain/db/sslConfig.ts
 *
 * Centralised SSL configuration for all pg.Pool instances.
 *
 * In production, SSL certificate verification is enforced (ssl: true).
 * In non-production environments, self-signed certificates are accepted
 * (rejectUnauthorized: false) to support local development and staging
 * databases (e.g. Neon).
 */

export function sslConfig(): true | { rejectUnauthorized: false } {
  if (process.env.NODE_ENV === "production") return true;
  return { rejectUnauthorized: false };
}

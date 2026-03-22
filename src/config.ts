/**
 * Centralized configuration — all environment variable reads happen here.
 *
 * Every process.env access in the application should be expressed as a
 * typed field on this object so that the full configuration surface is
 * visible in one place and can be validated/documented together.
 */

export const config = {
  /** HTTP server port (default: 3333) */
  port: parseInt(process.env.PORT ?? '3333', 10),

  /** HTTP server host (default: 0.0.0.0) */
  host: process.env.HOST ?? '0.0.0.0',

  /** Fastify / pino log level (default: info) */
  logLevel: process.env.LOG_LEVEL ?? 'info',

  /** Database backend: 'sqlite' (default) or 'postgres' */
  dbBackend: (process.env.DB_BACKEND ?? 'sqlite') as 'sqlite' | 'postgres',

  /** SQLite file path (default: <cwd>/data/ogi.sqlite) */
  dbPath: process.env.DB_PATH as string | undefined,

  /** PostgreSQL connection string — required when dbBackend === 'postgres' */
  databaseUrl: process.env.DATABASE_URL as string | undefined,

  /** Whether to enforce SSL on the PostgreSQL connection (default: true) */
  dbSsl: process.env.DB_SSL !== 'false',

  cors: {
    /** Allowed CORS origin (default: *) */
    origin: process.env.CORS_ORIGIN ?? '*',

    /** Allowed CORS methods (default: GET,POST,OPTIONS) */
    methods: (process.env.CORS_METHODS ?? 'GET,POST,OPTIONS').split(','),
  },

  rateLimit: {
    /** Maximum requests per window per IP (default: 100) */
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),

    /** Rate-limit window in milliseconds (default: 60 000) */
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  },

  api: {
    /**
     * Maximum number of items accepted in a batch calculation request
     * (default: 50).
     */
    batchMaxItems: parseInt(process.env.BATCH_MAX_ITEMS ?? '50', 10),

    /**
     * When true, every request without a valid X-Api-Key header is rejected
     * with 401. When false (default), unauthenticated requests are allowed
     * but gain no elevated tier.
     */
    keyRequired: process.env.API_KEY_REQUIRED === 'true',
  },

  admin: {
    /** Mount and enable the admin UI (default: true) */
    enabled: process.env.ENABLE_ADMIN !== 'false',

    /** Default admin username seeded on first boot (default: admin) */
    username: process.env.ADMIN_USERNAME ?? 'admin',

    /** Default admin password seeded on first boot (default: admin) */
    password: process.env.ADMIN_PASSWORD ?? 'admin',
  },

  metrics: {
    /** Expose the Prometheus /metrics endpoint (default: true) */
    enabled: process.env.ENABLE_METRICS !== 'false',
  },

  audit: {
    /** Record every API request in the audit_log table (default: true) */
    enabled: process.env.ENABLE_AUDIT_LOG !== 'false',
  },
} as const;

export type Config = typeof config;

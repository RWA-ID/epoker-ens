/** Worker bindings — see wrangler.toml. */
export interface Env {
  /** Durable Object namespace: one instance per poker table. */
  TABLES: DurableObjectNamespace;
  /** D1 database: bankrolls, leaderboard stats, table registry. */
  DB: D1Database;
}

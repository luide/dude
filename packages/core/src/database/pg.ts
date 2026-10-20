/* oxlint-disable */
import { Layer, Redacted } from "effect"
import { PgClient } from "@effect/sql-pg"
// Postgres has no SQLite tuning/foreign-key pragmas; the database.ts guards skip them.
export const supportsTuningPragmas = false
export const supportsForeignKeyToggle = false

/**
 * Build a Postgres SqlClient layer. Connection is taken from OPENCODE_DATABASE_URL
 * (e.g. postgresql://dude@/dude?host=/run/postgresql), else from the
 * PGHOST/PGDATABASE/PGUSER environment, defaulting to the local socket + `dude` db.
 *
 * When `schema` is set, every physical connection pins `search_path` to it, so the
 * unqualified tables and functions the bootstrap creates land in that schema. This is
 * how a test run or an embedder isolates itself inside a shared database.
 */
export const pgLayer = (config?: { schema?: string }) => {
  const url = process.env["OPENCODE_DATABASE_URL"]
  const search_path = config?.schema
  // The pool reaps idle connections on a `Clock` timer. Tests drive that clock with
  // `TestClock`, so a jump past the default 60s would close connections mid-test.
  // Tests raise this to keep the pool stable across clock jumps.
  const idleTimeout = process.env["OPENCODE_DATABASE_IDLE_TIMEOUT"]  // Postgres is a shared-server dependency: a connection failure is a boot defect,
  // not a recoverable layer error, so callers keep a `never` error contract.
  return (
    url
      ? PgClient.layer({
          url: Redacted.make(url),
          ...(search_path ? { startupParameters: { search_path } } : {}),
          ...(idleTimeout ? { idleTimeout: Number(idleTimeout) } : {}),
        })
      : PgClient.layer({
          host: process.env["PGHOST"] ?? "/run/postgresql",
          database: process.env["PGDATABASE"] ?? "dude",
          username: process.env["PGUSER"] ?? "dude",
          ...(process.env["PGPASSWORD"] ? { password: Redacted.make(process.env["PGPASSWORD"]) } : {}),
          ...(search_path ? { startupParameters: { search_path } } : {}),
          ...(idleTimeout ? { idleTimeout: Number(idleTimeout) } : {}),
        })
  ).pipe(Layer.orDie)
}

export * as DatabaseMigration from "./migration.js"

import { sql } from "drizzle-orm"
import { Effect } from "effect"
import type { EffectDrizzlePg } from "./drizzle-pg.js"
import type { PgEffectTransaction } from "./drizzle/pg-core/effect/session.js"
import { migrations } from "./migration.gen.js"
import schema from "./schema.gen.js"

type Database = EffectDrizzlePg.EffectPgDatabase
type Transaction = PgEffectTransaction<any, any, any>

export type Migration = {
  id: string
  up: (tx: Transaction) => Effect.Effect<void, unknown>
}

// Postgres-only bootstrap. Not serialized here: the Database layer holds a lock
// scoped to the database it is bootstrapping, since two instances over one
// database must not race.
export function apply(db: Database) {
  return Effect.gen(function* () {
    // OpenCode owns the unprefixed table namespace. Embedders sharing this
    // database may own underscore-prefixed tables, which bootstrap ignores.
    const tables = yield* db.all<{ name: string }>(
      sql`SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema() AND left(tablename, 1) <> '_'`,
    )
    if (tables.some((table) => table.name === "session" || table.name === "session_v2"))
      return yield* applyOnly(db, migrations)
    if (tables.length > 0) return yield* Effect.die(new Error("Database is not empty and has no session table"))
    const started = Date.now()
    yield* Effect.logInfo("database schema bootstrap started", { migrations: migrations.length })
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        // Independent processes and layers sharing one database can bootstrap at once.
        // The transaction-scoped advisory lock serializes them, and the re-check lets
        // every loser skip the DDL instead of failing on an existing function or table.
        yield* tx.run(sql`SELECT pg_advisory_xact_lock(hashtext('opencode:database:bootstrap')::bigint)`)
        const existing = yield* tx.all<{ name: string }>(
          sql`SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema() AND left(tablename, 1) <> '_'`,
        )
        if (existing.length > 0) return
        yield* schema.up(tx)
        yield* tx.run(
          sql`CREATE TABLE ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed double precision NOT NULL)`,
        )
        yield* Effect.forEach(migrations, (migration) =>
          tx.run(
            sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
          ),
        )
      }),
    )
    yield* Effect.logInfo("database schema bootstrap completed", {
      migrations: migrations.length,
      durationMs: Date.now() - started,
    })
  })
}

export function applyOnly(db: Database, input: Migration[]) {
  return Effect.gen(function* () {
    yield* db.run(
      sql`CREATE TABLE IF NOT EXISTS ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed double precision NOT NULL)`,
    )
    const completed = new Set(
      (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")}`)).map((row) => row.id),
    )
    for (const migration of input) {
      if (completed.has(migration.id)) continue
      const started = Date.now()
      yield* Effect.logInfo("database migration started", { migration: migration.id })
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* migration.up(tx)
            yield* tx.run(
              sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
            )
          }),
        )
        .pipe(
          Effect.tapError((error) =>
            Effect.logError("database migration failed", {
              migration: migration.id,
              durationMs: Date.now() - started,
              error,
            }),
          ),
        )
      yield* Effect.logInfo("database migration completed", {
        migration: migration.id,
        durationMs: Date.now() - started,
      })
    }
  })
}
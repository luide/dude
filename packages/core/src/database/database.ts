export * as Database from "./database.js"

import { sql } from "drizzle-orm"
import { EffectDrizzlePg } from "./drizzle-pg.js"
import { pgLayer } from "./pg.js"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { Global } from "@opencode/util/global"
import { DatabaseMigration } from "./migration.js"
import { makeGlobalNode } from "@opencode/util/effect/app-node"

const makeDatabase = EffectDrizzlePg.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export const Options = Schema.Struct({
  // Postgres shares one database between tenants; an explicit schema, or the
  // OPENCODE_DATABASE_SCHEMA default, pins every connection's `search_path` so the
  // bootstrap lands in an isolated namespace. Tests use this for per-test isolation.
  schema: Schema.optional(Schema.String),
})
export type Options = typeof Options.Type

export class Service extends Context.Service<Service, Interface>()("@opencode/storage/Database") {}

// Postgres is a shared server: a single bootstrap lock guards schema creation.
// Connection details come from pg.ts (OPENCODE_DATABASE_URL or PGHOST/PGDATABASE).
const databaseLayer = (schema: string | undefined) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const db = yield* makeDatabase
      const semaphore = yield* Semaphore.make(1)
      if (schema) yield* db.run(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(schema)}`)
      yield* semaphore.withPermit(DatabaseMigration.apply(db))
      return { db }
    }).pipe(Effect.orDie),
  )

export function layer(options: Options = {}) {
  return Layer.unwrap(
    Effect.sync(() => {
      const schema = options.schema ?? process.env["OPENCODE_DATABASE_SCHEMA"] ?? undefined
      return databaseLayer(schema).pipe(Layer.provide(pgLayer({ schema })))
    }),
  )
}

export function configured(options?: Options) {
  return makeGlobalNode({ service: Service, layer: layer(options), deps: [Global.node] })
}

export const node = configured()
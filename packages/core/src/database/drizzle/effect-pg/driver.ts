/* oxlint-disable */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { SqlClient } from "effect/sql/SqlClient"
import { EffectCache } from "drizzle-orm/cache/core/cache-effect"
import { EffectLogger } from "drizzle-orm/effect-core"
import { entityKind } from "drizzle-orm/entity"
import type { AnyRelations, EmptyRelations } from "drizzle-orm/relations"
import { PgDialect } from "drizzle-orm/pg-core/dialect"
import type { DrizzleConfig } from "drizzle-orm/utils"
import { PgEffectDatabase } from "../pg-core/effect/db.js"
import { type EffectPgQueryEffectHKT, type EffectPgQueryResultHKT, EffectPgSession } from "./session.js"

export class EffectPgDatabase<TRelations extends AnyRelations = EmptyRelations> extends PgEffectDatabase<
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
  TRelations
> {
  static override readonly [entityKind]: string = "EffectPgDatabase"
}

export type EffectDrizzlePgConfig<TRelations extends AnyRelations = EmptyRelations> = Omit<
  DrizzleConfig<Record<string, never>, TRelations>,
  "cache" | "logger" | "schema"
>

export const DefaultServices = Layer.merge(EffectCache.Default, EffectLogger.Default)

/**
 * Creates an EffectPgDatabase instance.
 *
 * Requires a generic Effect `SqlClient`, `EffectLogger`, and `EffectCache` services to be provided.
 * Provide a Postgres `SqlClient` via `@effect/sql-pg`'s `PgClient.layer({ url })`.
 */
export const make = Effect.fn("PgDrizzle.make")(function* <TRelations extends AnyRelations = EmptyRelations>(
  config: EffectDrizzlePgConfig<TRelations> = {},
) {
  const client = yield* SqlClient
  const cache = yield* EffectCache
  const logger = yield* EffectLogger

  const dialect = new PgDialect()
  const relations = config.relations ?? ({} as TRelations)
  const session = new EffectPgSession(client, dialect, relations, {
    logger,
    cache,
  })
  const db = new EffectPgDatabase(dialect, session, relations) as EffectPgDatabase<TRelations> & {
    $client: SqlClient
  }
  db.$client = client
  db.$cache.invalidate = cache.onMutate

  return db
})

export const makeWithDefaults = <TRelations extends AnyRelations = EmptyRelations>(
  config: EffectDrizzlePgConfig<TRelations> = {},
) => make(config).pipe(Effect.provide(DefaultServices))
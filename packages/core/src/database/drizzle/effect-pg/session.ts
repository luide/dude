/* oxlint-disable */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Scope from "effect/Scope"
import type { SqlClient } from "effect/sql/SqlClient"
import type { SqlError } from "effect/sql/SqlError"
import type { EffectCacheShape } from "drizzle-orm/cache/core/cache-effect"
import type { WithCacheConfig } from "drizzle-orm/cache/core/types"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import type { EffectLoggerShape } from "drizzle-orm/effect-core/logger"
import type { QueryEffectHKTBase } from "drizzle-orm/effect-core/query-effect"
import { entityKind } from "drizzle-orm/entity"
import type { AnyRelations } from "drizzle-orm/relations"
import type { Query } from "drizzle-orm/sql/sql"
import type { PgDialect } from "drizzle-orm/pg-core/dialect"
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from "drizzle-orm/pg-core/session"
import { PgEffectPreparedQuery, PgEffectSession, PgEffectTransaction } from "../pg-core/effect/session.js"

export interface EffectPgQueryEffectHKT extends QueryEffectHKTBase {
  readonly error: EffectDrizzleQueryError
  readonly context: never
}

export interface EffectPgQueryResultHKT extends PgQueryResultHKT {
  readonly type: unknown
}

export type PgPrepareMode = "arrays" | "objects" | "raw"

export interface EffectPgSessionOptions {
  logger: EffectLoggerShape
  cache: EffectCacheShape
}

export class EffectPgSession<TRelations extends AnyRelations> extends PgEffectSession<
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
  TRelations
> {
  static override readonly [entityKind]: string = "EffectPgSession"

  constructor(
    private client: SqlClient,
    dialect: PgDialect,
    protected relations: TRelations,
    private options: EffectPgSessionOptions,
  ) {
    super(dialect)
  }

  override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
    query: Query,
    mode: PgPrepareMode,
    _name: string | boolean,
    mapper?: (rows: any[]) => any,
    queryMetadata?: {
      type: "select" | "update" | "delete" | "insert"
      tables: string[]
    },
    cacheConfig?: WithCacheConfig,
  ): PgEffectPreparedQuery<T, EffectPgQueryEffectHKT> {
    return new PgEffectPreparedQuery<T, EffectPgQueryEffectHKT>(
      (params) => this.executeStatement(query, (params ?? []) as unknown[], mode),
      query,
      mapper,
      mode,
      this.options.logger,
      this.options.cache,
      queryMetadata,
      cacheConfig,
    )
  }

  private executeStatement(query: Query, params: unknown[], mode: PgPrepareMode) {
    const statement = this.client.unsafe(query.sql, params as ReadonlyArray<any>)
    if (mode === "arrays") return statement.values.pipe(Effect.withTracerEnabled(false))
    return statement.withoutTransform.pipe(Effect.withTracerEnabled(false))
  }

  private executeTransactionStatement(connection: Effect.Success<SqlClient["reserve"]>, query: string) {
    return connection.executeUnprepared(query, [], undefined).pipe(Effect.asVoid)
  }

  private withTransaction<A, E, R>(effect: Effect.Effect<A, E, R>, _config: PgTransactionConfig | undefined) {
    return Effect.uninterruptibleMask((restore) =>
      Effect.withFiber<A, E | SqlError, R>((fiber) => {
        const services = fiber.context
        const connectionOption = Context.getOption(services, this.client.transactionService)
        const connection: Effect.Effect<
          readonly [Scope.Closeable | undefined, Effect.Success<SqlClient["reserve"]>],
          SqlError
        > =
          connectionOption._tag === "Some"
            ? Effect.succeed([undefined, connectionOption.value[0]] as const)
            : Scope.make().pipe(
                Effect.flatMap((scope) =>
                  Scope.provide(this.client.reserve, scope).pipe(
                    Effect.map((connection) => [scope, connection] as const),
                    Effect.catch((error) =>
                      Scope.close(scope, Exit.fail(error)).pipe(Effect.andThen(Effect.fail(error))),
                    ),
                  ),
                ),
              )
        const id = connectionOption._tag === "Some" ? connectionOption.value[1] + 1 : 0

        return connection.pipe(
          Effect.flatMap(([scope, connection]) => {
            const transaction = this.executeTransactionStatement(
              connection,
              id === 0 ? `begin` : `savepoint effect_sql_${id}`,
            ).pipe(
              Effect.flatMap(() =>
                Effect.provideContext(
                  restore(effect),
                  Context.add(services, this.client.transactionService, [connection, id]),
                ).pipe(
                  Effect.exit,
                  Effect.flatMap((exit) => {
                    const finalize = Exit.isSuccess(exit)
                      ? id === 0
                        ? this.executeTransactionStatement(connection, "commit").pipe(
                            Effect.catch((error) =>
                              this.executeTransactionStatement(connection, "rollback").pipe(
                                Effect.catch(() => Effect.void),
                                Effect.andThen(Effect.fail(error)),
                              ),
                            ),
                          )
                        : this.executeTransactionStatement(connection, `release savepoint effect_sql_${id}`)
                      : id === 0
                        ? this.executeTransactionStatement(connection, "rollback")
                        : this.executeTransactionStatement(connection, `rollback to savepoint effect_sql_${id}`).pipe(
                            Effect.andThen(
                              this.executeTransactionStatement(connection, `release savepoint effect_sql_${id}`),
                            ),
                          )

                    return finalize.pipe(Effect.flatMap(() => exit))
                  }),
                ),
              ),
            )

            return scope === undefined
              ? transaction
              : transaction.pipe(Effect.onExit((exit) => Scope.close(scope, exit)))
          }),
        )
      }),
    )
  }

  override transaction<A, E, R>(
    transaction: (tx: PgEffectTransaction<EffectPgQueryEffectHKT, EffectPgQueryResultHKT, TRelations>) => Effect.Effect<A, E, R>,
    config?: PgTransactionConfig,
  ): Effect.Effect<A, E | SqlError, R> {
    const { dialect, relations } = this

    return this.withTransaction(
      Effect.gen({ self: this }, function* () {
        const tx = new EffectPgTransaction<TRelations>(dialect, this, relations)

        return yield* transaction(tx)
      }),
      config,
    )
  }
}

export class EffectPgTransaction<TRelations extends AnyRelations> extends PgEffectTransaction<
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
  TRelations
> {
  static override readonly [entityKind]: string = "EffectPgTransaction"

  override transaction = <A, E, R>(
    transaction: (
      tx: PgEffectTransaction<EffectPgQueryEffectHKT, EffectPgQueryResultHKT, TRelations>,
    ) => Effect.Effect<A, E, R>,
  ): Effect.Effect<A, SqlError | E, R> => ((this as any).session as EffectPgSession<TRelations>).transaction(transaction)
}

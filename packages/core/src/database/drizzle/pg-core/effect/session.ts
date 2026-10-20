/* oxlint-disable */
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/sql/SqlError';
import { EffectCache, type EffectCacheShape } from 'drizzle-orm/cache/core/cache-effect';
import { NoopCache, strategyFor } from 'drizzle-orm/cache/core/cache';
import type { WithCacheConfig } from 'drizzle-orm/cache/core/types';
import { MigratorInitError } from 'drizzle-orm/effect-core/errors';
import { EffectDrizzleQueryError, EffectTransactionRollbackError } from 'drizzle-orm/effect-core/errors';
import type { EffectLoggerShape } from 'drizzle-orm/effect-core/logger';
import type { QueryEffectHKTBase, QueryEffectKind } from 'drizzle-orm/effect-core/query-effect';
import { entityKind, is } from 'drizzle-orm/entity';
import type { MigrationConfig, MigrationMeta } from 'drizzle-orm/migrator';
import { getMigrationsToRun } from 'drizzle-orm/migrator.utils';
import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations';
import { fillPlaceholders, type Query, type SQL, sql } from 'drizzle-orm/sql/sql';
import { upgradeIfNeeded } from 'drizzle-orm/up-migrations/effect-pg';
import { assertUnreachable } from 'drizzle-orm/utils';
import type { PgDialect } from 'drizzle-orm/pg-core/dialect';
import {
	PgBasePreparedQuery,
	type PgQueryResultHKT,
	PgSession,
	type PgTransactionConfig,
	type PreparedQueryConfig,
} from 'drizzle-orm/pg-core/session';
import { PgEffectDatabase } from './db.js';

export class PgEffectPreparedQuery<
	T extends PreparedQueryConfig,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgBasePreparedQuery {
	static override readonly [entityKind]: string = 'PgEffectPreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;

	constructor(
		protected executor: (params?: unknown[]) => Effect.Effect<unknown, unknown, unknown>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
		private logger: EffectLoggerShape,
		// cache instance
		protected cache: EffectCacheShape,
		// per query related metadata
		protected queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		// config that was passed through $withCache
		protected cacheConfig: WithCacheConfig | undefined,
	) {
		super(query);
		this.mapper = mapper;
		if (cache && cache.strategy() === 'all' && cacheConfig === undefined) {
			this.cacheConfig = { enabled: true, autoInvalidate: true };
		}
		if (!this.cacheConfig?.enabled) {
			this.cacheConfig = undefined;
		}
	}

	override execute(placeholderValues: Record<string, unknown> = {}): QueryEffectKind<TEffectHKT, T['execute']> {
		return this.executeMapped(placeholderValues, true) as QueryEffectKind<TEffectHKT, T['execute']>;
	}

	run(
		placeholderValues: Record<string, unknown> = {},
	): QueryEffectKind<TEffectHKT, T extends { run: infer R } ? R : unknown> {
		return this.executeMapped(placeholderValues, true) as QueryEffectKind<
			TEffectHKT,
			T extends { run: infer R } ? R : unknown
		>;
	}

	all(
		placeholderValues: Record<string, unknown> = {},
	): QueryEffectKind<TEffectHKT, T extends { all: infer R } ? R : unknown> {
		return this.executeMapped(placeholderValues, true) as QueryEffectKind<
			TEffectHKT,
			T extends { all: infer R } ? R : unknown
		>;
	}

	get(
		placeholderValues: Record<string, unknown> = {},
	): QueryEffectKind<TEffectHKT, T extends { get: infer R } ? R : unknown> {
		return this.executeMapped(placeholderValues, true).pipe(
			Effect.map((rows: unknown) => (Array.isArray(rows) ? rows[0] : rows)),
		) as QueryEffectKind<TEffectHKT, T extends { get: infer R } ? R : unknown>;
	}

	values(
		placeholderValues: Record<string, unknown> = {},
	): QueryEffectKind<TEffectHKT, T extends { values: infer R } ? R : unknown> {
		return this.executeMapped(placeholderValues, false) as QueryEffectKind<
			TEffectHKT,
			T extends { values: infer R } ? R : unknown
		>;
	}

	private executeMapped(placeholderValues: Record<string, unknown>, applyMapper: boolean) {
		return Effect.gen({ self: this }, function*() {
			const params = fillPlaceholders(this.query.params, placeholderValues);
			const { query: { sql }, mapper, logger } = this;

			yield* logger.logQuery(sql, params);

			const query = this.queryWithCache(sql, params, Effect.suspend(() => this.executor(params)));

			if (!applyMapper || !mapper) return yield* query;

			return yield* query.pipe(Effect.map((rows) => mapper(rows as unknown[])));
		});
	}

	/** @internal */
	protected queryWithCache<A, E, R>(
		queryString: string,
		params: any[],
		query: Effect.Effect<A, E, R>,
	) {
		return Effect.gen({ self: this }, function*() {
			const { cacheConfig, queryMetadata } = this;
			const cache = yield* EffectCache;

			const cacheStrat: Awaited<ReturnType<typeof strategyFor>> = cache && !(cache.cache && is(cache.cache, NoopCache))
				? yield* Effect.tryPromise(
					() => strategyFor(queryString, params, queryMetadata, cacheConfig),
				)
				: { type: 'skip' as const };

			if (cacheStrat.type === 'skip') {
				return yield* query;
			}

			// For mutate queries, we should query the database, wait for a response, and then perform invalidation
			if (cacheStrat.type === 'invalidate') {
				const result = yield* query;
				yield* cache!.onMutate({ tables: cacheStrat.tables });

				return result;
			}

			if (cacheStrat.type === 'try') {
				const { tables, key, isTag, autoInvalidate, config } = cacheStrat;
				const fromCache: any[] | undefined = yield* cache!.get(
					key,
					tables,
					isTag,
					autoInvalidate,
				);

				if (typeof fromCache !== 'undefined') return fromCache as unknown as A;

				const result = yield* query;

				yield* cache!.put(
					key,
					result,
					autoInvalidate ? tables : [],
					isTag,
					config,
				);

				return result;
			}

			assertUnreachable(cacheStrat);
		}).pipe(
			Effect.provideService(EffectCache, this.cache),
			Effect.catch((e) => {
				return Effect.fail(new EffectDrizzleQueryError({ query: queryString, params, cause: Cause.fail(e) }));
			}),
		);
	}
}

export abstract class PgEffectSession<
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgSession {
	static override readonly [entityKind]: string = 'PgEffectSession';

	constructor(dialect: PgDialect) {
		super(dialect);
	}

	abstract override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		name: string | boolean,
		mapper?: (rows: any[]) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgEffectPreparedQuery<T, TEffectHKT>;

	override execute<T>(query: SQL) {
		const prepared = this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'raw',
			false,
		);

		return prepared.execute();
	}

	override arrays<T>(query: SQL) {
		const prepared = this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'arrays',
			false,
		);

		return prepared.execute();
	}

	override objects<T>(query: SQL) {
		const prepared = this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
			this.dialect.sqlToQuery(query),
			'objects',
			false,
		);

		return prepared.execute();
	}

	abstract transaction<A, E, R>(
		transaction: (
			tx: PgEffectTransaction<TEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
		config?: PgTransactionConfig,
	): Effect.Effect<A, E | SqlError, R>;
}

export abstract class PgEffectTransaction<
	TEffectHKT extends QueryEffectHKTBase,
	TQueryResult extends PgQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgEffectDatabase<TEffectHKT, TQueryResult, TRelations> {
	static override readonly [entityKind]: string = 'PgEffectTransaction';

	constructor(
		dialect: PgDialect,
		session: PgEffectSession<TEffectHKT, any, any>,
		protected relations: TRelations,
		protected readonly nestedIndex = 0,
		parseRqbJson?: boolean,
	) {
		super(dialect, session, relations, parseRqbJson);
	}

	rollback() {
		return new EffectTransactionRollbackError();
	}

	/** @internal */
	getTransactionConfigChunks(config: PgTransactionConfig): string[] {
		const chunks: string[] = [];
		if (config.isolationLevel) {
			chunks.push(`isolation level ${config.isolationLevel}`);
		}
		if (config.accessMode) {
			chunks.push(config.accessMode);
		}
		if (typeof config.deferrable === 'boolean') {
			chunks.push(config.deferrable ? 'deferrable' : 'not deferrable');
		}
		return chunks;
	}

	/** @internal */
	getTransactionConfigSQL(config: PgTransactionConfig): SQL {
		return sql.raw(this.getTransactionConfigChunks(config).join(' '));
	}

	/** @internal */
	setTransactionSnapshotSQL(snapshot: string): SQL {
		return sql`set transaction snapshot ${snapshot}`.inlineParams();
	}

	/** @internal */
	getTransactionConfigStatements(config: PgTransactionConfig): string[] {
		const statements: string[] = [];

		const chunks = this.getTransactionConfigChunks(config);
		if (chunks.length) statements.push(`set transaction ${chunks.join(' ')}`);

		if (typeof config.snapshot === 'string') {
			statements.push(this.dialect.sqlToQuery(this.setTransactionSnapshotSQL(config.snapshot)).sql);
		}

		return statements;
	}

	setTransaction(config: PgTransactionConfig) {
		const chunks = this.getTransactionConfigChunks(config);
		const setOptions = chunks.length
			? Effect.asVoid(this.session.execute<void>(sql.raw(`set transaction ${chunks.join(' ')}`)))
			: Effect.void;

		if (typeof config.snapshot === 'string') {
			return Effect.flatMap(
				setOptions,
				() => Effect.asVoid(this.session.execute<void>(this.setTransactionSnapshotSQL(config.snapshot!))),
			);
		}
		return setOptions;
	}

	abstract override transaction<A, E, R>(
		transaction: (
			tx: PgEffectTransaction<TEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | SqlError, R>;
}

export const migrate = Effect.fn('migrate')(function*<TEffectHKT extends QueryEffectHKTBase>(
	migrations: MigrationMeta[],
	session: PgEffectSession<TEffectHKT>,
	config: string | MigrationConfig,
) {
	const migrationsTable = typeof config === 'string'
		? '__drizzle_migrations'
		: config.migrationsTable ?? '__drizzle_migrations';
	const migrationsSchema = typeof config === 'string' ? 'drizzle' : config.migrationsSchema ?? 'drizzle';

	yield* session.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);

	// upgradeIfNeeded comes from drizzle's published effect-pg entry, which types its session
	// parameter against drizzle's own PgEffectSession. Our vendored session is a separate class
	// with the same runtime shape, so the cast is structural rather than a real mismatch.
	const { newDb } = yield* upgradeIfNeeded(migrationsSchema, migrationsTable, session as any, migrations);

	if (newDb) {
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at bigint,
				name text,
				applied_at timestamp with time zone DEFAULT now()
			)
		`;

		yield* session.execute(migrationTableCreate);
	}

	const dbMigrations = yield* session.objects<{ id: number; hash: string; created_at: string; name: string | null }>(
		sql`select id, hash, created_at, name from ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`,
	);

	if (typeof config === 'object' && (config as { init?: boolean }).init) {
		if (dbMigrations.length) {
			return yield* new MigratorInitError({ exitCode: 'databaseMigrations' });
		}

		if (migrations.length > 1) {
			return yield* new MigratorInitError({ exitCode: 'localMigrations' });
		}

		const [migration] = migrations;

		if (!migration) return;

		yield* session.execute(
			sql`insert into ${sql.identifier(migrationsSchema)}.${
				sql.identifier(migrationsTable)
			} ("hash", "created_at", "name") values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
		);

		return;
	}

	const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations });

	yield* session.transaction((tx) =>
		Effect.gen(function*() {
			for (const migration of migrationsToRun) {
				for (const stmt of migration.sql) {
					yield* tx.execute(sql.raw(stmt));
				}
				yield* tx.execute(
					sql`insert into ${sql.identifier(migrationsSchema)}.${
						sql.identifier(migrationsTable)
					} ("hash", "created_at", "name") values(${migration.hash}, ${migration.folderMillis}, ${migration.name})`,
				);
			}
		})
	);
});

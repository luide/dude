/* oxlint-disable */
import * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from 'drizzle-orm/effect-core/query-effect';
import { entityKind } from 'drizzle-orm/entity';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from 'drizzle-orm/pg-core/session';
import type { PgTable } from 'drizzle-orm/pg-core/table';
import type { RunnableQuery } from 'drizzle-orm/runnable-query';
import type { ColumnsSelection } from 'drizzle-orm/sql/sql';
import type { Assume } from 'drizzle-orm/utils';
import type { PgInsertHKTBase } from 'drizzle-orm/pg-core/query-builders/insert';
import { PgInsertBase } from 'drizzle-orm/pg-core/query-builders/insert';
import { extractUsedTable } from 'drizzle-orm/pg-core/utils';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.js';

export interface PgEffectInsertHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase> extends PgInsertHKTBase {
	_type: PgEffectInsertBase<
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		this['selectedFields'],
		this['returning'],
		this['dynamic'],
		this['excludedMethods'],
		TEffectHKT
	>;
}

export type AnyPgEffectInsert = PgEffectInsertBase<any, any, any, any, any, any>;

export type PgInsertPrepare<
	T extends AnyPgEffectInsert,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgEffectPreparedQuery<
	PreparedQueryConfig & {
		run: T['_']['result'];
		all: T['_']['result'];
		get: T['_']['result'] extends ReadonlyArray<infer U> ? U | undefined : T['_']['result'];
		values: unknown[][];
		execute: T['_']['result'];
	},
	TEffectHKT
>;

export type PgInsert<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = ColumnsSelection | undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgInsertBase<PgEffectInsertHKT<TEffectHKT>, TTable, TQueryResult, TSelectedFields, TReturning, true, never>;

export interface PgEffectInsertBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields = undefined,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends
	Effect.Effect<
		TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[],
		TEffectHKT['error'],
		TEffectHKT['context']
	>
{
}

export class PgEffectInsertBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields = undefined,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgInsertBase<
	PgEffectInsertHKT<TEffectHKT>,
	TTable,
	TQueryResult,
	TSelectedFields,
	TReturning,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'> {
	static override readonly [entityKind]: string = 'PgEffectInsert';

	declare protected session: PgEffectSession<TEffectHKT, any, any>;

	/** @internal */
	_prepare(name?: string, generateName = false): PgInsertPrepare<this, TEffectHKT> {
		const { session, config, dialect } = this;
		const { returning: fields } = config;

		const query = dialect.sqlToQuery(this.getSQL());
		const mapper = fields
			? this.dialect.mapperGenerators.rows(fields, undefined)
			: undefined;

		const preparedQuery = session.prepareQuery<
			PreparedQueryConfig & { run: any; all: any; get: any; values: any; execute: any }
		>(
			query,
			fields ? 'arrays' : 'raw',
			name ?? generateName,
			mapper,
			{ type: 'insert', tables: [...extractUsedTable(this.config.table)] },
		);

		return preparedQuery;
	}

	prepare(name?: string): PgInsertPrepare<this, TEffectHKT> {
		return this._prepare(name, true);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues).pipe(
			Effect.withSpan('drizzle.operation'),
		);
	};

	run: ReturnType<this['prepare']>['run'] = (placeholderValues) => {
		return this._prepare().run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues) => {
		return this._prepare().all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues) => {
		return this._prepare().get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues) => {
		return this._prepare().values(placeholderValues);
	};
}

applyEffectWrapper(PgEffectInsertBase);

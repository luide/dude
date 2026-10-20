/* oxlint-disable */
import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from 'drizzle-orm/effect-core/query-effect';
import { entityKind } from 'drizzle-orm/entity';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from 'drizzle-orm/pg-core/session';
import type { PgTable } from 'drizzle-orm/pg-core/table';
import type { JoinNullability } from 'drizzle-orm/query-builders/select.types';
import type { RunnableQuery } from 'drizzle-orm/runnable-query';
import type { ColumnsSelection, SQL } from 'drizzle-orm/sql/sql';
import type { Subquery } from 'drizzle-orm/subquery';
import { type Assume } from 'drizzle-orm/utils';
import { resolveNullableObjectPaths } from '../../internal/drizzle-utils.js';
import { type Join, PgUpdateBase, type PgUpdateHKTBase } from 'drizzle-orm/pg-core/query-builders/update';
import { extractUsedTable } from 'drizzle-orm/pg-core/utils';
import type { PgViewBase } from 'drizzle-orm/pg-core/view-base';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.js';

export type PgEffectUpdateResult<T extends AnyPgEffectUpdate> = T['_']['returning'] extends undefined
	? PgQueryResultKind<T['_']['queryResult'], never>
	: T['_']['returning'][];

export type PgEffectUpdatePrepare<
	T extends AnyPgEffectUpdate,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgEffectPreparedQuery<
	PreparedQueryConfig & {
		run: PgEffectUpdateResult<T>;
		all: PgEffectUpdateResult<T>;
		get: PgEffectUpdateResult<T> extends ReadonlyArray<infer U> ? U | undefined : PgEffectUpdateResult<T>;
		values: unknown[][];
		execute: PgEffectUpdateResult<T>;
	},
	TEffectHKT
>;

export type PgEffectUpdate<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgEffectUpdateBase<
	TTable,
	TQueryResult,
	TFrom,
	TSelectedFields,
	TReturning,
	TNullabilityMap,
	TJoins,
	true,
	never,
	TEffectHKT
>;

export interface PgEffectUpdateHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase> extends PgUpdateHKTBase {
	_type: PgEffectUpdateBase<
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		Assume<this['from'], PgTable | Subquery | PgViewBase | SQL | undefined>,
		Assume<this['selectedFields'], ColumnsSelection | undefined>,
		Assume<this['returning'], Record<string, unknown> | undefined>,
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		Assume<this['joins'], Join[]>,
		this['dynamic'],
		this['excludedMethods'],
		TEffectHKT
	>;
}

export type AnyPgEffectUpdate = PgEffectUpdateBase<any, any, any, any, any, any, any, any, any, any>;

export interface PgEffectUpdateBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TJoins extends Join[] = [],
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
{}

export class PgEffectUpdateBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TFrom extends PgTable | Subquery | PgViewBase | SQL | undefined = undefined,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TNullabilityMap extends Record<string, JoinNullability> = Record<TTable['_']['name'], 'not-null'>,
	TJoins extends Join[] = [],
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgUpdateBase<
	PgEffectUpdateHKT<TEffectHKT>,
	TTable,
	TQueryResult,
	TFrom,
	TSelectedFields,
	TReturning,
	TNullabilityMap,
	TJoins,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'> {
	static override readonly [entityKind]: string = 'PgEffectUpdate';

	declare protected session: PgEffectSession<TEffectHKT, any, any>;

	/** @internal */
	_prepare(name?: string, generateName = false): PgEffectUpdatePrepare<this, TEffectHKT> {
		const { session, config, dialect, joinsNotNullableMap } = this;
		const { returning: fields } = config;

		const query = dialect.sqlToQuery(this.getSQL());
		const mapper = fields
			? this.dialect.mapperGenerators.rows(fields, resolveNullableObjectPaths(fields, joinsNotNullableMap))
			: undefined;

		const preparedQuery = session.prepareQuery<
			PreparedQueryConfig & { run: any; all: any; get: any; values: any; execute: any }
		>(
			query,
			fields ? 'arrays' : 'raw',
			name ?? generateName,
			mapper,
			{ type: 'update', tables: [...extractUsedTable(this.config.table)] },
		);

		return preparedQuery;
	}

	prepare(name?: string): PgEffectUpdatePrepare<this, TEffectHKT> {
		return this._prepare(name, true);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues: Record<string, unknown> = {}) => {
		return this._prepare().execute(placeholderValues);
	};

	run: ReturnType<this['prepare']>['run'] = (placeholderValues: Record<string, unknown> = {}) => {
		return this._prepare().run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues: Record<string, unknown> = {}) => {
		return this._prepare().all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues: Record<string, unknown> = {}) => {
		return this._prepare().get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues: Record<string, unknown> = {}) => {
		return this._prepare().values(placeholderValues);
	};
}

applyEffectWrapper(PgEffectUpdateBase);

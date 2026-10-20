/* oxlint-disable */
import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from 'drizzle-orm/effect-core/query-effect';
import { entityKind } from 'drizzle-orm/entity';
import type {
	BuildSubquerySelection,
	JoinNullability,
	SelectMode,
	SelectResult,
} from 'drizzle-orm/query-builders/select.types';
import type { ColumnsSelection } from 'drizzle-orm/sql/sql';
import { type Assume } from 'drizzle-orm/utils';
import { resolveNullableObjectPaths } from '../../internal/drizzle-utils.js';
import { PgSelectBase, type PgSelectBuilder } from 'drizzle-orm/pg-core/query-builders/select';
import type {
	PgSelectHKTBase,
	SelectedFields,
	SelectedFieldsOrdered,
} from 'drizzle-orm/pg-core/query-builders/select.types';
import type { PreparedQueryConfig } from 'drizzle-orm/pg-core/session';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.js';

export type PgEffectSelectPrepare<
	T extends AnyPgEffectSelect,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgEffectPreparedQuery<
	PreparedQueryConfig & {
		run: T['_']['result'];
		all: T['_']['result'];
		get: T['_']['result'][number] | undefined;
		values: unknown[][];
		execute: T['_']['result'];
	},
	TEffectHKT
>;

export type PgEffectSelectBuilder<
	TSelection extends SelectedFields | undefined,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = PgSelectBuilder<TSelection, PgEffectSelectHKT<TEffectHKT>>;

export type PgEffectSelect<
	TTableName extends string | undefined = string | undefined,
	TSelection extends ColumnsSelection = Record<string, any>,
	TSelectMode extends SelectMode = SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = Record<string, JoinNullability>,
> = PgEffectSelectBase<
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	true,
	never
>;

export interface PgEffectSelectHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase> extends PgSelectHKTBase {
	_type: PgEffectSelectBase<
		this['tableName'],
		Assume<this['selection'], ColumnsSelection>,
		this['selectMode'],
		Assume<this['nullabilityMap'], Record<string, JoinNullability>>,
		this['dynamic'],
		this['excludedMethods'],
		Assume<this['result'], any[]>,
		Assume<this['selectedFields'], ColumnsSelection>,
		TEffectHKT
	>;
}

export interface PgEffectSelectBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection | undefined,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	// oxlint-disable-next-line no-unused-vars
	TDynamic extends boolean = false,
	// oxlint-disable-next-line no-unused-vars
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	// oxlint-disable-next-line no-unused-vars
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<
		Assume<TSelection, ColumnsSelection>,
		TNullabilityMap
	>,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends Effect.Effect<TResult, TEffectHKT['error'], TEffectHKT['context']> {
}

export class PgEffectSelectBase<
	TTableName extends string | undefined,
	TSelection extends ColumnsSelection | undefined,
	TSelectMode extends SelectMode,
	TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'>
		: {},
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
	TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
	TSelectedFields extends ColumnsSelection = BuildSubquerySelection<
		Assume<TSelection, ColumnsSelection>,
		TNullabilityMap
	>,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgSelectBase<
	PgEffectSelectHKT<TEffectHKT>,
	TTableName,
	TSelection,
	TSelectMode,
	TNullabilityMap,
	TDynamic,
	TExcludedMethods,
	TResult,
	TSelectedFields
> {
	static override readonly [entityKind]: string = 'PgEffectSelectQueryBuilder';

	declare protected session: PgEffectSession<TEffectHKT, any, any>;

	/** @internal */
	_prepare(name?: string, generateName = false): PgEffectSelectPrepare<this, TEffectHKT> {
		const { session, cacheConfig, usedTables } = this;

		// `_resolveSelection` exists at runtime on drizzle's PgSelectBase but is not declared in
		// its published types. The vendored class inherits the implementation, so the cast only
		// restores the type.
		const fieldsList = (this as unknown as { _resolveSelection(): SelectedFieldsOrdered })._resolveSelection();
		const query = this.dialect.sqlToQuery(this.getSQL());
		const nullableObjectPaths = resolveNullableObjectPaths(fieldsList, this.joinsNotNullableMap);
		const mapper = this.dialect.mapperGenerators.rows(fieldsList, nullableObjectPaths);

		const preparedQuery = session.prepareQuery<
			PreparedQueryConfig & { run: any; all: any; get: any; values: any; execute: any }
		>(
			query,
			'arrays',
			name ?? generateName,
			mapper,
			{ type: 'select', tables: [...usedTables] },
			cacheConfig,
		);

		return preparedQuery;
	}

	/**
	 * Create a prepared statement for this query. This allows
	 * the database to remember this query for the given session
	 * and call it by name, rather than specifying the full query.
	 *
	 * {@link https://www.postgresql.org/docs/current/sql-prepare.html | Postgres prepare documentation}
	 */
	prepare(name?: string): PgEffectSelectPrepare<this, TEffectHKT> {
		return this._prepare(name, true);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().execute(placeholderValues);
	};

	run: ReturnType<this['prepare']>['run'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().values(placeholderValues);
	};
}

applyEffectWrapper(PgEffectSelectBase);

export type AnyPgEffectSelect = PgEffectSelectBase<any, any, any, any, any, any, any, any, any>;

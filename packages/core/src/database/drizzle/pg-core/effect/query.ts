/* oxlint-disable */
import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from 'drizzle-orm/effect-core/query-effect';
import { entityKind } from 'drizzle-orm/entity';
import type { RunnableQuery } from 'drizzle-orm/runnable-query';
import { PgRelationalQuery, type PgRelationalQueryHKTBase } from 'drizzle-orm/pg-core/query-builders/query';
import type { PreparedQueryConfig } from 'drizzle-orm/pg-core/session';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.js';

export type AnyPgEffectRelationalQuery = PgEffectRelationalQuery<any, any>;

export interface PgEffectRelationalQueryHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends PgRelationalQueryHKTBase
{
	_type: PgEffectRelationalQuery<this['result'], TEffectHKT>;
}

export interface PgEffectRelationalQuery<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends Effect.Effect<TResult, TEffectHKT['error'], TEffectHKT['context']>
{}
export class PgEffectRelationalQuery<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends PgRelationalQuery<PgEffectRelationalQueryHKT<TEffectHKT>, TResult>
	implements RunnableQuery<TResult, 'pg'>
{
	static override readonly [entityKind]: string = 'PgEffectRelationalQueryV2';

	declare protected session: PgEffectSession<TEffectHKT, any, any>;

	/** @internal */
	_prepare(
		name?: string,
		generateName = false,
	): PgEffectPreparedQuery<PreparedQueryConfig & { execute: TResult }, TEffectHKT> {
		const { query, builtQuery } = this._toSQL();

		const mapper = this.dialect.mapperGenerators.relationalRows({
			isFirst: this.mode === 'first',
			parseJson: this.parseJson,
			parseJsonIfString: false,
			rootJsonMappers: false,
			selection: query.selection,
			arrayModeRoot: true,
		});

		return this.session.prepareQuery<PreparedQueryConfig & { execute: TResult }>(
			builtQuery,
			'arrays',
			name ?? generateName,
			mapper,
		);
	}

	prepare(name?: string): PgEffectPreparedQuery<PreparedQueryConfig & { execute: TResult }, TEffectHKT> {
		return this._prepare(name, true);
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this._prepare().execute(placeholderValues);
	}
}

applyEffectWrapper(PgEffectRelationalQuery);

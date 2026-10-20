/* oxlint-disable */
import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from 'drizzle-orm/effect-core/query-effect';
import { entityKind } from 'drizzle-orm/entity';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from 'drizzle-orm/pg-core/session';
import type { RunnableQuery } from 'drizzle-orm/runnable-query';
import { PgRefreshMaterializedView } from 'drizzle-orm/pg-core/query-builders/refresh-materialized-view';
import type { PgEffectPreparedQuery, PgEffectSession } from './session.js';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PgEffectRefreshMaterializedView<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends Effect.Effect<PgQueryResultKind<TQueryResult, never>, TEffectHKT['error'], TEffectHKT['context']> {}

export class PgEffectRefreshMaterializedView<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends PgRefreshMaterializedView<TQueryResult>
	implements RunnableQuery<PgQueryResultKind<TQueryResult, never>, 'pg'>
{
	static override readonly [entityKind]: string = 'PgEffectRefreshMaterializedView';

	declare protected session: PgEffectSession<TEffectHKT, any, any>;

	/** @internal */
	_prepare(name?: string, generateName = false): PgEffectPreparedQuery<
		PreparedQueryConfig & {
			execute: PgQueryResultKind<TQueryResult, never>;
		},
		TEffectHKT
	> {
		const query = this.dialect.sqlToQuery(this.getSQL());
		return this.session.prepareQuery(
			query,
			'raw',
			name ?? generateName,
		);
	}

	prepare(name?: string): PgEffectPreparedQuery<
		PreparedQueryConfig & {
			execute: PgQueryResultKind<TQueryResult, never>;
		},
		TEffectHKT
	> {
		return this._prepare(name, true);
	}

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};
}

applyEffectWrapper(PgEffectRefreshMaterializedView);

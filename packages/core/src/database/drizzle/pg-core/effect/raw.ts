/* oxlint-disable */
import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from 'drizzle-orm/effect-core/query-effect';
import { entityKind } from 'drizzle-orm/entity';
import type { RunnableQuery } from 'drizzle-orm/runnable-query';
import type { Query, SQL, SQLWrapper } from 'drizzle-orm/sql/sql';
import { PgRaw } from 'drizzle-orm/pg-core/query-builders/raw';
import type { PgEffectPreparedQuery } from './session.js';

export interface PgEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends Effect.Effect<TResult, TEffectHKT['error'], TEffectHKT['context']>, RunnableQuery<TResult, 'pg'>, SQLWrapper
{}
export class PgEffectRaw<TResult, TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase> extends PgRaw<TResult>
	implements RunnableQuery<TResult, 'pg'>
{
	static override readonly [entityKind]: string = 'PgEffectRaw';

	declare readonly _: {
		readonly dialect: 'pg';
		readonly result: TResult;
	};

	declare protected prepared: PgEffectPreparedQuery<{
		execute: TResult;
	}, TEffectHKT>;

	constructor(
		prepared: PgEffectPreparedQuery<{
			execute: TResult;
		}, TEffectHKT>,
		sql: SQL,
		query: Query,
	) {
		super(prepared, sql, query);
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this.prepared.execute(placeholderValues);
	}

	override _prepare() {
		return this.prepared;
	}
}

applyEffectWrapper(PgEffectRaw);

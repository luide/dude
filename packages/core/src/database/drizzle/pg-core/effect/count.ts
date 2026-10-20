/* oxlint-disable */
import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from 'drizzle-orm/effect-core/query-effect';
import { entityKind } from 'drizzle-orm/entity';
import type { SQL, SQLWrapper } from 'drizzle-orm/sql/sql';
import type { PgDialect } from 'drizzle-orm/pg-core/dialect';
import { PgCountBuilder } from 'drizzle-orm/pg-core/query-builders/count';
import type { PgTable } from 'drizzle-orm/pg-core/table';
import type { PgViewBase } from 'drizzle-orm/pg-core/view-base';
import type { PgEffectSession } from './session.js';

export interface PgEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends PgCountBuilder, Effect.Effect<number, TEffectHKT['error'], TEffectHKT['context']>
{}

export class PgEffectCountBuilder<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase> extends PgCountBuilder {
	static override readonly [entityKind]: string = 'PgEffectCountBuilder';

	protected session: PgEffectSession<TEffectHKT, any, any>;

	constructor(
		{ source, dialect, filters, session }: {
			source: PgTable | PgViewBase | SQL | SQLWrapper;
			filters?: SQL<unknown>;
			dialect: PgDialect;
			session: PgEffectSession<TEffectHKT, any, any>;
		},
	) {
		super({ source, dialect, filters });
		this.session = session;
	}

	execute(placeholderValues?: Record<string, unknown>) {
		return this.session.prepareQuery<{
			execute: number;
			objects: unknown;
			arrays: unknown;
			raw: unknown;
		}>(
			this.build(),
			'arrays',
			false,
			(rows) => {
				const v = rows[0]?.[0];
				if (typeof v === 'number') return v;
				return v ? Number(v) : 0;
			},
		).execute(placeholderValues);
	}
}

applyEffectWrapper(PgEffectCountBuilder);

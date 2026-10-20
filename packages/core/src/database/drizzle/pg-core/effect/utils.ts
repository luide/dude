/* oxlint-disable */
import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations';
import type { DrizzlePgConfig } from 'drizzle-orm/pg-core/utils';

export type EffectDrizzlePgConfig<
	TRelations extends AnyRelations = EmptyRelations,
> = Omit<DrizzlePgConfig<TRelations>, 'cache' | 'logger'>;

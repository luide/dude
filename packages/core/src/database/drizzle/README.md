# Effect Drizzle PostgreSQL Adapter

This subtree is an upstream-derived Drizzle ORM fork adapted to run PostgreSQL
query builders over Effect's generic `SqlClient`. It is maintained source, not
generated output.

## Provenance

The implementation is derived from Drizzle ORM's Effect PostgreSQL driver/session,
PostgreSQL Effect query builders, and shared query-builder utilities. The
corresponding upstream source families are `drizzle-orm/src/effect-pg`,
`drizzle-orm/src/pg-core`, and `drizzle-orm/src/utils.ts`.

The exact upstream revision originally copied into this repository is unknown.
The currently pinned `drizzle-orm` version is a compatibility dependency, not
copy provenance.

## Local Boundary

The supported local entrypoint is `@opencode/core/database/drizzle`, exposed as
the `EffectDrizzlePg` namespace. OpenCode's database service consumes that facade
from `database/database.ts`.

Material local adaptations include:

- a runtime-independent driver over Effect's generic `SqlClient`
- `run`/`all`/`get`/`values` result helpers on the database and prepared query,
  so shared call sites read the same on PostgreSQL as they did on SQLite
- local cache, mapping, and runtime-inspection helpers
- suppressed statement tracing beneath the database operation boundary
- explicit PostgreSQL transactions and savepoints
- deliberate query-builder variance annotations

Preserve these adaptations when comparing or synchronizing upstream code.
Focused regression coverage lives with the database tests under `test/`.

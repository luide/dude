// Postgres table and column helpers for the OpenCode schema.
//
// Thin wrappers over drizzle's `pg-core` builders that pin two decisions the
// schema relies on:
//
//   - Epoch-millisecond columns use `double precision`. The pg driver returns
//     `int8` as `BigInt` and epoch ms overflow `int4`, so neither `integer` nor
//     `bigint` fits the runtime's `number` timestamps.
//   - JSON columns use a `jsonb` custom type that stringifies on write, because
//     `@effect/sql-pg` cannot encode a plain object; Postgres casts the string
//     to `jsonb` on assignment. The driver already decodes `jsonb` on read, so
//     `fromDriver` passes the value through.
import {
  boolean,
  customType,
  doublePrecision,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

export { boolean, customType, doublePrecision, index, primaryKey, text, uniqueIndex }

export const table = pgTable

/**
 * Match every directory inside `directory` using `column >= dir AND column <= dir + U+FFFF`.
 * That upper bound only holds under byte-order collation: the database's locale collation
 * (for example `pt_BR.UTF-8`) sorts `U+FFFF` before path separators, so the bound selects
 * nothing. Pin `COLLATE "C"` to keep the subtree comparison byte-ordered.
 */
export function inDirectorySubtree(column: PgColumn, directory: string): SQL {
  return sql`${column} collate "C" >= ${directory} and ${column} collate "C" <= ${directory + "\uffff"}`
}

export const json = customType<{ data: unknown; driverData: string }>({
  dataType() {
    return "jsonb"
  },
  toDriver(value) {
    return JSON.stringify(value)
  },
  fromDriver(value) {
    return value
  },
})

export function integer() {
  return doublePrecision()
}

export function real() {
  return doublePrecision()
}
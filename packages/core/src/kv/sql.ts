import { json, table, text } from "../database/pg-schema.js"
import { Timestamps } from "../database/schema.sql.js"
import type { KV } from "../kv.js"

export const KVTable = table("kv", {
  key: text().primaryKey(),
  value: json().$type<KV.Value>().notNull(),
  ...Timestamps,
})

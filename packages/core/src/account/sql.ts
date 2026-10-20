import { boolean, table, text, integer, primaryKey } from "../database/pg-schema.js"

import { Timestamps } from "../database/schema.sql.js"

export const AccountTable = table("account", {
  id: text().primaryKey(),
  email: text().notNull(),
  url: text().notNull(),
  access_token: text().notNull(),
  refresh_token: text().notNull(),
  token_expiry: integer(),
  ...Timestamps,
})

export const AccountStateTable = table("account_state", {
  id: integer().primaryKey(),
  active_account_id: text().references(() => AccountTable.id, { onDelete: "set null" }),
  active_org_id: text(),
})

// LEGACY
export const ControlAccountTable = table(
  "control_account",
  {
    email: text().notNull(),
    url: text().notNull(),
    access_token: text().notNull(),
    refresh_token: text().notNull(),
    token_expiry: integer(),
    active: boolean()
      .notNull()
      .$default(() => false),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.email, table.url] })],
)

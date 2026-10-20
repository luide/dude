import { boolean, json, table, text } from "../database/pg-schema.js"
import { Timestamps } from "../database/schema.sql.js"
import type { Credential } from "../credential.js"

export const CredentialTable = table("credential", {
  id: text().$type<Credential.ID>().primaryKey(),
  integration_id: text().$type<Credential.Info["integrationID"]>(),
  label: text().notNull(),
  value: json().$type<Credential.Value>().notNull(),
  connector_id: text(),
  method_id: text(),
  active: boolean(),
  ...Timestamps,
})

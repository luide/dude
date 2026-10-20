import { Workspace } from "@opencode/schema/workspace"
import { integer, json, table, text } from "../database/pg-schema.js"
import type { WorkspaceDriver } from "./driver.js"

export const WorkspaceTable = table("workspace", {
  id: text().$type<Workspace.ID>().primaryKey(),
  provider: text().notNull(),
  binding: json().$type<WorkspaceDriver.Binding>(),
  created_at: integer().notNull(),
  last_used_at: integer().notNull(),
})

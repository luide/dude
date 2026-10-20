import { Database } from "@opencode/core/database/database"

/**
 * A Database node bound to a schema alongside the test's own, so a test that needs a
 * second, empty database can replace `Database.node` with this instead of pointing at a
 * separate SQLite file. The name is prefixed with the test's schema so the harness drops
 * both together.
 */
export function isolatedDatabase() {
  return Database.configured({ schema: `${process.env["OPENCODE_DATABASE_SCHEMA"] ?? "oc_test"}_target` })
}
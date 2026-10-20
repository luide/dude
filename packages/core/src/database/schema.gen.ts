import { Effect } from "effect"
import type { DatabaseMigration } from "./migration.js"

// PostgreSQL bootstrap schema. Maintained source, not generated output:
// it carries the SQLite compatibility function below and the ported DDL.
//
// Ported to PostgreSQL from the generated SQLite schema:
//   `ident` -> "ident", integer -> double precision, real -> double precision,
//   boolean columns -> boolean, text({mode:"json"}) columns -> jsonb.
// Foreign keys are added via ALTER after every table exists, because Postgres
// (unlike SQLite) requires the referenced table to exist at creation time.
const schema: Omit<DatabaseMigration.Migration, "id"> = {
  up(tx) {
    return Effect.gen(function* () {
      // SQLite-compatible json_extract(col, '$.a.b') for Postgres jsonb columns,
      // so the app's existing JSON queries run unchanged. Returns text.
      yield* tx.run(`
        CREATE OR REPLACE FUNCTION json_extract(data jsonb, path text) RETURNS text
        LANGUAGE sql IMMUTABLE AS $fn$
          SELECT data #>> string_to_array(regexp_replace(path, '^\\$\\.?', ''), '.')
        $fn$;
      `)
      yield* tx.run(`
        CREATE TABLE "account_state" (
          "id" double precision PRIMARY KEY,
          "active_account_id" text,
          "active_org_id" text
        );
      `)
      yield* tx.run(`
        CREATE TABLE "account" (
          "id" text PRIMARY KEY,
          "email" text NOT NULL,
          "url" text NOT NULL,
          "access_token" text NOT NULL,
          "refresh_token" text NOT NULL,
          "token_expiry" double precision,
          "time_created" double precision NOT NULL,
          "time_updated" double precision NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE "control_account" (
          "email" text NOT NULL,
          "url" text NOT NULL,
          "access_token" text NOT NULL,
          "refresh_token" text NOT NULL,
          "token_expiry" double precision,
          "active" boolean NOT NULL,
          "time_created" double precision NOT NULL,
          "time_updated" double precision NOT NULL,
          CONSTRAINT "control_account_pk" PRIMARY KEY("email", "url")
        );
      `)
      yield* tx.run(`
        CREATE TABLE "credential" (
          "id" text PRIMARY KEY,
          "integration_id" text,
          "label" text NOT NULL,
          "value" jsonb NOT NULL,
          "connector_id" text,
          "method_id" text,
          "active" boolean,
          "time_created" double precision NOT NULL,
          "time_updated" double precision NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE "event_sequence" (
          "aggregate_id" text PRIMARY KEY,
          "seq" double precision NOT NULL,
          "owner_id" text
        );
      `)
      yield* tx.run(`
        CREATE TABLE "event" (
          "id" text PRIMARY KEY,
          "aggregate_id" text NOT NULL,
          "seq" double precision NOT NULL,
          "created" double precision DEFAULT 0 NOT NULL,
          "type" text NOT NULL,
          "data" jsonb NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE "kv" (
          "key" text PRIMARY KEY,
          "value" jsonb NOT NULL,
          "time_created" double precision NOT NULL,
          "time_updated" double precision NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE "permission" (
          "id" text PRIMARY KEY,
          "project_id" text NOT NULL,
          "action" text NOT NULL,
          "resource" text NOT NULL,
          "time_created" double precision NOT NULL,
          "time_updated" double precision NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE "project_directory" (
          "project_id" text NOT NULL,
          "directory" text NOT NULL,
          "type" text,
          "strategy" text,
          "time_created" double precision NOT NULL,
          CONSTRAINT "project_directory_pk" PRIMARY KEY("project_id", "directory")
        );
      `)
      yield* tx.run(`
        CREATE TABLE "project" (
          "id" text PRIMARY KEY,
          "worktree" text NOT NULL,
          "vcs" text,
          "name" text,
          "icon_url" text,
          "icon_url_override" text,
          "icon_color" text,
          "time_created" double precision NOT NULL,
          "time_updated" double precision NOT NULL,
          "time_initialized" double precision,
          "time_active" double precision DEFAULT 0 NOT NULL,
          "time_archived" double precision,
          "sandboxes" text NOT NULL,
          "commands" jsonb
        );
      `)
      yield* tx.run(`
        CREATE TABLE "instruction_blob" (
          "hash" text PRIMARY KEY,
          "value" jsonb
        );
      `)
      yield* tx.run(`
        CREATE TABLE "instruction_entry" (
          "session_id" text NOT NULL,
          "key" text NOT NULL,
          "value" jsonb,
          "removed" boolean DEFAULT false NOT NULL,
          "time_created" double precision NOT NULL,
          "time_updated" double precision NOT NULL,
          CONSTRAINT "instruction_entry_pk" PRIMARY KEY("session_id", "key")
        );
      `)
      yield* tx.run(`
        CREATE TABLE "instruction_state" (
          "session_id" text PRIMARY KEY,
          "epoch_start" double precision NOT NULL,
          "through_seq" double precision NOT NULL,
          "initial_values" jsonb NOT NULL,
          "current_values" jsonb NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE "session_inbox" (
          "id" text PRIMARY KEY,
          "session_id" text NOT NULL,
          "type" text NOT NULL,
          "payload" jsonb NOT NULL,
          "delivery" text NOT NULL,
          "enqueued_seq" double precision NOT NULL,
          "time_created" double precision NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE "session_message" (
          "id" text PRIMARY KEY,
          "session_id" text NOT NULL,
          "type" text NOT NULL,
          "seq" double precision NOT NULL,
          "time_created" double precision NOT NULL,
          "time_updated" double precision NOT NULL,
          "data" jsonb NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE "session_pending" (
          "id" text PRIMARY KEY,
          "session_id" text NOT NULL,
          "type" text NOT NULL,
          "data" jsonb NOT NULL,
          "delivery" text,
          "admitted_seq" double precision NOT NULL,
          "time_created" double precision NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE "session_v2" (
          "id" text PRIMARY KEY,
          "project_id" text NOT NULL,
          "workspace_id" text,
          "parent_id" text,
          "fork_session_id" text,
          "fork_boundary" jsonb,
          "slug" text NOT NULL,
          "directory" text NOT NULL,
          "path" text,
          "title" text,
          "version" text NOT NULL,
          "share_url" text,
          "summary_additions" double precision,
          "summary_deletions" double precision,
          "summary_files" double precision,
          "summary_diffs" jsonb,
          "metadata" jsonb,
          "cost" double precision DEFAULT 0 NOT NULL,
          "tokens_input" double precision DEFAULT 0 NOT NULL,
          "tokens_output" double precision DEFAULT 0 NOT NULL,
          "tokens_reasoning" double precision DEFAULT 0 NOT NULL,
          "tokens_cache_read" double precision DEFAULT 0 NOT NULL,
          "tokens_cache_write" double precision DEFAULT 0 NOT NULL,
          "revert" jsonb,
          "permission" jsonb,
          "agent" text,
          "model" jsonb,
          "time_created" double precision NOT NULL,
          "time_updated" double precision NOT NULL,
          "time_idle" double precision,
          "time_viewed" double precision,
          "idle_outcome" text,
          "time_compacting" double precision,
          "time_archived" double precision,
          "time_suspended" double precision,
          "resume_attempts" double precision DEFAULT 0 NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE "workspace" (
          "id" text PRIMARY KEY,
          "provider" text NOT NULL,
          "binding" jsonb,
          "created_at" double precision NOT NULL,
          "last_used_at" double precision NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE "worktree" (
          "project_id" text NOT NULL,
          "directory" text NOT NULL,
          "strategy" text,
          "time_created" double precision NOT NULL,
          CONSTRAINT "worktree_pk" PRIMARY KEY("project_id", "directory")
        );
      `)
      // Foreign keys (added after all tables exist).
      yield* tx.run(
        `ALTER TABLE "account_state" ADD CONSTRAINT "fk_account_state_active_account_id_account_id_fk" FOREIGN KEY ("active_account_id") REFERENCES "account"("id") ON DELETE SET NULL;`,
      )
      yield* tx.run(
        `ALTER TABLE "event" ADD CONSTRAINT "fk_event_aggregate_id_event_sequence_aggregate_id_fk" FOREIGN KEY ("aggregate_id") REFERENCES "event_sequence"("aggregate_id") ON DELETE CASCADE;`,
      )
      yield* tx.run(
        `ALTER TABLE "permission" ADD CONSTRAINT "fk_permission_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;`,
      )
      yield* tx.run(
        `ALTER TABLE "project_directory" ADD CONSTRAINT "fk_project_directory_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;`,
      )
      yield* tx.run(
        `ALTER TABLE "instruction_entry" ADD CONSTRAINT "fk_instruction_entry_session_id_session_v2_id_fk" FOREIGN KEY ("session_id") REFERENCES "session_v2"("id") ON DELETE CASCADE;`,
      )
      yield* tx.run(
        `ALTER TABLE "instruction_state" ADD CONSTRAINT "fk_instruction_state_session_id_session_v2_id_fk" FOREIGN KEY ("session_id") REFERENCES "session_v2"("id") ON DELETE CASCADE;`,
      )
      yield* tx.run(
        `ALTER TABLE "session_inbox" ADD CONSTRAINT "fk_session_inbox_session_id_session_v2_id_fk" FOREIGN KEY ("session_id") REFERENCES "session_v2"("id") ON DELETE CASCADE;`,
      )
      yield* tx.run(
        `ALTER TABLE "session_message" ADD CONSTRAINT "fk_session_message_session_id_session_v2_id_fk" FOREIGN KEY ("session_id") REFERENCES "session_v2"("id") ON DELETE CASCADE;`,
      )
      yield* tx.run(
        `ALTER TABLE "session_pending" ADD CONSTRAINT "fk_session_pending_session_id_session_v2_id_fk" FOREIGN KEY ("session_id") REFERENCES "session_v2"("id") ON DELETE CASCADE;`,
      )
      yield* tx.run(
        `ALTER TABLE "session_v2" ADD CONSTRAINT "fk_session_v2_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;`,
      )
      yield* tx.run(
        `ALTER TABLE "worktree" ADD CONSTRAINT "fk_worktree_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;`,
      )
      yield* tx.run(`CREATE UNIQUE INDEX "event_aggregate_seq_idx" ON "event" ("aggregate_id","seq");`)
      yield* tx.run(`CREATE INDEX "event_aggregate_type_seq_idx" ON "event" ("aggregate_id","type","seq");`)
      yield* tx.run(
        `CREATE UNIQUE INDEX "permission_project_action_resource_idx" ON "permission" ("project_id","action","resource");`,
      )
      yield* tx.run(
        `CREATE INDEX "session_inbox_session_delivery_seq_idx" ON "session_inbox" ("session_id","delivery","enqueued_seq");`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX "session_inbox_session_enqueued_seq_idx" ON "session_inbox" ("session_id","enqueued_seq");`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX "session_message_session_seq_idx" ON "session_message" ("session_id","seq");`,
      )
      yield* tx.run(
        `CREATE INDEX "session_message_session_type_seq_idx" ON "session_message" ("session_id","type","seq");`,
      )
      yield* tx.run(
        `CREATE INDEX "session_message_session_time_created_id_idx" ON "session_message" ("session_id","time_created","id");`,
      )
      yield* tx.run(`CREATE INDEX "session_message_time_created_idx" ON "session_message" ("time_created");`)
      yield* tx.run(
        `CREATE INDEX "session_pending_session_delivery_seq_idx" ON "session_pending" ("session_id","delivery","admitted_seq");`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX "session_pending_session_compaction_idx" ON "session_pending" ("session_id") WHERE "session_pending"."type" = 'compaction';`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX "session_pending_session_admitted_seq_idx" ON "session_pending" ("session_id","admitted_seq");`,
      )
      yield* tx.run(`CREATE INDEX "session_v2_project_idx" ON "session_v2" ("project_id");`)
      yield* tx.run(`CREATE INDEX "session_v2_workspace_idx" ON "session_v2" ("workspace_id");`)
      yield* tx.run(`CREATE INDEX "session_v2_parent_idx" ON "session_v2" ("parent_id");`)
      yield* tx.run(
        `CREATE INDEX "session_v2_time_suspended_idx" ON "session_v2" ("time_suspended") WHERE "session_v2"."time_suspended" is not null;`,
      )
    })
  },
}

export default schema

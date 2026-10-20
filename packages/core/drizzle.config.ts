import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/**/*.sql.ts", "./src/**/sql.ts"],
  out: "./migration",
  dbCredentials: {
    url: process.env["OPENCODE_DATABASE_URL"] ?? "postgresql://opencode@/opencode?host=/run/postgresql",
  },
})
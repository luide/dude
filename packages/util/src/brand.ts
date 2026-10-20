// Backward-compatible branding for the "dude" fork of opencode.
//
// The fork reads DUDE_* configuration (env vars, directories, config files) but
// still honors the legacy OPENCODE_* names so existing plugins, skills, models,
// environment variables and config files keep working unchanged. New brand wins
// when both are present.

export const APP = "dude"
export const LEGACY_APP = "opencode"

/**
 * Read a branded environment variable, preferring the `DUDE_` prefix and falling
 * back to the legacy `OPENCODE_` prefix. Pass the suffix after the prefix, e.g.
 * `env("CONFIG_DIR")` reads `DUDE_CONFIG_DIR ?? OPENCODE_CONFIG_DIR`.
 */
export function env(name: string): string | undefined {
  return process.env[`DUDE_${name}`] ?? process.env[`OPENCODE_${name}`]
}

/**
 * Brand stems in precedence order (new brand first). Used to build the list of
 * accepted config file basenames, directory names, etc.
 */
export const BRAND_STEMS = [APP, LEGACY_APP] as const

/**
 * Mirror branded environment variables both ways so either prefix works everywhere,
 * without touching individual `process.env.OPENCODE_*` read sites: for every `OPENCODE_*`
 * that is set, define the matching `DUDE_*` when absent, and vice versa. An existing value
 * is never overwritten (so a DUDE_* explicitly set wins). Call once at process startup,
 * before any branded env var is read.
 */
export function normalizeBrandEnv(e: NodeJS.ProcessEnv = process.env): void {
  if (!e) return
  for (const key of Object.keys(e)) {
    if (key.startsWith("DUDE_")) {
      const legacy = `OPENCODE_${key.slice(5)}`
      if (e[legacy] === undefined) e[legacy] = e[key]
    } else if (key.startsWith("OPENCODE_")) {
      const primary = `DUDE_${key.slice(9)}`
      if (e[primary] === undefined) e[primary] = e[key]
    }
  }
}

export * as Brand from "./brand.js"

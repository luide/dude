import fs from "fs"
import os from "os"
import path from "path"

const home = os.homedir()
const data = process.env.XDG_DATA_HOME || (home ? path.join(home, ".local", "share") : undefined)
const cache = process.env.XDG_CACHE_HOME || (home ? path.join(home, ".cache") : undefined)
const config = process.env.XDG_CONFIG_HOME || (home ? path.join(home, ".config") : undefined)
const state = process.env.XDG_STATE_HOME || (home ? path.join(home, ".local", "state") : undefined)

// Prefer the new-brand directory; if it does not exist yet but a legacy one does, use the
// legacy directory so existing installs keep working. Resolution is read-only — nothing is moved.
function pick(base: string, app: string, legacy?: string) {
  const primary = path.join(base, app)
  if (legacy && legacy !== app) {
    try {
      if (!fs.existsSync(primary) && fs.existsSync(path.join(base, legacy))) return path.join(base, legacy)
    } catch {}
  }
  return primary
}

/** The XDG base directories that root the app's global paths, with legacy fallback. */
export function roots(app: string, legacy?: string) {
  return {
    data: pick(data!, app, legacy),
    cache: pick(cache!, app, legacy),
    config: pick(config!, app, legacy),
    state: pick(state!, app, legacy),
    tmp: path.join(os.tmpdir(), app),
  }
}

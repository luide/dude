import { $ } from "bun"
import semver from "semver"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

// Prefer the DUDE_ build env, falling back to the legacy OPENCODE_ names so existing
// build tooling (e.g. the Gentoo ebuild passing OPENCODE_VERSION=) keeps working.
const buildEnv = (name: string) => process.env[`DUDE_${name}`] ?? process.env[`OPENCODE_${name}`]
const env = {
  OPENCODE_CHANNEL: buildEnv("CHANNEL"),
  OPENCODE_BUMP: buildEnv("BUMP"),
  OPENCODE_VERSION: buildEnv("VERSION"),
  OPENCODE_RELEASE: buildEnv("RELEASE"),
}
const CHANNEL = await (async () => {
  if (env.OPENCODE_CHANNEL) return env.OPENCODE_CHANNEL
  if (env.OPENCODE_BUMP) return "latest"
  if (env.OPENCODE_VERSION && !env.OPENCODE_VERSION.startsWith("0.0.0-")) return "latest"
  const branch = await $`git branch --show-current`.text().then((x) => x.trim())
  if (!branch) return "detached"
  const channel = branch.replace(/[^a-zA-Z0-9._-]/g, "-")
  if (/^[a-zA-Z0-9]/.test(channel)) return channel
  return `branch-${channel}`
})()
const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.OPENCODE_VERSION) return env.OPENCODE_VERSION
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${previewBuildNumber()}`
  // The dude fork mirrors the upstream opencode version 1:1. Absent an explicit version,
  // read the latest published version of the original package (@opencode/cli on npm) and use
  // it verbatim (no bump), so dude stays aligned with opencode's versioning. The npm `latest`
  // dist-tag is the authoritative current release (GitHub's releases/latest lags, as the 2.x
  // line is published there only as prereleases).
  const version: string = await fetch("https://registry.npmjs.org/@opencode%2fcli/latest", {
    headers: { "User-Agent": "dude-build" },
    signal: AbortSignal.timeout(10_000),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`npm registry returned HTTP ${res.status} for @opencode/cli`)
      return res.json()
    })
    .then((data: any) => String(data?.version ?? "").trim())
  if (!semver.valid(version)) throw new Error(`could not resolve the upstream opencode version (got "${version}")`)
  return version
})()

function previewBuildNumber() {
  const runNumber = process.env["GITHUB_RUN_NUMBER"]
  if (!runNumber) return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")
  const runAttempt = process.env["GITHUB_RUN_ATTEMPT"]
  if (runAttempt && runAttempt !== "1") return `${runNumber}.${runAttempt}`
  return runNumber
}

const bot = ["actions-user", "opencode", "opencode-agent[bot]"]
const teamPath = path.resolve(import.meta.dir, "../../../.github/TEAM_MEMBERS")
const team = [
  ...(await Bun.file(teamPath)
    .text()
    .then((x) => x.split(/\r?\n/).map((x) => x.trim()))
    .then((x) => x.filter((x) => x && !x.startsWith("#")))),
  ...bot,
]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.OPENCODE_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`opencode script`, JSON.stringify(Script, null, 2))

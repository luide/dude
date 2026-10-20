import { Option, Schema } from "effect"

// Compile-time defines injected by the build (see packages/cli/script/build.ts and
// vite.node.config.ts). Source/dev runs leave them undefined, so each falls back to a default.
declare const DUDE_VERSION: string
declare const DUDE_CHANNEL: string
declare const DUDE_ARTIFACT: string
declare const DUDE_RELEASE_HIGHLIGHTS: string

const version = typeof DUDE_VERSION === "string" ? DUDE_VERSION : "local"
const channel = typeof DUDE_CHANNEL === "string" ? DUDE_CHANNEL : "local"
const artifact = typeof DUDE_ARTIFACT === "string" ? DUDE_ARTIFACT : "cli"
// Stable release builds embed the release notes' Highlights; every other build has none.
const highlights =
  typeof DUDE_RELEASE_HIGHLIGHTS === "string"
    ? Option.getOrElse(
        Schema.decodeUnknownOption(
          Schema.fromJsonString(Schema.Array(Schema.Struct({ title: Schema.String, body: Schema.String }))),
        )(DUDE_RELEASE_HIGHLIGHTS),
        () => [],
      )
    : []

const local = channel === "local"

export {
  version as DUDE_VERSION,
  channel as DUDE_CHANNEL,
  artifact as DUDE_ARTIFACT,
  highlights as DUDE_HIGHLIGHTS,
  local as DUDE_LOCAL,
}

// Legacy aliases kept so existing importers (and any plugins/tooling referencing the
// opencode names) keep working. Migrate to the DUDE_* exports over time.
export {
  version as OPENCODE_VERSION,
  channel as OPENCODE_CHANNEL,
  artifact as OPENCODE_ARTIFACT,
  highlights as OPENCODE_HIGHLIGHTS,
  local as OPENCODE_LOCAL,
}

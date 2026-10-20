import { EOL } from "os"
import { Effect, Option } from "effect"
import { Global } from "@opencode/util/global"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"

export default Runtime.handler(
  Commands.commands.debug.commands.paths,
  Effect.fn("cli.debug.paths")(function* (input) {
    const global = yield* Global.Service
    const paths = { ...global }
    if (Option.isSome(input.name)) {
      process.stdout.write(paths[input.name.value] + EOL)
      return
    }
    process.stdout.write(
      Object.entries(paths)
        .map(([key, value]) => `${key.padEnd(10)} ${value}${EOL}`)
        .join(""),
    )
  }),
)

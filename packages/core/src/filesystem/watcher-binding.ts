import { createRequire } from "node:module"

declare const DUDE_LIBC: string | undefined

// Lazy: on workerd import.meta.url is undefined and the watcher is never
// loaded, so createRequire must not run at module scope.
export default function load() {
  const require = createRequire(import.meta.url)
  const libc = typeof DUDE_LIBC === "undefined" ? undefined : DUDE_LIBC
  return require(
    process.env.DUDE_PARCEL_WATCHER_PATH ??
      process.env.OPENCODE_PARCEL_WATCHER_PATH ??
      `@parcel/watcher-${process.platform}-${process.arch}${process.platform === "linux" ? `-${libc || "glibc"}` : ""}`,
  )
}

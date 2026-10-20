// Accept both DUDE_* and legacy OPENCODE_* environment variables in the Electron main process
// by mirroring them before anything reads process.env. This is imported first from the entry so
// even module-scope reads (e.g. constants.VERSION) see the normalized values. Self-contained on
// purpose: the desktop package does not depend on @opencode/util.
const e = process.env
for (const key of Object.keys(e)) {
  if (key.startsWith("DUDE_")) {
    const legacy = `OPENCODE_${key.slice(5)}`
    if (e[legacy] === undefined) e[legacy] = e[key]
  } else if (key.startsWith("OPENCODE_")) {
    const primary = `DUDE_${key.slice(9)}`
    if (e[primary] === undefined) e[primary] = e[key]
  }
}

export {}

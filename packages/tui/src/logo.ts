// The wordmark is literal block art (rendered as-is). `go` is a compact fallback
// used by the mini splash and on narrow terminals; its rows stay in the simple
// block style so the splash mark keeps a stable first row.
export const logo = {
  left: [
    " /░░░     /░/░    /░░░     /█▀▀▀/",
    "│-▒_/▒   │ ▒ ▒   │-▒_/▒   │ ▓▓▓  ",
    "│ ▓│ ▓   │ ▓ ▓   │ ▓│ ▓   │_▒_/  ",
    "│ ███/   │ ███   │ ███/   │ ░░░░ ",
    "│/__/    │/__/   │/__/    │/___/",
  ],
  right: ["", "", "", "", ""],
}

export const go = {
  left: ["    ", "█  █", "█  █", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█  █", "▀▀▀▀"],
}

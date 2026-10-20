import { RGBA, TextAttributes } from "@opentui/core"
import { For, type JSX } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { go, logo } from "../logo"

export function Logo() {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()

  // The wordmark is literal block art: draw every glyph as-is.
  const renderLine = (line: string, fg: RGBA, bold: boolean): JSX.Element[] => {
    const attrs = bold ? TextAttributes.BOLD : undefined
    return Array.from(line).map((char) => (
      <text fg={fg} attributes={attrs} selectable={false}>
        {char}
      </text>
    ))
  }

  return (
    <box>
      {dimensions().height < 7 ? null : dimensions().width < 36 ? (
        <For each={go.right.slice(1)}>
          {(line) => <box flexDirection="row">{renderLine(line, theme.text.base, true)}</box>}
        </For>
      ) : (
        <For each={logo.left}>
          {(line) => <box flexDirection="row">{renderLine(line, theme.text.base, false)}</box>}
        </For>
      )}
    </box>
  )
}

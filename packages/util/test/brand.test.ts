import { describe, expect, test } from "bun:test"
import { env, normalizeBrandEnv } from "../src/brand.js"

describe("brand", () => {
  test("env() prefers DUDE_ and falls back to OPENCODE_", () => {
    const saved = { d: process.env.DUDE_BRAND_TEST, o: process.env.OPENCODE_BRAND_TEST }
    try {
      delete process.env.DUDE_BRAND_TEST
      process.env.OPENCODE_BRAND_TEST = "legacy"
      expect(env("BRAND_TEST")).toBe("legacy")
      process.env.DUDE_BRAND_TEST = "new"
      expect(env("BRAND_TEST")).toBe("new")
    } finally {
      if (saved.d === undefined) delete process.env.DUDE_BRAND_TEST
      else process.env.DUDE_BRAND_TEST = saved.d
      if (saved.o === undefined) delete process.env.OPENCODE_BRAND_TEST
      else process.env.OPENCODE_BRAND_TEST = saved.o
    }
  })

  test("normalizeBrandEnv mirrors both directions without overwriting", () => {
    const e: NodeJS.ProcessEnv = {
      OPENCODE_API_KEY: "legacy",
      DUDE_CONFIG_DIR: "/cfg",
      DUDE_WINS: "new",
      OPENCODE_WINS: "old",
    }
    normalizeBrandEnv(e)
    expect(e.DUDE_API_KEY).toBe("legacy")
    expect(e.OPENCODE_CONFIG_DIR).toBe("/cfg")
    // An explicitly set value on either side is preserved.
    expect(e.DUDE_WINS).toBe("new")
    expect(e.OPENCODE_WINS).toBe("old")
  })
})

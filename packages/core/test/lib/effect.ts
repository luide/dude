import { test, type TestOptions } from "bun:test"
import { Cause, Clock, Duration, Effect, Exit, Layer, type Scope } from "effect"
import { TestClock, TestConsole } from "effect/testing"
import { FetchHttpClient } from "effect/http"
import { SqlClient } from "effect/sql/SqlClient"
import { pgLayer } from "@opencode/core/database/pg"

// TestClock jumps past the pool's default idle timeout would close connections
// mid-test; keep them alive for the whole run.
process.env["OPENCODE_DATABASE_IDLE_TIMEOUT"] ??= String(365 * 24 * 60 * 60 * 1000)

type Body<A, E, R> = Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>)

const body = <A, E, R>(value: Body<A, E, R>) => Effect.suspend(() => (typeof value === "function" ? value() : value))

const loopback = new Set(["127.0.0.1", "localhost", "[::1]"])

// Core is env-free, so nothing tells the default node graph to stay offline;
// a test that boots it would phone home through FetchHttpClient. Every
// FetchHttpClient reads this reference at request time, so refusing here covers
// each node that shares the default client, while an explicit HttpClient
// replacement never reaches it. Callers such as ModelsDev swallow request
// failures, so the harness also records the attempt and fails the test itself.
export const refuseNetwork = (violations: string[]): typeof fetch =>
  Object.assign(
    (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (loopback.has(new URL(url).hostname)) return fetch(input, init)
      const method = init?.method ?? (input instanceof Request ? input.method : "GET")
      const message = `test attempted network request: ${method} ${url} — provide an explicit HttpClient or disable the fetch`
      violations.push(message)
      return Promise.reject(new Error(message))
    },
    { preconnect: fetch.preconnect },
  )

const run = <A, E, R, E2>(value: Body<A, E, R | Scope.Scope>, layer: Layer.Layer<R, E2>) => {
  // Postgres is a shared database; give each test its own schema so DB-backed
  // assertions see an empty store, the way each SQLite test had its own temp file.
  // The schema lives for the whole test (so a test that rebuilds the layer still sees
  // its state) and is dropped with any sibling schema the test created.
  const previousSchema = process.env["OPENCODE_DATABASE_SCHEMA"]
  const schema = `oc_test_${crypto.randomUUID().replaceAll("-", "")}`
  process.env["OPENCODE_DATABASE_SCHEMA"] = schema
  const testBody = Effect.gen(function* () {
    const violations: string[] = []
    const exit = yield* body(value).pipe(
      Effect.scoped,
      Effect.provide(layer),
      Effect.provideService(FetchHttpClient.Fetch, refuseNetwork(violations)),
      Effect.exit,
    )
    if (Exit.isFailure(exit)) {
      for (const err of Cause.prettyErrors(exit.cause)) {
        yield* Effect.logError(err)
      }
    }
    if (violations.length > 0) return yield* Effect.fail(new Error(violations.join("\n")))
    return yield* exit
  })
  const dropSchemas = Effect.gen(function* () {
    const sql = yield* SqlClient
    const rows = yield* sql
      .unsafe<{ schema_name: string }>(
        "select schema_name from information_schema.schemata where schema_name like $1",
        [`${schema}%`],
      )
      .withoutTransform
    yield* Effect.forEach(
      rows,
      (row) => sql.unsafe(`drop schema if exists "${row.schema_name}" cascade`).withoutTransform,
      { discard: true },
    )
  })
  const scoped = Effect.scoped(
    Effect.acquireRelease(
      Effect.gen(function* () {
        const sql = yield* SqlClient
        yield* sql.unsafe(`create schema if not exists "${schema}"`).withoutTransform
        return sql
      }),
      () => dropSchemas.pipe(Effect.orDie),
    ).pipe(Effect.flatMap(() => testBody)),
  ).pipe(Effect.provide(pgLayer()))
  return scoped.pipe(
    Effect.ensuring(
      Effect.sync(() => {
        if (previousSchema === undefined) delete process.env["OPENCODE_DATABASE_SCHEMA"]
        else process.env["OPENCODE_DATABASE_SCHEMA"] = previousSchema
      }),
    ),
    Effect.runPromise,
  )
}

const make = <R, E>(testLayer: Layer.Layer<R, E>, liveLayer: Layer.Layer<R, E>) => {
  const effect = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test(name, () => run(value, testLayer), opts)

  effect.only = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.only(name, () => run(value, testLayer), opts)

  effect.skip = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.skip(name, () => run(value, testLayer), opts)

  const live = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test(name, () => run(value, liveLayer), opts)

  live.only = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.only(name, () => run(value, liveLayer), opts)

  live.skip = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.skip(name, () => run(value, liveLayer), opts)

  return { effect, live }
}

// Test environment with TestClock and TestConsole
//
// Postgres work is asynchronous, so a clock jump that wakes a fiber which then
// touches the database does not finish before `TestClock.adjust` returns the way
// synchronous SQLite did. Drain the real event loop after each jump so those
// continuations land before the test asserts.
export const settle = Effect.forEach(
  Array.from({ length: 5 }),
  () => Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0))),
  { discard: true },
)
const testClockWithSettle = Layer.effect(
  Clock.Clock,
  Effect.gen(function* () {
    const clock = (yield* Clock.Clock) as Clock.Clock & {
      adjust: (input: Duration.Input) => Effect.Effect<void>
      setTime: (timestamp: number) => Effect.Effect<void>
    }
    return {
      ...clock,
      adjust: (input: Duration.Input) => clock.adjust(input).pipe(Effect.andThen(settle)),
      setTime: (timestamp: number) => clock.setTime(timestamp).pipe(Effect.andThen(settle)),
    }
  }),
).pipe(Layer.provide(TestClock.layer()))
const testEnv = Layer.mergeAll(TestConsole.layer, testClockWithSettle)

// Live environment - uses real clock, but keeps TestConsole for output capture
const liveEnv = TestConsole.layer

export const it = make(testEnv, liveEnv)

export const testEffect = <R, E>(layer: Layer.Layer<R, E>) =>
  make(Layer.provideMerge(layer, testEnv), Layer.provideMerge(layer, liveEnv))

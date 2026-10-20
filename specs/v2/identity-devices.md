# Identity, Devices, and Remote Placement

Status: **Proposed.**

## Purpose

Explain why OpenCode gains durable user identity, bound devices, and per-placement execution, and record how those decisions map onto existing contracts: `Location`, `Workspace`, `EnvironmentDriver`, the Server event feed, and Protocol.

This document is a decision record. It fixes the shape and the boundaries; it is not an implementation checklist and does not restate contracts that live in [Session](./session.md) or [Tools](./tools.md).

## Vocabulary

- **User** — a durable account with a password, stored on the server. Replaces the single shared server secret as the unit of identity.
- **Device** — one machine where a User works. A Device belongs to a User, is enrolled once, and is revocable independently.
- **Device Agent** — the process on a Device that exposes that machine's filesystem, process spawning, and PTYs to the server over an outbound connection.
- **Principal** — the authenticated caller of a request: a User, optionally pinned to a Device, carrying a scope set. The server edge authorizes a Principal, not "authenticated or not".
- **Placement** — where execution happens. Today an implicit local machine; after this decision, either a local placement or a Device placement.

## Non-Goals

- Organizations, roles, membership, and organization-managed policy are deferred. The Console already carries organization-managed statements ([Provider Policy](./provider-policy.md)); this record does not extend that model.
- Federated identity (OIDC/SSO/MFA) is deferred. Local accounts on the server are the first step.
- This is not a sandbox. The Device Agent runs with the device user's operating-system privileges.
- Offline operation (a Device Agent that cannot reach the server) does not execute work. Deferred.
- Multi-region placement, quotas, and billing are out of scope.

## Context

Current state, and why it constrains the design:

- **Identity does not exist.** `packages/identity` contains brand assets only. `@opencode/schema` has no `User`, `Device`, or `Principal`, and `Session.Info` has no owner.
- **Authentication is one shared secret.** `ServerAuth` (`packages/server/src/auth.ts`) holds a single username and password. Session tokens are HMAC-signed with a key derived from that password, so the only revocation lever is rotating the password.
- **Authorization is binary.** `authorizationLayer` (`packages/server/src/middleware/authorization.ts`) either admits a request or returns `UnauthorizedError`. Once admitted, the caller reaches every route, including `credential.list`, which returns secret values.
- **Placement already exists as a seam.** `Location.Ref` is `{ directory, workspaceID }`; `Environment.Service` (`packages/core/src/environment/environment.ts`) binds a driver from `location.workspaceID` via `workspace.connect(...)`, or `makeLocalDriver` when absent. `WorkspaceDriver` is a pluggable registry (`packages/core/src/workspace/driver.ts`) whose `connect` returns an `EnvironmentDriver.Driver`.
- **The event feed is global by decision.** [Event stream](./event-stream-architecture.md) chose one server-scoped encoded feed with one bounded queue per connection, and stated the cross-location stream is intentional. That decision predates multi-user and leaks activity across users.
- **A shared database is viable.** The fork adds a PostgreSQL driver (`packages/core/src/database/pg.ts`, `database/drizzle/effect-pg/`), which is the correct store for a shared server.
- **Outbound connectivity already exists.** `RemoteTunnel` (`packages/cli/src/services/remote-tunnel.ts`) uses OpenTunnel to expose a local server without an inbound port. That is the transport a Device Agent uses in reverse.

## Decision

### 1. Identity is durable, local, and per-server

A User is a durable account with a password hash and an optional disabled state. Authentication produces a `Principal`; the single-password `ServerAuth` model is retained only as a compatibility mode (see Migration).

- Session tokens are randomly generated, stored hashed, and **revocable per row**. They are scoped to a User and optionally to a Device. Signing is not used as the revocation mechanism.
- Device enrollment issues a durable, revocable device credential, distinct from the short-lived, single-use `ServerPairing` code. Pairing remains the mechanism for browsers and ephemeral clients; enrollment is for machines.
- `credential` continues to own integration secrets. User identity is a separate concern and does not reuse the `account` table, which stores upstream provider/console tokens.

### 2. A Device is a placement target, not just a login attribute

Logging in on a machine makes that machine's work state addressable for that user.

- A Device is bound to a User and is the anchor for "which folders, history, and logs are mine on this machine".
- Per-`(User, Device)` state maps onto existing placement: a Device's work directories become `Workspace`s with a new provider id `device`, and per-user content filters `Session`, `Project`, and logs by owner.
- The `device` `WorkspaceDriver` resolves a `binding` of `{ deviceID, route }`; its `connect` returns a remote `EnvironmentDriver.Driver` whose `spawner` and `FilesImpl` overrides proxy to the Device Agent. `Environment.Service` needs no new branch: placement already flows from `location.workspaceID`.
- Device state is per-placement and per-user. A directory the user maps on one device is not silently assumed to exist on another.

### 3. Authorization is per-Principal, at the edge and in the core

`authorizationLayer` becomes principal-aware and evaluates `(Principal × operation × resource)`. Ownership is enforced where the resource is read, not only at the HTTP edge.

- Stored resources that are per-user gain an owner: Sessions, Workspaces, Projects, and per-user preferences. Reads and listings filter by the `Principal`.
- Scopes are coarse and closed, at the granularity of the operation families in Protocol (for example session read/write, filesystem read/write, shell, credential read/write, configuration write). A `Principal` without a scope is denied, not merely warned.
- Route-level exceptions keep the existing pattern: ticketed PTY upgrades and pairing/enrollment routes validate their own ticket or code, as `PTY_CONNECT_TICKET_QUERY` and the pairing path do today.

### 4. The event feed is partitioned by Principal

[Event stream](./event-stream-architecture.md) remains valid for its encoding-once optimization and its independent bounded queues. It is amended in one respect: delivery is scoped to the subscribing Principal.

- The Server resolves the `Principal` before subscribing. A connection that cannot be attributed to a Principal is rejected; it never receives an unfiltered feed.
- Selection by Principal happens in the Server feed, before wire encoding, so an event belonging to one user is never encoded into another user's stream. The one-Core-listener and encode-once properties are preserved.
- Events carry the ownership needed to select them. Events that are inherently server-scoped (for example server connection frames) remain visible to any authenticated Principal.

### 5. The Device Agent connects outbound

- The Device Agent is a mode of the existing CLI binary. It enrolls once with a device credential and then connects **outbound** through OpenTunnel, so the central server needs no inbound access to the device.
- The Agent advertises capabilities (filesystem, process spawn, PTY) during registration. The server refuses to place work on a capability the Agent did not advertise.
- The Agent protocol is a first-class Protocol surface with generated clients, not an ad-hoc channel. It reuses established patterns: the PTY ticket for terminal upgrades, and `rpc.call`'s location-scoped dispatch shape where applicable.
- The server places work by connecting the `device` provider; there is no path that silently executes device work on the server's own machine.

### 6. Identity has three surfaces; only administration is exclusive to a dedicated client

Identity must not be conflated with the client that happens to display it. There are three surfaces:

1. **The server owns all identity** — accounts, devices, tokens, and scopes. Every client below is a view over that one source.
2. **Every existing client keeps authentication.** `@opencode/app`, the TUI, the desktop app, and the CLI must authenticate as a Principal, because they act on the user's behalf against a user-scoped server. This is consumption, not administration, and it stays where the user already is. The CLI additionally carries the Device Agent and **device enrollment**, because enrollment happens on the device itself and the Agent is a CLI mode.
3. **A dedicated admin web client owns administration** — creating and disabling Users, managing and revoking any User's Devices, inspecting and revoking tokens and sessions across Users, mapping per-`(User, Device)` workspaces and directories, and reading logs and history across Users.

Therefore the load removed from App and the CLI is **administration only**. Authentication and self-service (own password, own Devices, own sessions) remain in each client by necessity, so each client keeps a login path and a minimum identity surface. The dedicated client is justified by a separate administration audience and deployment, not by removing authentication from the others.

- The admin app consumes `@opencode/client` and `@opencode/schema` and reuses `@opencode/ui` — its components, theme, and i18n. It does **not** depend on `@opencode/app`, which exposes application wiring, not a component library.
- The admin app is a standalone static application served on its own, and is **not** embedded in the CLI binary. This differs from `@opencode/app`, whose build is embedded as a brotli archive and served by the server.
- Admin authenticates as a Principal carrying management scopes. The server enforces those scopes on every operation, so the UI is not a security boundary and may be deployed separately without weakening enforcement.
- The CLI's identity surface is the minimum needed to authenticate and enroll the local Device; administration is not a CLI command family. If a self-service operation (revoke own device, rotate own token) is exposed in the CLI, it is scoped to the caller's own Principal, never to another User.

## Sequencing

The order is forced by dependency, not preference:

1. **Server identity first.** Accounts, Devices, tokens, and scopes are the single source; no client surface can precede them.
2. **Authentication in existing clients follows immediately and is mandatory.** A user-scoped server that no client can authenticate against is unusable, and the CLI Device Agent cannot enroll a machine without it. App, TUI, Desktop, and CLI therefore gain a login path and a minimum identity surface — and the CLI gains Device enrollment — before any administration UI exists.
3. **A dedicated administration client is conditional.** It is justified only when the administration audience or deployment differs from that of the users. When administrators are the same people as users, a dedicated client duplicates a login shell for little benefit, and administration belongs in the clients that already exist.

The load moved off App and the CLI is therefore limited to administration, and only in that conditional case. Treating the dedicated client as a way to remove authentication from the other clients is not supportable: every client authenticates because every client acts as a Principal.

This record fixes the ordering constraint and the condition. The work items themselves live in issues, not here.

## Compatibility and Migration

- **Shared-secret mode is preserved.** A server with no Users configured behaves as today: one password, one implicit Principal with full scope. `ServerAuth.Config` remains the fallback.
- **Local placement is preserved.** `location.workspaceID` absent still means implicit local execution, exactly as `Environment.Service` decides today. Multi-user is opt-in at the server.
- **Database migration is additive.** New tables (`user`, `device`, `auth_session`, device credentials) are added; existing Session and Workspace rows receive a null/legacy owner that maps to the implicit Principal. The existing migration path (`database/v1-migration`, drizzle migrations) carries the change.
- **Protocol grows, it does not fork.** New Schema contracts (`User`, `Device`, `Principal`, `AuthSession`) and a new Protocol group are added; the shared-secret route set remains valid. Clients are regenerated with `bun run generate`; generated client behavior for existing operations is unchanged for the implicit Principal.
- **Dependency direction is unchanged.** Identity contracts live in Schema, behavior in Core, endpoints in Protocol, and concrete wiring in Server, per the package boundary rules.

## Failure Modes

Concrete behaviors this decision fixes.

- **Cross-user event leak.** A connection with no resolvable Principal is rejected before subscribing; selection happens server-side before encoding. The feed must never fall back to delivering unfiltered events.
- **Device Agent unreachable.** Placement on that Device fails with an explicit error at the affected Location. The server must **not** fall back to running the work locally: silent local execution would read and write the wrong machine's filesystem. This is the most important fail-closed rule in this record.
- **Device revoked.** Tokens bound to that Device are invalidated and Sessions placed there stop; other Devices of the same User are unaffected.
- **Server unreachable.** The Agent does not execute queued work. Offline execution is deferred rather than partially supported.
- **Principal authenticated but unauthorized.** Denial is a normal authorization result (403), distinct from missing/invalid credentials (401), so clients can distinguish "sign in" from "not permitted".

## Alternatives Considered

- **Central server with direct filesystem access to device machines.** Rejected. It requires inbound access or mounts on every device, weakens isolation, and makes the server the reader of every user's filesystem.
- **Per-device server with identity synchronization.** Rejected for this decision. Folders are local and no Agent is needed, but histories and state must merge across machines, with conflicts and duplicate execution. It remains a possible simpler variant when a device is also the only server host, and is the reason local placement stays first-class.
- **One shared password plus an owner column.** Rejected. It adds ownership without identity: no per-user revocation, no attribution, no scope.
- **Global feed with client-side filtering.** Rejected. It emits one user's data to another user's socket before any client can filter.
- **Extending `@opencode/app` and the CLI with management.** Rejected. The end-user app and the CLI carry unrelated release surfaces and audiences; embedding management there couples them and grows bundles the majority of users never exercise.
- **Extending `experimental.policies` with principals instead of a real identity layer.** Rejected as the primary mechanism. Policy conditions can express restrictions once identity exists; they cannot create it.

## Security Boundaries

- The Device Agent is not a sandbox. It exposes the device user's privileges by design.
- Compromise of the central server reaches every enrolled Device within each Principal's scopes. Scopes are coarse; they limit breadth, not blast radius within a scope.
- Credentials and integration secrets remain a distinct store; per-user scoping of credentials is deferred and does not follow automatically from this record.
- An Agent holds device credentials, so device credentials must be individually revocable and rotation must be possible without re-enrolling every other device.

## Deferred

Organizations, membership, and roles; OIDC/SSO and MFA; per-user provider credentials; offline Agent queuing and conflict resolution; audit export and retention; quotas and rate limiting; multi-region placement.

## Verification

Consistent with package guidance:

- A second Principal cannot list, read, subscribe to, or delete the first Principal's Sessions, Workspaces, events, or logs; the negative case is the contract.
- A Device Agent that is unreachable causes placement to fail and never executes locally.
- Revoking a device invalidates only that device's authority.
- Shared-secret mode and implicit-local placement are covered as compatibility contracts, not regressions.
- Each existing client (App, TUI, Desktop, CLI) can authenticate as a Principal and enroll its own Device, while administration operations are rejected for a Principal without management scope.
- Protocol changes are followed by `bun run generate`, and generated-output drift is checked. Agent protocol tests drive the real Agent, without mocks.

## Open Questions

- Whether device enrollment is initiated from the device or from an already-authenticated browser session.
- Whether a Device may be shared by more than one User, and what ownership means for a shared machine.
- How Session forking and subagent Sessions inherit ownership.
- Whether `Project` identity should be per-user or shared per directory on a Device.
- How the admin app discovers the server it manages: fixed configuration, a connect screen like the end-user app's server registry, or discovery served by the server itself.
- Which self-service operations (own password, own Devices, own sessions) belong in App, TUI, and Desktop versus only the CLI.

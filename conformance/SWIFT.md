# Running the vectors from Swift

The vectors are JSON on purpose: `JSONDecoder` reads them, `vitest` reads
them, and neither side needs the other's toolchain. This is what a Swift
consumer does with them.

## Getting the files

There is no Swift package to depend on — this repository ships JSON and
TypeScript. Pick whichever is cheapest for your project:

1. **Copy or submodule `vectors/` into your test target's resources.** Zero
   production code change; the vectors travel with your test bundle.
2. **A git submodule pinned to a tag**, if you want the version to be visible
   in your lockfile.

Add them as `.copy("vectors")` in the test target's `resources:` so
`Bundle.module.url(forResource:withExtension:subdirectory:)` finds them.

## The shape

```swift
struct Vector: Decodable {
    struct Source: Decodable { let repo: String; let file: String?; let tests: [String]? }
    struct Step: Decodable {
        let t: Int                        // milliseconds from 0
        let `in`: [String: AnyCodable]
        let expect: [String: AnyCodable]
        let note: String?
    }
    let suite: String
    let id: String
    let source: Source
    let steps: [Step]
    let note: String?
}
```

`t` is a plain integer offset. Map it onto your clock once at the top of each
vector — `t0.advanced(by: .milliseconds(step.t))` — and the same file drives
`ContinuousClock` in Swift and a number in JavaScript.

## Sticky (M1) — no production change needed

`StickyModifierState` already **is** this contract, and its API lines up one
to one:

| vector op | call |
|---|---|
| `tap` | `state.tap(mod, at: t0 + t)` |
| `consume` | `state.consumeAfterNonModifierEmission()` |
| `clear` | `state.clear()` |
| `noop` | — |

Assert `expect.slots` against `state.slot(for:)` and `expect.active` against
`state.activeModifiers` (sort it — the vectors use a canonical order, a
`Set` does not have one).

Modifiers your app does not implement simply do not appear in a vector's
`expect.slots`; most sticky vectors are written on `control` and `alt` for
exactly that reason.

## Cadence (M2) — no production change needed

`AccessoryKeyRepeatCadence` maps the same way. Its `Tick` carries
`emit` and `nextTickAt`; the vectors express the same thing as an ordered
intent list, so flatten:

```swift
func intents(_ tick: Cadence.Tick, key: AccessoryKey?, t0: Instant) -> [Intent] {
    var out: [Intent] = []
    if let e = tick.emit { out.append(.emitKey(e.id, mods)) }
    if let n = tick.nextTickAt { out.append(.scheduleTick(ms: n - t0)) }
    return out
}
```

`release()` returns nothing in Swift; the vector expects a single
`clear-schedule` when a key was held and an empty list when none was. Emit
that from the adapter, not from the type.

The key ids in the vectors are catalog ids (`arrowLeft`, `escape`). Map them
to your `AccessoryKey` cases in the adapter; a vector naming a key your app
does not have should **skip that vector**, not rewrite it.

## Flush (M4) — no production change needed for the pure function

`AccessoryControlFlushBarrier.steps(hasMarkedText:pendingFlush:)` is the
function the `flush` suite drives. `pending` maps
`not-needed → .notNeeded`, `succeeded → .succeeded`, `failed → .failed`.

**Read this before you claim the app uses the shared contract.** In at least
one consumer, `steps()` is called only by its own tests: production commits
marked text in the view and waits on the in-flight insert in the model, and
those two call sites can drift from the table the vectors pin. A green
conformance run means *the function agrees*; it does not mean the call sites
go through it. Say which of those two you have.

## Composition (M3) — needs a small adapter

There is no existing Swift type for this one, and the vectors deliberately do
not drive a remote-caret window: that machine models an insertion point that
can move and an insert that can fail, neither of which generalizes.

The adapter is small — feed `hasMarkedText` transitions in as
`compose-start` / `compose-update`, and a marked→unmarked transition with its
committed snapshot as `compose-end`:

```swift
if hasMarked && !wasMarked { gate.next(.composeStart) }
else if hasMarked          { gate.next(.composeUpdate(text: marked)) }
else if wasMarked          { gate.next(.composeEnd(text: committedDelta)) }
```

If you would rather not add the type, skip the `composition` suite and say so
in your test target. A skipped suite that is *named* is honest; a harness that
silently skips what it cannot run is the failure this whole arrangement
exists to prevent — which is why the TypeScript harness fails on an unknown
suite instead of ignoring it.

## Wiring it into CI

Run it from day one, before the other implementation starts depending on the
shared machines. The drift this arrangement prevents is not dramatic: it is
one constant, changed for a good local reason, that nobody notices until two
apps behave differently on the one axis a user can feel.

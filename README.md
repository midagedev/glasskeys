# glasskeys

The state machines behind a keyboard drawn on glass.

Keys on glass are not keys. There is no Ctrl you can hold down, nothing
repeats while you press it, there is no Escape at all, and an IME builds one
character out of several events before any of it is real. Whatever reads
those keystrokes — a VNC server, a shell, a remote editor, a local canvas —
expects a keyboard. Every app that bridges that gap ends up writing the same
four state machines, and each one has a boundary that is easy to get almost
right.

This package is those four machines, plus the golden vectors that pin them,
so a second implementation in a second language cannot quietly drift.

```
npm i glasskeys
```

## What is in here

| | |
|---|---|
| **M1 · sticky modifiers** | `idle → armed → locked` per modifier, with a 400 ms double-tap window. A tap never emits; it changes what the *next* key means. |
| **M2 · hold-to-repeat** | One emission on touch-down, then 400 ms, then every 45 ms. Clock-injected; the machine owns no timer. |
| **M3 · composition gate** | While an IME is composing, withhold; on commit, emit once. Four abstract events, so a DOM app and a UIKit app feed the same machine. |
| **M4 · flush barrier** | Commit what is held *before* emitting a control key, and drop the control if the flush failed. |
| **catalog** | `catalog/keys.json` — key identity and which keys repeat. Data, readable from any language. |
| **vectors** | `vectors/**/*.json` — the specification. See below. |

## What is deliberately not in here

**No encoder.** The machines output *intents* — "emit key `escape` with
`control`" — and each app turns an intent into wire format. That line is
where it is because there is genuinely nothing shared below it: one consumer
wraps a chord of X11 keysyms in an RFB `KeyEvent` (four messages for a
modified key), the other writes a single control byte into a PTY. Not just
different constants — a different *shape*. A package that tried to own
"Ctrl-C" would have to be wrong for one of them.

**No transport, no UI, no layout.** Labels, glyphs, strip order, accessible
copy, key-bar widths, clipboard adapters, helper processes: all of that
belongs to the app, and a shared version would force one app's chrome onto
the other.

**No buffered-compose mode, no remote-caret reconciliation.** Both exist in
one of the consuming apps and neither generalizes. A smaller true core beats
a larger aspirational one.

## Using it

```ts
import { StickyModifiers, RepeatCadence, CompositionGate, barrierSteps, repeatable } from 'glasskeys'

const sticky = new StickyModifiers()
const cadence = new RepeatCadence({ repeatable })

// A modifier tap emits nothing — that is the machine's whole point.
sticky.tap('control', performance.now())

// A key press carries whatever is armed or locked right now.
for (const intent of cadence.press('arrowLeft', performance.now(), sticky.activeModifiers())) {
  if (intent.op === 'emit-key') myEncoder.key(intent.key, intent.mods)
  if (intent.op === 'schedule-tick') scheduleAt(intent.atMs)
}

// Consume only after the emission actually happened. An emission that was
// withheld, dropped or failed must leave the modifier armed.
sticky.consume()
```

Before sending a control key while text might still be composing, go through
the barrier rather than sending directly:

```ts
for (const step of barrierSteps({ key: 'escape', hasMarked: gate.composing, pending: 'not-needed' })) {
  if (step.op === 'commit-marked') commitLocalComposition()
  if (step.op === 'emit-key') myEncoder.key(step.key, step.mods)
  if (step.op === 'drop-control') { /* the text never landed; do not send */ }
}
```

An app whose text insertion cannot fail — anything writing straight to the
far end — passes `pending: 'not-needed'` forever and never sees the failure
branch. It costs that app nothing and it is the reason the other app's
ordering bug cannot come back.

## The vectors are the specification

`vectors/**/*.json` is what this package actually promises. `src/` is one
implementation of it; a Swift target is another. There is no shared compiled
artifact between a TypeScript app and a Swift app and there cannot be, so the
only thing keeping two implementations honest is a set of files both can
read and both must pass.

Each vector is a sequence of inputs at explicit millisecond times and the
exact intents expected out, and each one names where its behaviour came
from:

```json
{
  "suite": "sticky",
  "id": "lock-boundary-is-inclusive-at-400",
  "source": { "repo": "naru-remote", "file": "…/StickyModifierStateTests.swift",
              "tests": ["testDoubleTapAtExactly400MillisLocks"] },
  "steps": [
    { "t": 0,   "in": { "op": "tap", "mod": "control" }, "expect": { "slots": { "control": "armed" } } },
    { "t": 400, "in": { "op": "tap", "mod": "control" }, "expect": { "slots": { "control": "locked" } } }
  ]
}
```

Provenance is enforced, not decorative. A vector with no `source.repo` fails
the suite, one that names no tests must say `"composed": true` instead, and
`npm run check:provenance` opens the cited files and looks for the cited test
names — a paraphrase that cannot be followed is the same dead end as no
citation at all. (That check needs the consuming repos on the machine; where
they are absent it says so, with a count, rather than passing quietly.) A
behaviour nobody measured looks identical to one somebody invented, six
months later.

`vectors/MANIFEST.json` lists the set. A consumer that copies these files
into another language's test bundle asserts its loaded vectors against it, so
a dropped file is a failure rather than a smaller green run — a smaller green
run being indistinguishable from a complete one.

`npm test` runs them against `src/`. `conformance/SWIFT.md` shows how an
XCTest target runs the same files against Swift types — with, for the
machines this was lifted from, **no production code change at all**.

### Adding one

Add the JSON file and run `npm run manifest`. The harness discovers vectors
by directory and **fails on a suite it has no runner for**, rather than
skipping it — a harness that silently skipped unknown suites would report
green while pinning nothing.

## The numbers, and why they are not options

`LOCK_WINDOW_MS = 400`, `INITIAL_DELAY_MS = 400`, `REPEAT_INTERVAL_MS = 45`.

These are measured values from the app this was first shipped in, not
preferences. They are constants rather than configuration for a specific
reason: a value that differed between two consumers would make the shared
vectors unrunnable, and the vectors are the only thing holding the two
implementations together.

## Releasing

Bump `version` in `package.json`, then push the matching tag:

```
git tag v0.1.1 && git push origin v0.1.1
```

`.github/workflows/release.yml` re-runs every gate, refuses a tag that
disagrees with `package.json`, and publishes with `--provenance`, so the
tarball on npm carries a verifiable link back to the commit and the workflow
that built it. It needs one repository secret, `NPM_TOKEN` — a granular
access token scoped to this package, write, with 2FA bypass. `workflow_dispatch`
runs the whole thing without publishing.

Publishing from a laptop works and produces no provenance, which is the
reason not to.

## Provenance

The machines are lifted from **naru-remote**'s `RemoteInputDock`, where they
were matured over many rounds against a real VNC session, and generalized so
a second consumer — **gadak**'s phone companion, which drives a PTY — runs
the same decisions instead of a lesser copy of them.

The two apps' encoders stay where they are. That was the finding that
decided the shape of this package.

## License

MIT.

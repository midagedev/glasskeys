import { describe, expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CompositionGate,
  RepeatCadence,
  StickyModifiers,
  barrierSteps,
  repeatable,
  type Intent,
  type ModifierId,
} from '../src/index.js'

/*
 * The conformance harness.
 *
 * The vectors under `vectors/` — not this file, and not `src/` — are the
 * specification. This runs them against the TypeScript implementation; a
 * Swift target runs the same files against its own types (see
 * `conformance/SWIFT.md`). That is the entire mechanism keeping two
 * implementations in two languages from drifting: there is no shared
 * compiled artifact and there cannot be one.
 *
 * A vector that only one side can run is a vector that stops being a
 * contract the first time somebody is in a hurry, so the harness fails
 * loudly on a suite it does not know rather than skipping it.
 */

const here = dirname(fileURLToPath(import.meta.url))
const vectorsDir = join(here, '..', 'vectors')

type Step = {
  t: number
  in: Record<string, unknown>
  expect: Record<string, unknown>
  note?: string
}
type Vector = {
  suite: string
  id: string
  source: { repo: string; file?: string; tests?: string[] }
  steps: Step[]
  note?: string
}

function loadVectors(): Vector[] {
  const out: Vector[] = []
  for (const suite of readdirSync(vectorsDir)) {
    const dir = join(vectorsDir, suite)
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue
      const v = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Vector
      if (v.suite !== suite)
        throw new Error(`${suite}/${file}: suite field is "${v.suite}"`)
      out.push(v)
    }
  }
  return out
}

const vectors = loadVectors()

const mods = (s: Step['in'] | Step['expect']): ModifierId[] =>
  ((s.mods as ModifierId[]) ?? [])

function runSticky(v: Vector): void {
  const st = new StickyModifiers()
  for (const [i, step] of v.steps.entries()) {
    const where = `${v.id} step ${i} (t=${step.t})`
    const op = step.in.op
    if (op === 'tap') st.tap(step.in.mod as ModifierId, step.t)
    else if (op === 'consume') st.consume()
    else if (op === 'clear') st.clear()
    else if (op === 'noop') void 0
    else throw new Error(`${where}: unknown sticky op "${String(op)}"`)

    if (step.expect.slots) {
      const snap = st.snapshot()
      for (const [m, want] of Object.entries(step.expect.slots as object))
        expect(snap[m as ModifierId], `${where}: slot ${m}`).toBe(want)
    }
    if (step.expect.active)
      expect(st.activeModifiers(), `${where}: active`).toEqual(step.expect.active)
  }
}

function runCadence(v: Vector): void {
  const cad = new RepeatCadence({ repeatable })
  for (const [i, step] of v.steps.entries()) {
    const where = `${v.id} step ${i} (t=${step.t})`
    let got: Intent[]
    const op = step.in.op
    if (op === 'press') got = cad.press(step.in.key as string, step.t, mods(step.in))
    else if (op === 'tick') got = cad.tick(step.t, mods(step.in))
    else if (op === 'release') got = cad.release()
    else if (op === 'stop') {
      cad.stop()
      got = []
    } else throw new Error(`${where}: unknown cadence op "${String(op)}"`)

    if (step.expect.intents)
      expect(got, `${where}: intents`).toEqual(step.expect.intents)
    if ('held' in step.expect)
      expect(cad.heldKey, `${where}: held`).toBe(step.expect.held)
  }
}

function runFlush(v: Vector): void {
  for (const [i, step] of v.steps.entries()) {
    const where = `${v.id} step ${i}`
    if (step.in.op !== 'control')
      throw new Error(`${where}: unknown flush op "${String(step.in.op)}"`)
    const got = barrierSteps({
      key: step.in.key as string,
      mods: mods(step.in),
      hasMarked: step.in.hasMarked as boolean,
      pending: step.in.pending as 'not-needed' | 'succeeded' | 'failed',
    })
    expect(got, `${where}: intents`).toEqual(step.expect.intents)
  }
}

function runComposition(v: Vector): void {
  const gate = new CompositionGate()
  for (const [i, step] of v.steps.entries()) {
    const where = `${v.id} step ${i}`
    const op = step.in.op as string
    if (!['compose-start', 'compose-update', 'compose-end', 'plain'].includes(op))
      throw new Error(`${where}: unknown composition op "${op}"`)
    const got = gate.next(
      { type: op, text: step.in.text as string } as never,
      mods(step.in),
    )
    if (step.expect.intents)
      expect(got, `${where}: intents`).toEqual(step.expect.intents)
    if ('composing' in step.expect)
      expect(gate.composing, `${where}: composing`).toBe(step.expect.composing)
  }
}

const RUNNERS: Record<string, (v: Vector) => void> = {
  sticky: runSticky,
  cadence: runCadence,
  flush: runFlush,
  composition: runComposition,
}

describe('golden vectors', () => {
  test('every vector belongs to a suite this harness can run', () => {
    // The failure mode this closes: a new suite is added, the harness has no
    // runner for it, and a `for…of` that skipped unknown suites reports the
    // whole run green while pinning nothing.
    const unknown = [...new Set(vectors.map((v) => v.suite))].filter((s) => !(s in RUNNERS))
    expect(unknown, 'suites with no runner').toEqual([])
    expect(vectors.length, 'vectors loaded').toBeGreaterThan(0)
  })

  for (const v of vectors) {
    test(`${v.suite}/${v.id}`, () => {
      RUNNERS[v.suite](v)
    })
  }
})

describe('vector hygiene', () => {
  test('every vector names where its behaviour came from', () => {
    // A vector with no provenance is a behaviour somebody invented, and the
    // next person cannot tell it from one that was measured.
    for (const v of vectors) {
      expect(v.source?.repo, `${v.suite}/${v.id}: source.repo`).toBeTruthy()
      expect(v.steps.length, `${v.suite}/${v.id}: steps`).toBeGreaterThan(0)
    }
  })

  test('ids are unique across suites', () => {
    const ids = vectors.map((v) => `${v.suite}/${v.id}`)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

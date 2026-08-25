import type { Intent, KeyId, ModifierId } from './types.js'

/*
 * M4 — the flush barrier.
 *
 * The bug this closes is easy to miss and impossible to unsee. A person is
 * mid-composition — a Korean syllable half built — and taps Esc on the key
 * bar. Two things are now racing: the local IME still holds an uncommitted
 * character, and a control byte is on its way to the far end. Whichever
 * order they land in, one of them is wrong: either the escape arrives inside
 * the word, or the word arrives after the escape that was meant to cancel
 * whatever came before it.
 *
 * The order is: commit what is held, *then* emit the control. Never the
 * reverse, and never both at once.
 *
 * The second half is about apps whose text insertion can fail. naru-remote
 * inserts through a helper process or the clipboard, and either can lose;
 * when the flush fails, the control is dropped rather than sent on top of
 * text that never arrived. An app writing into a PTY has no such failure —
 * `pending: 'not-needed'` is its permanent answer, and the branch costs it
 * nothing.
 *
 * Note what is *not* here: sticky state. A dropped control does not spend an
 * armed modifier, because from the user's point of view the key never
 * happened.
 */

export type PendingFlush = 'not-needed' | 'succeeded' | 'failed'

export type BarrierInput = {
  key: KeyId
  mods?: ModifierId[]
  /** True when a local composition is still open. */
  hasMarked: boolean
  /**
   * Whether an in-flight text insertion has landed. An app that writes
   * directly to the far end passes `'not-needed'` and never sees the
   * failure branch.
   */
  pending: PendingFlush
}

/**
 * The ordered steps for one control-key press. Execute them in order; a
 * caller that reorders them has reintroduced the race.
 */
export function barrierSteps(input: BarrierInput): Intent[] {
  const steps: Intent[] = []
  if (input.hasMarked) steps.push({ op: 'commit-marked' })
  steps.push(
    input.pending === 'failed'
      ? { op: 'drop-control' }
      : { op: 'emit-key', key: input.key, mods: input.mods ?? [] },
  )
  return steps
}

/**
 * The same decision as a boolean, for a call site that has already committed
 * the composition and only needs to know whether to send.
 *
 * Kept as its own export rather than as a comment on `barrierSteps` because
 * both shapes exist in the wild: one call site builds a step list, the other
 * awaits an in-flight insert and then asks a yes/no question.
 */
export function shouldEmitAfterFlush(pending: PendingFlush): boolean {
  return pending !== 'failed'
}

import type { Intent, ModifierId } from './types.js'

/*
 * M3 — the composition gate.
 *
 * An IME builds one character out of several keystrokes. Typing 안 is three
 * events that mean one syllable, and the intermediate states are candidates
 * the user has not chosen yet. Forward them and the far end receives ㅇ, ㅏ,
 * 안 — the word arrives three times over, each time wrong.
 *
 * So the rule is: while a composition is open, emit nothing; when it
 * commits, emit the committed text once. That is the entire machine, and it
 * is short enough that both apps had "almost" written it — which is exactly
 * why it is here, because the interesting part is the cases where "almost"
 * is wrong:
 *
 *   - An update never latches `composing`. A platform that sends an update
 *     without a start (some Android keyboards) must not leave the gate stuck
 *     open forever.
 *   - A commit with empty text is a *dismissed candidate*, not an empty
 *     insert. Emit nothing, but do clear the gate.
 *   - A stray commit with no start still clears and still emits. Refusing it
 *     loses a real character on any platform whose start event is optional.
 *
 * The events are deliberately not DOM events and not UIKit's marked-text
 * range. Each app adapts its own platform to these four, and the vectors
 * then run against both.
 */

export type CompositionEvent =
  | { type: 'compose-start' }
  /** A candidate. Never emitted; never latches the gate. */
  | { type: 'compose-update'; text: string }
  /** Committed. Empty text means the candidate was dismissed. */
  | { type: 'compose-end'; text: string }
  /** A plain insert, from a keyboard that is not composing. */
  | { type: 'plain'; text: string }

export class CompositionGate {
  private open = false

  get composing(): boolean {
    return this.open
  }

  /**
   * `mods` are the sticky modifiers active right now (M1). They ride the
   * committed text, which sounds odd until you remember that on a shell
   * Ctrl-armed followed by a typed letter is how a person sends Ctrl-C from
   * a touchscreen.
   */
  next(ev: CompositionEvent, mods: ModifierId[] = []): Intent[] {
    switch (ev.type) {
      case 'compose-start':
        this.open = true
        return [{ op: 'withhold' }]
      case 'compose-update':
        // Not `this.open = true`. See the header: an update without a start
        // must not be able to wedge the gate.
        return [{ op: 'withhold' }]
      case 'compose-end':
        this.open = false
        return ev.text === '' ? [] : [{ op: 'emit-text', text: ev.text, mods }]
      case 'plain':
        return this.open ? [{ op: 'withhold' }] : [{ op: 'emit-text', text: ev.text, mods }]
    }
  }

  /** Session teardown. A gate left open across a reconnect swallows input. */
  reset(): void {
    this.open = false
  }
}

import { MODIFIER_IDS, sortMods, type ModifierId } from './types.js'

/*
 * M1 — sticky modifiers.
 *
 * A touchscreen has no Ctrl key you can hold while pressing another one, so
 * every remote-input app has to invent a way to say "the next key is
 * modified". The naive version — a toggle — runs out immediately: you cannot
 * hold Ctrl across several keys without re-tapping it every time, and you
 * cannot tell "armed for one key" apart from "held".
 *
 * The version that survives contact is three states per modifier, each slot
 * independent:
 *
 *   idle   — not applied to anything
 *   armed  — applied to the next non-modifier emission, then released
 *   locked — applied until the modifier is tapped again
 *
 * with a double-tap inside LOCK_WINDOW_MS promoting armed → locked. That is
 * naru-remote's machine (`StickyModifierState.swift`), measured and shipped;
 * this is the same machine in TypeScript, and the golden vectors under
 * `vectors/sticky/` are lifted from its XCTest suite so neither
 * implementation can drift without the other going red.
 *
 * The boundary that matters: a modifier tap emits nothing, ever. It changes
 * what the *next* key means. Reading `activeModifiers()` and then calling
 * `consume()` is how a caller applies that, and the two steps are separate
 * because "which mods" and "the emission happened" are answered at different
 * moments in every app that has tried this.
 */

export type SlotState = 'idle' | 'armed' | 'locked'

/**
 * The double-tap window. 400 ms, inclusive at the boundary: a second tap at
 * exactly 400 locks, at 401 it re-arms.
 *
 * Not a tunable. It came from measurement on the app this machine was first
 * shipped in, and a value that differs between the two apps would make the
 * shared vectors unrunnable — which is the only thing keeping them honest.
 */
export const LOCK_WINDOW_MS = 400

export class StickyModifiers {
  private slots = new Map<ModifierId, SlotState>()
  private lastTapMs = new Map<ModifierId, number>()

  slot(mod: ModifierId): SlotState {
    return this.slots.get(mod) ?? 'idle'
  }

  /** Every modifier that is armed or locked, in canonical order. */
  activeModifiers(): ModifierId[] {
    return sortMods(MODIFIER_IDS.filter((m) => this.slot(m) !== 'idle'))
  }

  /**
   * The user tapped a modifier. Emits nothing by construction — this is the
   * whole point of the machine.
   *
   * `nowMs` is injected rather than read from a clock so the 400 ms boundary
   * is testable without sleeping, and so a replayed vector produces the same
   * answer on both platforms.
   */
  tap(mod: ModifierId, nowMs: number): void {
    const current = this.slot(mod)
    if (current === 'locked') {
      this.slots.set(mod, 'idle')
      this.lastTapMs.delete(mod)
      return
    }
    if (current === 'armed') {
      const last = this.lastTapMs.get(mod)
      // Outside the window this is a fresh single tap, not a failed lock:
      // the timestamp moves so a third tap within 400 ms of *this* one can
      // still lock. Dropping that detail makes a slow double-tap unlockable
      // forever, which is how it reads to a person who tapped a bit late.
      this.slots.set(mod, last !== undefined && nowMs - last <= LOCK_WINDOW_MS ? 'locked' : 'armed')
      this.lastTapMs.set(mod, nowMs)
      return
    }
    this.slots.set(mod, 'armed')
    this.lastTapMs.set(mod, nowMs)
  }

  /**
   * Call after a non-modifier emission actually happened. Armed slots are
   * spent; locked slots survive.
   *
   * Deliberately not folded into a "press" method: an emission can fail, be
   * dropped by the flush barrier (M4), or be withheld by a composition (M3),
   * and in those cases the modifier must still be armed afterwards. Every
   * app that merged the two ended up spending modifiers on keys that never
   * left the device.
   */
  consume(): void {
    for (const m of MODIFIER_IDS) {
      if (this.slot(m) === 'armed') {
        this.slots.set(m, 'idle')
        this.lastTapMs.delete(m)
      }
    }
  }

  /**
   * Panic clear — everything to idle.
   *
   * This is not housekeeping. A locked modifier the user has forgotten about
   * is the worst failure mode this machine has: on a shell, a stuck Ctrl
   * turns ordinary typing into a stream of control codes and the way out is
   * itself a control code. Any UI that offers lock must also offer this.
   */
  clear(): void {
    for (const m of MODIFIER_IDS) this.slots.set(m, 'idle')
    this.lastTapMs.clear()
  }

  /** Every slot, for tests and debug surfaces. */
  snapshot(): Record<ModifierId, SlotState> {
    const out = {} as Record<ModifierId, SlotState>
    for (const m of MODIFIER_IDS) out[m] = this.slot(m)
    return out
  }
}

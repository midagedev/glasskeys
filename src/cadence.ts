import type { Intent, KeyId, ModifierId } from './types.js'

/*
 * M2 — hold-to-repeat for an on-screen key.
 *
 * A hardware arrow key repeats when held. An on-screen one does not, unless
 * somebody writes this, and its absence is felt immediately: moving a cursor
 * across a line of a shell becomes forty separate taps.
 *
 * The cadence is 400 ms before the first repeat, then every 45 ms. Those two
 * numbers are measured, not chosen — they come from the reference app whose
 * feel this was matched against — and they are shared here precisely so the
 * two apps cannot drift apart on the one axis a user would notice.
 *
 * Not every key may repeat. Arrows and Delete may; Escape, Tab, Home, End and
 * the function keys fire once, because holding them is destructive rather
 * than useful. That set lives in `catalog/keys.json`, not here.
 *
 * The machine owns no timer. It returns `schedule-tick` intents with an
 * absolute time and expects the caller to come back with `tick(nowMs)`. That
 * is what makes it testable at the 399/400 boundary, and what lets one
 * implementation run on `setTimeout` and the other on a Swift `Task.sleep`.
 */

/** Delay from touch-down to the first repeat. */
export const INITIAL_DELAY_MS = 400
/** Interval between repeats after the first. */
export const REPEAT_INTERVAL_MS = 45

export type CadenceKeys = {
  /** True when holding this key should repeat. From the catalog. */
  repeatable(key: KeyId): boolean
}

export class RepeatCadence {
  private held: KeyId | null = null
  private nextFireMs: number | null = null

  constructor(private readonly keys: CadenceKeys) {}

  get heldKey(): KeyId | null {
    return this.held
  }

  /**
   * Touch-down. **Always emits once**, repeatable or not — the first press
   * is the press, and delaying it to see whether a hold develops is the
   * latency people describe as "the keyboard feels laggy".
   *
   * `mods` are the sticky modifiers active at press time (M1). They ride
   * every repeat: holding Ctrl-armed left-arrow should not silently become
   * unmodified after the first one.
   */
  press(key: KeyId, nowMs: number, mods: ModifierId[] = []): Intent[] {
    this.stop()
    const emit: Intent = { op: 'emit-key', key, mods }
    if (!this.keys.repeatable(key)) return [emit]
    this.held = key
    this.nextFireMs = nowMs + INITIAL_DELAY_MS
    return [emit, { op: 'schedule-tick', atMs: this.nextFireMs }]
  }

  /**
   * An injected timer fired. Emits only once `nowMs` has reached the
   * deadline; an early tick re-reports the same deadline and emits nothing.
   *
   * A caller whose timer fires slightly early is normal (every platform's
   * timers are approximate), and a machine that emitted on any tick at all
   * would turn that jitter into a double keystroke.
   */
  tick(nowMs: number, mods: ModifierId[] = []): Intent[] {
    if (this.held === null || this.nextFireMs === null) return []
    if (nowMs < this.nextFireMs) return [{ op: 'schedule-tick', atMs: this.nextFireMs }]
    const key = this.held
    this.nextFireMs = nowMs + REPEAT_INTERVAL_MS
    return [
      { op: 'emit-key', key, mods },
      { op: 'schedule-tick', atMs: this.nextFireMs },
    ]
  }

  /** Finger up. */
  release(): Intent[] {
    if (this.held === null) return []
    this.stop()
    return [{ op: 'clear-schedule' }]
  }

  /**
   * Teardown — the strip unmounted, the session ended, the app went to the
   * background. Same effect as release, named differently because the call
   * sites are different and one of them is an error path.
   */
  stop(): void {
    this.held = null
    this.nextFireMs = null
  }
}

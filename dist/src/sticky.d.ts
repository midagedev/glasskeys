import { type ModifierId } from './types.js';
export type SlotState = 'idle' | 'armed' | 'locked';
/**
 * The double-tap window. 400 ms, inclusive at the boundary: a second tap at
 * exactly 400 locks, at 401 it re-arms.
 *
 * Not a tunable. It came from measurement on the app this machine was first
 * shipped in, and a value that differs between the two apps would make the
 * shared vectors unrunnable — which is the only thing keeping them honest.
 */
export declare const LOCK_WINDOW_MS = 400;
export declare class StickyModifiers {
    private slots;
    private lastTapMs;
    slot(mod: ModifierId): SlotState;
    /** Every modifier that is armed or locked, in canonical order. */
    activeModifiers(): ModifierId[];
    /**
     * The user tapped a modifier. Emits nothing by construction — this is the
     * whole point of the machine.
     *
     * `nowMs` is injected rather than read from a clock so the 400 ms boundary
     * is testable without sleeping, and so a replayed vector produces the same
     * answer on both platforms.
     */
    tap(mod: ModifierId, nowMs: number): void;
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
    consume(): void;
    /**
     * Panic clear — everything to idle.
     *
     * This is not housekeeping. A locked modifier the user has forgotten about
     * is the worst failure mode this machine has: on a shell, a stuck Ctrl
     * turns ordinary typing into a stream of control codes and the way out is
     * itself a control code. Any UI that offers lock must also offer this.
     */
    clear(): void;
    /** Every slot, for tests and debug surfaces. */
    snapshot(): Record<ModifierId, SlotState>;
}

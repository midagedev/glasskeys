import type { Intent, KeyId, ModifierId } from './types.js';
/** Delay from touch-down to the first repeat. */
export declare const INITIAL_DELAY_MS = 400;
/** Interval between repeats after the first. */
export declare const REPEAT_INTERVAL_MS = 45;
export type CadenceKeys = {
    /** True when holding this key should repeat. From the catalog. */
    repeatable(key: KeyId): boolean;
};
export declare class RepeatCadence {
    private readonly keys;
    private held;
    private nextFireMs;
    constructor(keys: CadenceKeys);
    get heldKey(): KeyId | null;
    /**
     * Touch-down. **Always emits once**, repeatable or not — the first press
     * is the press, and delaying it to see whether a hold develops is the
     * latency people describe as "the keyboard feels laggy".
     *
     * `mods` are the sticky modifiers active at press time (M1). They ride
     * every repeat: holding Ctrl-armed left-arrow should not silently become
     * unmodified after the first one.
     */
    press(key: KeyId, nowMs: number, mods?: ModifierId[]): Intent[];
    /**
     * An injected timer fired. Emits only once `nowMs` has reached the
     * deadline; an early tick re-reports the same deadline and emits nothing.
     *
     * A caller whose timer fires slightly early is normal (every platform's
     * timers are approximate), and a machine that emitted on any tick at all
     * would turn that jitter into a double keystroke.
     */
    tick(nowMs: number, mods?: ModifierId[]): Intent[];
    /** Finger up. */
    release(): Intent[];
    /**
     * Teardown — the strip unmounted, the session ended, the app went to the
     * background. Same effect as release, named differently because the call
     * sites are different and one of them is an error path.
     */
    stop(): void;
}

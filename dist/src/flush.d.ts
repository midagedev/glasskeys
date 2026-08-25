import type { Intent, KeyId, ModifierId } from './types.js';
export type PendingFlush = 'not-needed' | 'succeeded' | 'failed';
export type BarrierInput = {
    key: KeyId;
    mods?: ModifierId[];
    /** True when a local composition is still open. */
    hasMarked: boolean;
    /**
     * Whether an in-flight text insertion has landed. An app that writes
     * directly to the far end passes `'not-needed'` and never sees the
     * failure branch.
     */
    pending: PendingFlush;
};
/**
 * The ordered steps for one control-key press. Execute them in order; a
 * caller that reorders them has reintroduced the race.
 */
export declare function barrierSteps(input: BarrierInput): Intent[];
/**
 * The same decision as a boolean, for a call site that has already committed
 * the composition and only needs to know whether to send.
 *
 * Kept as its own export rather than as a comment on `barrierSteps` because
 * both shapes exist in the wild: one call site builds a step list, the other
 * awaits an in-flight insert and then asks a yes/no question.
 */
export declare function shouldEmitAfterFlush(pending: PendingFlush): boolean;

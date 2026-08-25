/**
 * The ordered steps for one control-key press. Execute them in order; a
 * caller that reorders them has reintroduced the race.
 */
export function barrierSteps(input) {
    const steps = [];
    if (input.hasMarked)
        steps.push({ op: 'commit-marked' });
    steps.push(input.pending === 'failed'
        ? { op: 'drop-control' }
        : { op: 'emit-key', key: input.key, mods: input.mods ?? [] });
    return steps;
}
/**
 * The same decision as a boolean, for a call site that has already committed
 * the composition and only needs to know whether to send.
 *
 * Kept as its own export rather than as a comment on `barrierSteps` because
 * both shapes exist in the wild: one call site builds a step list, the other
 * awaits an in-flight insert and then asks a yes/no question.
 */
export function shouldEmitAfterFlush(pending) {
    return pending !== 'failed';
}

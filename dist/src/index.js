/*
 * glasskeys — the state machines behind a keyboard drawn on glass.
 *
 * Four state machines and a key catalog. No encoder, no transport, no UI:
 * see README.md for why that line is where it is.
 */
export { MODIFIER_IDS, sortMods } from './types.js';
export { StickyModifiers, LOCK_WINDOW_MS } from './sticky.js';
export { RepeatCadence, INITIAL_DELAY_MS, REPEAT_INTERVAL_MS } from './cadence.js';
export { CompositionGate } from './composition.js';
export { barrierSteps, shouldEmitAfterFlush } from './flush.js';
export { catalog, catalogKeys, isCatalogKey, repeatable } from './catalog.js';
